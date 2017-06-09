const BER = require('asn1').Ber;
const util = require('util');

var APPLICATION = function(x) { return x | 0x60; };
var CONTEXT = function(x) { return x | 0xa0; };
var UNIVERSAL = function(x) { return x; };

const EMBER_SET = 0x20 | 17;
const EMBER_STRING = 12;

module.exports.GetDirectory = 32;

BER.Reader.prototype.getSequence = function(tag) {
    //var seq = this.readSequence(tag);
    //if(seq === null) return null;

    //var buf = this._buf.slice(this._offset, this._offset + this._len);

    var buf = this.readString(tag, true);
    return new BER.Reader(buf);
}

BER.Reader.prototype.readValue = function() {
    var tag = this.peek(tag);
    if(tag == EMBER_STRING) {
        return this.readString(EMBER_STRING);
    } else if(tag == UNIVERSAL(2)) {
        return this.readInt();
    } else if(tag == UNIVERSAL(9)) {
        // real, need to write decoder
        throw new UnimplementedEmberTypeError(tag);
    } else if(tag == UNIVERSAL(1)) {
        return this.readBoolean();
    } else if(tag == UNIVERSAL(4)) {
        return this.readString(UNIVERSAL(4), true);
    } else {
        throw new UnimplementedEmberTypeError(tag);
    }
}

/****************************************************************************
 * Root
 ***************************************************************************/

function Root() {
    Root.super_.call(this);
    this._parent = null;
};

util.inherits(Root, TreeNode);

Root.decode = function(ber) {
    var r = new Root();
    ber.readSequence(APPLICATION(0));
    var tag = ber.readSequence();

    if(tag == APPLICATION(11)) {
        r.elements = [];
        var seq = ber.getSequence(CONTEXT(0));
        while(seq.remain > 0) {
            r.addElement(RootElement.decode(seq));
        }
        
    } else {
        // StreamCollection APPLICATION(6)
        // InvocationResult APPLICATION(23)
        throw new UnimplementedEmberTypeError(tag);
    }
    return r;
}

Root.prototype.addElement = function(ele) {
    ele._parent = this;
    if(this.elements === undefined) {
        this.elements = [];
    }
    this.elements.push(ele);
}

Root.prototype.addChild = function(child) {
    this.addElement(child);
}

Root.prototype.encode = function(ber) {
    ber.startSequence(APPLICATION(0));

    if(this.elements !== undefined) {
        ber.startSequence(APPLICATION(11));
        ber.startSequence(CONTEXT(0));
        for(var i=0; i<this.elements.length; i++) {
            this.elements[i].encode(ber);
        }
        ber.endSequence(); // CONTEXT(0)
        ber.endSequence();
    }

    ber.endSequence(); // APPLICATION(0)
}

/*
Root.prototype.getDirectory = function(callback) {
    var r = this.getMinimal();
    r.addElement(new Command(32));
    return r;
}
*/

Root.prototype.getChildren = function() {
    if(this.elements !== undefined) {
        return this.elements;
    }
    return null;
}

module.exports.Root = Root;

/****************************************************************************
 * TreeNode (abstract)
 ***************************************************************************/

function TreeNode() {
    this._parent = null;
    this._single_callbacks = [];
    this._callbacks = []
}

TreeNode.prototype.addChild = function(child) {
    child._parent = this;
    if(this.children === undefined) {
        this.children = [];
    }
    this.children.push(child);
}

TreeNode.prototype.getMinimal = function() {
    return new this.constructor(this.number);
}

TreeNode.prototype.getTreeBranch = function(child) {
    var m = this.getMinimal();
    if(child !== undefined) {
        //console.log('addChild', child);
        m.addChild(child);
    }

    if(this._parent === null) {
        return m;
    } else {
        var p = this._parent.getTreeBranch(m);
        return p;
    }
}

TreeNode.prototype.getDirectory = function(callback) {
    if(callback !== undefined) {
        this._single_callbacks.push(callback);
    }
    return this.getTreeBranch(new Command(32));
}

TreeNode.prototype.getChildren = function() {
    if(this.children !== undefined) {
        return this.children;
    }
    return null;
}

TreeNode.prototype.getElementByNumber = function(index) {
    var children = this.getChildren();
    if(children === null) return null;
    for(var i=0; i<children.length; i++) {
        if(children[i].number === index) {
            return children[i];
        }
    }
    return null;
}

TreeNode.prototype.getElementByIdentifier = function(identifier) {
    var children = this.getChildren();
    if(children === null) return null;
    for(var i=0; i<children.length; i++) {
        if(children[i].contents !== undefined && 
          children[i].contents.identifier == identifier) {
            return children[i];
        }
    }
    return null;
}

TreeNode.prototype.getElement = function(id) {
    if(Number.isInteger(id)) {
        return this.getElementByNumber(id);
    } else {
        return this.getElementByIdentifier(id);
    }
}

TreeNode.prototype.update = function(other) {
    var self=this;
    var callbacks = [];
    while(this._single_callbacks.length > 0) {
        var cb = this._single_callbacks.shift();
        callbacks.push(() => {cb(self)});
    }

    for(var i=0; i<this._callbacks.length; i++) {
        var cb = this._callbacks[i];
        callbacks.push(() => {cb(self)});
    }

    return callbacks;
}

TreeNode.prototype.getNodeByPath = function(client, path, callback) {
    var self=this;
    
    if(path.length == 0) {
        callback(null, self);
        return;
    }
   
    console.log('searching: %s', path[0]);
    var child = self.getElement(path[0]);
    if(child !== null) {
        child.getNodeByPath(client, path.slice(1), callback);
    } else {
        console.log('getDirectory: %s', path[0]);
        client.sendBERNode(self.getDirectory((node) => {
            child = node.getElement(path[0]);
            if(child === null) {
                callback('invalid path');
                return;
            } else {
                child.getNodeByPath(client, path.slice(1), callback);
            }
        }));
    }
}

/****************************************************************************
 * RootElement
 ***************************************************************************/

function RootElement() {};

RootElement.decode = function(ber) {
    return Element.decode(ber);

    // TODO: handle qualified types
}

/****************************************************************************
 * Element
 ***************************************************************************/

function Element() {};

Element.decode = function(ber) {
    var tag = ber.peek();
    if(tag == APPLICATION(1)) {
        // Parameter
        return Parameter.decode(ber);
    } else if(tag == APPLICATION(3)) {
        // Node
        return Node.decode(ber);
    } else if(tag == APPLICATION(2)) {
        // Command
        return Command.decode(ber);
    } else if(tag == APPLICATION(13)) {
        // Matrix
        throw new UnimplementedEmberTypeError(tag);
    } else if(tag == APPLICATION(19)) {
        // Function
        throw new UnimplementedEmberTypeError(tag);
    } else if(tag == APPLICATION(24)) {
        // Template
        throw new UnimplementedEmberTypeError(tag);
    } else {
        throw new UnimplementedEmberTypeError(tag);
    }
}

/****************************************************************************
 * ElementCollection
 ***************************************************************************/



/****************************************************************************
 * Node
 ***************************************************************************/

function Node(number) {
    Node.super_.call(this);
    if(number !== undefined)
        this.number = number;
};

util.inherits(Node, TreeNode);

Node.decode = function(ber) {
    var n = new Node();
    ber = ber.getSequence(APPLICATION(3));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == CONTEXT(0)) {
            n.number = ber.readInt();
        } else if(tag == CONTEXT(1)) {
            n.contents = NodeContents.decode(ber);
        } else if(tag == CONTEXT(2)) {
            n.children = [];
            var seq = ber.getSequence(APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(CONTEXT(0));
                n.addChild(Element.decode(seq));
            }
        } else {
            throw new UnimplementedEmberTypeError(tag);
        }
    }
    return n;
}

Node.prototype.encode = function(ber) {
    ber.startSequence(APPLICATION(3));
    
    ber.startSequence(CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(CONTEXT(2));
        ber.startSequence(APPLICATION(4));
        ber.startSequence(CONTEXT(0));
        for(var i=0; i<this.children.length; i++) {
            this.children[i].encode(ber);
        }
        ber.endSequence();
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // APPLICATION(3)
}

Node.prototype.update = function(other) {
    callbacks = Node.super_.prototype.update.apply(this);
    if(other.contents !== undefined)
        this.contents = other.contents;
    return callbacks;
}

module.exports.Node = Node;

/****************************************************************************
 * NodeContents
 ***************************************************************************/

function NodeContents() {
    this.isOnline = true;
};

NodeContents.decode = function(ber) {
    var nc = new NodeContents();
    ber = ber.getSequence(EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == CONTEXT(0)) {
            nc.identifier = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(1)) {
            nc.description = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(2)) {
            nc.isRoot = ber.readBoolean();
        } else if(tag == CONTEXT(3)) {
            nc.isOnline = ber.readBoolean();
        } else if(tag == CONTEXT(4)) {
            nc.schemaIdentifiers = ber.readString(EMBER_STRING);
        } else {
            throw new UnimplementedEmberTypeError(tag);
        }
    }

    return nc;
}

NodeContents.prototype.encode = function(ber) {
    ber.startSequence(EMBER_SET);
    
    if(this.identifier !== undefined) {
        ber.startSequence(CONTEXT(0));
        ber.writeString(this.identifier, EMBER_STRING);
        ber.endSequence(); // CONTEXT(0)
    }
    
    if(this.description !== undefined) {
        ber.startSequence(CONTEXT(1));
        ber.writeString(this.description, EMBER_STRING);
        ber.endSequence(); // CONTEXT(1)
    }
    
    if(this.isRoot !== undefined) {
        ber.startSequence(CONTEXT(2));
        ber.writeBoolean(this.isRoot);
        ber.endSequence(); // CONTEXT(2)
    }
    
    if(this.isOnline !== undefined) {
        ber.startSequence(CONTEXT(3));
        ber.writeBoolean(this.isOnline);
        ber.endSequence(); // CONTEXT(3)
    }
    
    if(this.schemaIdentifiers !== undefined) {
        ber.startSequence(CONTEXT(4));
        ber.writeString(this.schemaIdentifiers, EMBER_STRING);
        ber.endSequence(); // CONTEXT(4)
    }

    ber.endSequence(); // EMBER_SET
}

module.exports.NodeContents = NodeContents;

/****************************************************************************
 * Command
 ***************************************************************************/

function Command(number) {
    if(number !== undefined)
        this.number = number;
}

Command.decode = function(ber) {
    var c = new Command();
    ber = ber.getSequence(APPLICATION(2));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == CONTEXT(0)) {
            c.number = ber.readInt();
        } else {
            // TODO: options
            throw new UnimplementedEmberTypeError(tag);
        }
    }

    return c;
}

Command.prototype.encode = function(ber) {
    ber.startSequence(APPLICATION(2));
    
    ber.startSequence(CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // CONTEXT(0)

    // TODO: options

    ber.endSequence(); // APPLICATION(2)
}

module.exports.Command = Command;

/****************************************************************************
 * Parameter
 ***************************************************************************/

function Parameter(number) {
    Parameter.super_.call(this);
    if(number !== undefined)
        this.number = number;
}

util.inherits(Parameter, TreeNode);

Parameter.decode = function(ber) {
    var p = new Parameter();
    ber = ber.getSequence(APPLICATION(1));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == CONTEXT(0)) {
            p.number = ber.readInt();
        } else if(tag == CONTEXT(1)) {
            p.contents = ParameterContents.decode(ber);
        } else if(tag == CONTEXT(2)) {
            p.children = [];
            var seq = ber.getSequence(APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(CONTEXT(0));
                p.addChild(Element.decode(seq));
            }
        } else {
            throw new UnimplementedEmberTypeError(tag);
        }
    }
    return p;
}

function ParameterContents() {};

ParameterContents.decode = function(ber) {
    var pc = new ParameterContents();
    ber = ber.getSequence(EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == CONTEXT(0)) {
            pc.identifier = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(1)) {
            pc.description = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(2)) {
            pc.value = ber.readValue();
        } else if(tag == CONTEXT(3)) {
            pc.minimum = ber.readValue();
        } else if(tag == CONTEXT(4)) {
            pc.maximum = ber.readValue();
        } else if(tag == CONTEXT(5)) {
            var a = ber.readInt();
            if(a == 0) {
                pc.access = 'none';
            } else if(a == 1) {
                pc.access = 'read';
            } else if(a == 2) {
                pc.access = 'write';
            } else if(a == 3) {
                pc.access = 'readWrite';
            } else {
                pc.access = 'read';
            }
        } else if(tag == CONTEXT(6)) {
            pc.format = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(7)) {
            pc.enumeration = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(8)) {
            pc.factor = ber.readInt();
        } else if(tag == CONTEXT(9)) {
            pc.isOnline = ber.readBoolean();
        } else if(tag == CONTEXT(10)) {
            pc.formula = ber.readString(EMBER_STRING);
        } else if(tag == CONTEXT(11)) {
            pc.step = ber.readInt();
        } else if(tag == CONTEXT(12)) {
            pc.default = ber.readValue();
        } else if(tag == CONTEXT(13)) {
            var t = ber.readInt();
            if(t == 1) {
                pc.type = 'integer';
            } else if(t == 2) {
                pc.type = 'real';
            } else if(t == 3) {
                pc.type = 'string';
            } else if(t == 4) {
                pc.type = 'boolean';
            } else if(t == 5) {
                pc.type = 'trigger';
            } else if(t == 6) {
                pc.type = 'enum';
            } else if(t == 7) {
                pc.type = 'octets';
            } else {
                pc.type = 'invalid';
            }
        } else if(tag == CONTEXT(14)) {
            pc.streamIdentifier = ber.readInt();
        } else if(tag == CONTEXT(15)) {
            pc.enumMap = StringIntegerCollection.decode(ber);
        } else if(tag == CONTEXT(16)) {
            // streamDescriptor
            throw new UnimplementedEmberTypeError(tag);
        } else if(tag == CONTEXT(17)) {
            pc.schemaIdentifiers = ber.readString(EMBER_STRING);
        } else {
            throw new UnimplementedEmberTypeError(tag);
        }
    }

    return pc;
}

/****************************************************************************
 * UnimplementedEmberType error
 ***************************************************************************/

function UnimplementedEmberTypeError(tag) {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    var identifier = (tag & 0xC0) >> 6;
    var value = (tag & 0x1F).toString();
    var tagStr = tag.toString();
    if(identifier == 0) {
        tagStr = "[UNIVERSAL " + value + "]";
    } else if(identifier == 1) {
        tagStr = "[APPLICATION " + value + "]";
    } else if(identifier == 2) {
        tagStr = "[CONTEXT " + value + "]";
    } else {
        tagStr = "[PRIVATE " + value + "]";
    }
    this.message = "Unimplemented EmBER type " + tagStr;
}

util.inherits(UnimplementedEmberTypeError, Error);

