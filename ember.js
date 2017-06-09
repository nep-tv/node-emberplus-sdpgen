const BER = require('./ber.js');
const errors = require('./errors.js');
const util = require('util');

module.exports.GetDirectory = 32;

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
    ber.readSequence(BER.APPLICATION(0));
    var tag = ber.readSequence();

    if(tag == BER.APPLICATION(11)) {
        r.elements = [];
        var seq = ber.getSequence(BER.CONTEXT(0));
        while(seq.remain > 0) {
            r.addElement(RootElement.decode(seq));
        }
        
    } else {
        // StreamCollection BER.APPLICATION(6)
        // InvocationResult BER.APPLICATION(23)
        throw new errors.UnimplementedEmberTypeError(tag);
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
    ber.startSequence(BER.APPLICATION(0));

    if(this.elements !== undefined) {
        ber.startSequence(BER.APPLICATION(11));
        ber.startSequence(BER.CONTEXT(0));
        for(var i=0; i<this.elements.length; i++) {
            this.elements[i].encode(ber);
        }
        ber.endSequence(); // BER.CONTEXT(0)
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(0)
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
    if(tag == BER.APPLICATION(1)) {
        // Parameter
        return Parameter.decode(ber);
    } else if(tag == BER.APPLICATION(3)) {
        // Node
        return Node.decode(ber);
    } else if(tag == BER.APPLICATION(2)) {
        // Command
        return Command.decode(ber);
    } else if(tag == BER.APPLICATION(13)) {
        // Matrix
        throw new errors.UnimplementedEmberTypeError(tag);
    } else if(tag == BER.APPLICATION(19)) {
        // Function
        throw new errors.UnimplementedEmberTypeError(tag);
    } else if(tag == BER.APPLICATION(24)) {
        // Template
        throw new errors.UnimplementedEmberTypeError(tag);
    } else {
        throw new errors.UnimplementedEmberTypeError(tag);
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
    ber = ber.getSequence(BER.APPLICATION(3));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            n.number = ber.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            n.contents = NodeContents.decode(ber);
        } else if(tag == BER.CONTEXT(2)) {
            n.children = [];
            var seq = ber.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(BER.CONTEXT(0));
                n.addChild(Element.decode(seq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return n;
}

Node.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(3));
    
    ber.startSequence(BER.CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        ber.startSequence(BER.CONTEXT(0));
        for(var i=0; i<this.children.length; i++) {
            this.children[i].encode(ber);
        }
        ber.endSequence();
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
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
    ber = ber.getSequence(BER.EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            nc.identifier = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            nc.description = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            nc.isRoot = ber.readBoolean();
        } else if(tag == BER.CONTEXT(3)) {
            nc.isOnline = ber.readBoolean();
        } else if(tag == BER.CONTEXT(4)) {
            nc.schemaIdentifiers = ber.readString(BER.EMBER_STRING);
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return nc;
}

NodeContents.prototype.encode = function(ber) {
    ber.startSequence(BER.EMBER_SET);
    
    if(this.identifier !== undefined) {
        ber.startSequence(BER.CONTEXT(0));
        ber.writeString(this.identifier, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(0)
    }
    
    if(this.description !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeString(this.description, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(1)
    }
    
    if(this.isRoot !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.writeBoolean(this.isRoot);
        ber.endSequence(); // BER.CONTEXT(2)
    }
    
    if(this.isOnline !== undefined) {
        ber.startSequence(BER.CONTEXT(3));
        ber.writeBoolean(this.isOnline);
        ber.endSequence(); // BER.CONTEXT(3)
    }
    
    if(this.schemaIdentifiers !== undefined) {
        ber.startSequence(BER.CONTEXT(4));
        ber.writeString(this.schemaIdentifiers, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(4)
    }

    ber.endSequence(); // BER.EMBER_SET
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
    ber = ber.getSequence(BER.APPLICATION(2));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            c.number = ber.readInt();
        } else {
            // TODO: options
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return c;
}

Command.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(2));
    
    ber.startSequence(BER.CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // BER.CONTEXT(0)

    // TODO: options

    ber.endSequence(); // BER.APPLICATION(2)
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
    console.log('Parameter.decode');
    var p = new Parameter();
    ber = ber.getSequence(BER.APPLICATION(1));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            p.number = ber.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            p.contents = ParameterContents.decode(ber);
        } else if(tag == BER.CONTEXT(2)) {
            p.children = [];
            var seq = ber.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(BER.CONTEXT(0));
                p.addChild(Element.decode(seq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    console.log(p.number);
    return p;
}

function ParameterContents() {};

ParameterContents.decode = function(ber) {
    console.log('ParameterContents.decode');
    var pc = new ParameterContents();
    ber = ber.getSequence(BER.EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            pc.identifier = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            pc.description = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            pc.value = ber.readValue();
        } else if(tag == BER.CONTEXT(3)) {
            pc.minimum = ber.readValue();
        } else if(tag == BER.CONTEXT(4)) {
            pc.maximum = ber.readValue();
        } else if(tag == BER.CONTEXT(5)) {
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
        } else if(tag == BER.CONTEXT(6)) {
            pc.format = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(7)) {
            pc.enumeration = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(8)) {
            pc.factor = ber.readInt();
        } else if(tag == BER.CONTEXT(9)) {
            pc.isOnline = ber.readBoolean();
        } else if(tag == BER.CONTEXT(10)) {
            pc.formula = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(11)) {
            pc.step = ber.readInt();
        } else if(tag == BER.CONTEXT(12)) {
            pc.default = ber.readValue();
        } else if(tag == BER.CONTEXT(13)) {
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
        } else if(tag == BER.CONTEXT(14)) {
            pc.streamIdentifier = ber.readInt();
        } else if(tag == BER.CONTEXT(15)) {
            pc.enumMap = StringIntegerCollection.decode(ber);
        } else if(tag == BER.CONTEXT(16)) {
            // streamDescriptor
            ber.getSequence(0x6c);
            //throw new errors.UnimplementedEmberTypeError(tag);
        } else if(tag == BER.CONTEXT(17)) {
            pc.schemaIdentifiers = ber.readString(BER.EMBER_STRING);
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return pc;
}


