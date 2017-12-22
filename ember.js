const BER = require('./ber.js');
const errors = require('./errors.js');
const util = require('util');
const Enum = require('enum');

const COMMAND_SUBSCRIBE     = 30;
const COMMAND_UNSUBSCRIBE   = 31;
const COMMAND_GETDIRECTORY  = 32;
module.exports.Subscribe    = COMMAND_SUBSCRIBE;
module.exports.Unsubscribe  = COMMAND_UNSUBSCRIBE;
module.exports.GetDirectory = COMMAND_GETDIRECTORY;



/****************************************************************************
 * Root
 ***************************************************************************/

function Root() {
    Root.super_.call(this);
    //Object.defineProperty(this, '_parent', {value: null, enumerable: false});
};

util.inherits(Root, TreeNode);


Root.decode = function(ber) {
    let r = new Root();
    let tag = undefined;

    while(ber.remain > 0) {
        try {
            ber = ber.getSequence(BER.APPLICATION(0));
            tag = ber.peek();
        }
        catch (e) {
            break;
        }


        if (tag == BER.APPLICATION(11)) {
            var seq = ber.getSequence(BER.APPLICATION(11));
            r.elements = [];
            while (seq.remain > 0) {
                try {
                    var rootReader = seq.getSequence(BER.CONTEXT(0));
                    while (rootReader.remain > 0) {
                        r.addElement(RootElement.decode(rootReader));
                    }
                }
                catch (e) {
                    console.log(e.stack);
                    return r;
                }
            }
        } else {
            // StreamCollection BER.APPLICATION(6)
            // InvocationResult BER.APPLICATION(23)
            throw new errors.UnimplementedEmberTypeError(tag);
        }
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

Root.prototype.clear = function() {
    this.elements = undefined;
}

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
    Object.defineProperty(this, '_parent', {value: null, enumerable: false, writable: true});
    Object.defineProperty(this, '_directoryCallbacks', {value: [], enumerable: false, writable: true});
    Object.defineProperty(this, '_callbacks', {value: [], enumerable: false, writable: true});
}

TreeNode.prototype.addChild = function(child) {
    child._parent = this;
    if(this.children === undefined) {
        this.children = [];
    }
    this.children.push(child);
}

TreeNode.prototype.isMatrix = function() {
    return ((this instanceof MatrixNode) || (this instanceof QualifiedMatrix));
}

TreeNode.prototype.isParameter = function() {
    return ((this instanceof Parameter) || (this instanceof QualifiedParameter));
}

TreeNode.prototype.isFunction = function() {
    return (this instanceof QualifiedFunction);
}

TreeNode.prototype.addCallback = function(callback) {
    if(this._callbacks.indexOf(callback) < 0) {
        this._callbacks.push(callback);
    }
}

TreeNode.prototype.cancelCallbacks = function() {
    var self=this;
    self._directoryCallbacks = [];
    var children = self.getChildren();
    if(children !== null) {
        for(var i=0; i<children.length; i++) {
            children[i].cancelCallbacks();
        }
    }
}

TreeNode.prototype.getMinimal = function() {
    return new this.constructor(this.number);
}

TreeNode.prototype.getTreeBranch = function(child, modifier) {
    var m = this.getMinimal();
    if(child !== undefined) {
        m.addChild(child);
    }

    if(modifier !== undefined) {
        modifier(m);
    }

    if(this._parent === null) {
        return m;
    } else {
        var p = this._parent.getTreeBranch(m);
        return p;
    }
}

TreeNode.prototype.getRoot = function() {
    if(this._parent === null) {
        return this;
    } else {
        return this._parent.getRoot();
    }
}

TreeNode.prototype.getDirectory = function(callback) {
    if(callback !== undefined) {
        this._directoryCallbacks.push((error, node) => { callback(error, node) });
    }
    return this.getTreeBranch(new Command(COMMAND_GETDIRECTORY));
}

TreeNode.prototype.getChildren = function() {
    if(this.children !== undefined) {
        return this.children;
    }
    return null;
}


_getElementByPath = function(children, pathArray, path) {
    if ((children === null)||(children === undefined)||(pathArray.length < 1))  {
        return null;
    }
    var currPath = pathArray.join(".");
    var number = pathArray[pathArray.length - 1];
    //console.log(`looking for path ${currPath} or number ${number}`);

    for (var i = 0; i < children.length; i++) {
        //console.log("looking at child", JSON.stringify(children[i]));

        if ((children[i].path === currPath)||
            (children[i].number === number)){
            if (path.length === 0) {
                return children[i];
            }
            pathArray.push(path.splice(0,1));
            return _getElementByPath(children[i].getChildren(), pathArray, path);
        }
    }

    return null;
}

TreeNode.prototype.getElementByPath = function(path) {
    var children = this.getChildren();
    if ((children === null)||(children === undefined))  {
        return null;
    }
    path = path.split(".");

    if (path.length > 2) {
        pathArray = path.splice(0,2);
    }
    else {
        pathArray = path;
        path = [];
    }
    return _getElementByPath(children, pathArray, path);
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

    //if(this.getChildren !== null) {
    while(self._directoryCallbacks.length > 0) {
        (function(cb) {
            callbacks.push(() => {
                //console.log(this.constructor.name, "dir cb", self.getPath());
                cb(null, self)
            });
        })(self._directoryCallbacks.shift());
    }
    //}

    for(var i=0; i<self._callbacks.length; i++) {
        (function(cb) {
            callbacks.push(() => {
                //console.log(self.constructor.name, "cb", self.getPath());
                cb(self)
            });
        })(self._callbacks[i]);
    }

    return callbacks;
}

TreeNode.prototype.getNodeByPath = function(client, path, callback) {
    var self=this;
   
    if(path.length == 0) {
        callback(null, self);
        return;
    }

   
    var child = self.getElement(path[0]);
    if(child !== null) {
        child.getNodeByPath(client, path.slice(1), callback);
    } else {
        var cmd = self.getDirectory((error, node) => {
            if(error) {
                callback(error);
            }
            child = node.getElement(path[0]);
            if(child === null) {
                //console.log("inv:", path[0], self);
                callback('invalid path');
                return;
            } else {
                child.getNodeByPath(client, path.slice(1), callback);
            }
        });
        if(cmd !== null) {
            client.sendBERNode(cmd);
        }
    }
}

TreeNode.prototype.getPath = function() {
    if (this.path !== undefined) {
        return this.path;
    }
    if(this._parent === null) {
        if(this.number === undefined) {
            return "";
        } else {
            return this.number.toString();
        }
    } else {
        var path = this._parent.getPath();
        if(path.length > 0) {
            path = path + ".";
        }
        return path + this.number; 
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
        return Parameter.decode(ber);
    } else if(tag == BER.APPLICATION(3)) {
        return Node.decode(ber);
    } else if(tag == BER.APPLICATION(2)) {
        return Command.decode(ber);
    } else if(tag == BER.APPLICATION(9)) {
        return QualifiedParameter.decode(ber);
    } else if(tag == BER.APPLICATION(10)) {
        return QualifiedNode.decode(ber);
    } else if(tag == BER.APPLICATION(13)) {
        return MatrixNode.decode(ber);
    }
    else if(tag == BER.APPLICATION(17)) {
        return QualifiedMatrix.decode(ber);
    }
    else if(tag == BER.APPLICATION(19)) {
        // Function
        throw new errors.UnimplementedEmberTypeError(tag);
    } else if (tag == BER.APPLICATION(20)) {
        return QualifiedFunction.decode(ber);
    }
    else if(tag == BER.APPLICATION(24)) {
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
 * QualifiedNode
 ***************************************************************************/

function QualifiedNode(path) {
    QualifiedNode.super_.call(this);
    if (path != undefined) {
        this.path = path;
    }
}

util.inherits(QualifiedNode, TreeNode);


QualifiedNode.decode = function(ber) {
    var qn = new QualifiedNode();
    ber = ber.getSequence(BER.APPLICATION(10));
    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            qn.path = seq.readOID(BER.EMBER_RELATIVE_OID); // 13 => relative OID
        }
        else if(tag == BER.CONTEXT(1)) {
            qn.contents = NodeContents.decode(seq);
        } else if(tag == BER.CONTEXT(2)) {
            qn.children = [];
            seq = seq.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                var nodeSeq = seq.getSequence(BER.CONTEXT(0));
                qn.addChild(Element.decode(nodeSeq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return qn;
}

QualifiedNode.prototype.update = function(other) {
    callbacks = QualifiedNode.super_.prototype.update.apply(this);
    if ((other !== undefined) && (other.contents !== undefined)) {
        this.contents = other.contents;
    }
    return callbacks;
}

QualifiedNode.prototype.getDirectory = function(callback) {
    if (this.path === undefined) {
        throw new Error("Invalid path");
    }
    //console.log("Generating getDirectory command for node", this);
    var r = new Root();
    var qn = new QualifiedNode();
    qn.path = this.path;
    r.addElement(qn);
    qn.addChild(new Command(COMMAND_GETDIRECTORY));
    if(callback !== undefined) {
        this._directoryCallbacks.push((error, node) => { callback(error, node) });
    }
    return r;
}


QualifiedNode.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(10));

    ber.startSequence(BER.CONTEXT(0));
    ber.writeOID(this.path, BER.EMBER_RELATIVE_OID);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

module.exports.QualifiedNode = QualifiedNode;

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
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            n.number = seq.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            n.contents = NodeContents.decode(seq);
        } else if(tag == BER.CONTEXT(2)) {
            seq = seq.getSequence(BER.APPLICATION(4));
            n.children = [];
            while(seq.remain > 0) {
                var nodeSeq = seq.getSequence(BER.CONTEXT(0));
                n.addChild(Element.decode(nodeSeq));
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
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

Node.prototype.update = function(other) {
    callbacks = Node.super_.prototype.update.apply(this);
    if(other.contents !== undefined) {
        this.contents = other.contents;
    }
    return callbacks;
}

Node.prototype.subscribe = function(callback) {
    if(this._callbacks.indexOf(callback) < 0) {
        this._callbacks.push(callback);
    }
}

module.exports.Node = Node;

/******************************
 * MATRIX
 ******************************/

function MatrixNode(number) {
    MatrixNode.super_.call(this);
    if(number !== undefined)
        this.number = number;
}


MatrixNode.decode = function(ber) {
    var m = new MatrixNode();
    ber = ber.getSequence(BER.APPLICATION(13));
    while (ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if (tag == BER.CONTEXT(0)) {
            m.number = seq.readInt();
        }
        else if (tag == BER.CONTEXT(1)) {
            m.contents = MatrixContents.decode(seq);

        } else if (tag == BER.CONTEXT(2)) {
            m.children = [];
            seq = seq.getSequence(BER.APPLICATION(4));
            while (seq.remain > 0) {
                var childSeq = seq.getSequence(BER.CONTEXT(0));
                m.addChild(Element.decode(childSeq));
            }
        } else if (tag == BER.CONTEXT(3)) {
            m.targets = decodeTargets(seq);
        } else if (tag == BER.CONTEXT(4)) {
            m.sources = decodeSources(seq);
        } else if (tag == BER.CONTEXT(5)) {
            m.connections = [];
            seq = seq.getSequence(BER.EMBER_SEQUENCE);
            while(seq.remain > 0) {
                var conSeq = seq.getSequence(BER.CONTEXT(0));
                m.connections.push(MatrixConnection.decode(conSeq));
            }
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return m;
};

MatrixNode.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(13));

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
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    if (this.targets !== undefined) {

        ber = ber.startSequence(BER.CONTEXT(3));

        for(var i=0; i<this.targets.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            ber.startSequence(BER.APPLICATION(14));
            ber.startSequence(BER.CONTEXT(0));
            ber.writeInt(this.targets[i]);
            ber.endSequence();
            ber.endSequence();
            ber.endSequence();
        }

        ber.endSequence();
    }

    if (this.sources !== undefined) {
        ber = ber.startSequence(BER.CONTEXT(4));

        for(var i=0; i<this.sources.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            ber.startSequence(BER.APPLICATION(15));
            ber.startSequence(BER.CONTEXT(0));
            ber.writeInt(this.sources[i]);
            ber.endSequence();
            ber.endSequence();
            ber.endSequence();
        }

        ber.endSequence();
    }

    if (this.connections !== undefined) {
        ber.startSequence(BER.CONTEXT(5));
        for(var i=0; i<this.sources.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.connections[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

util.inherits(MatrixNode, TreeNode);

module.exports.MatrixNode = MatrixNode;

function MatrixContents() {
}

MatrixContents.decode = function(ber) {
    var mc = new MatrixContents();

    //console.log("\n\n Matrix Content\n\n", ber.buffer);
    ber = ber.getSequence(BER.EMBER_SET);


    while(ber.remain > 0) {
        var tag = ber.peek();
        //console.log("Next tag", tag, ber.buffer);
        var seq = ber.getSequence(tag);

        if(tag == BER.CONTEXT(0)) {
            mc.identifier = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            mc.description = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            mc.type = MatrixType.decode(seq);
        } else if(tag == BER.CONTEXT(3)) {
            mc.mode = MatrixMode.decode(seq);
        } else if(tag == BER.CONTEXT(4)) {
            mc.targetCount = seq.readInt();
        } else if(tag == BER.CONTEXT(5)) {
            mc.sourceCount = seq.readInt();
        } else if(tag == BER.CONTEXT(6)) {
            mc.maximumTotalConnects = seq.readInt();
        } else if(tag == BER.CONTEXT(7)) {
            mc.maximumConnectsPerTarget = seq.readInt();
        } else if(tag == BER.CONTEXT(8)) {
            mc.parametersLocation = seq.readInt();
        } else if(tag == BER.CONTEXT(9)) {
            mc.gainParameterNumber = seq.readInt();
        } else if(tag == BER.CONTEXT(10)) {
            mc.labels = [];
            //console.log("\n\nLABEL\n\n",seq.buffer);
            seq = seq.getSequence(BER.EMBER_SEQUENCE);
            while(seq.remain > 0) {
                var lSeq = seq.getSequence(BER.CONTEXT(0));
                mc.labels.push(Label.decode(lSeq));
            }
            //console.log(mc);
        } else if(tag == BER.CONTEXT(11)) {
            mc.schemaIdentifiers = seq.readInt();
        } else if(tag == BER.CONTEXT(12)) {
            mc.templateReference = seq.readOID(BER.EMBER_RELATIVE_OID);
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    //console.log("end of matrix contents");
    return mc;
};

MatrixContents.prototype.encode = function(ber) {
    ber.startSequence(BER.EMBER_SET);
    if (this.identifier !== undefined) {
        ber.startSequence(BER.CONTEXT(0));
        ber.writeString(this.identifier);
        ber.endSequence();
    }
    if (this.description !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeString(this.description);
        ber.endSequence();
    }
    if (this.type !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        this.type.encode(ber);
        ber.endSequence();
    }
    if (this.mode !== undefined) {
        ber.startSequence(BER.CONTEXT(3));
        this.mode.encode(ber);
        ber.endSequence();
    }
    if (this.targetCount !== undefined) {
        ber.startSequence(BER.CONTEXT(4));
        ber.writeInt(this.targetCount);
        ber.endSequence();
    }
    if (this.sourceCount !== undefined) {
        ber.startSequence(BER.CONTEXT(5));
        ber.writeInt(this.sourceCount);
        ber.endSequence();
    }
    if (this.maximumTotalConnects !== undefined) {
        ber.startSequence(BER.CONTEXT(6));
        ber.writeInt(this.maximumTotalConnects);
        ber.endSequence();
    }
    if (this.maximumConnectsPerTarget !== undefined) {
        ber.startSequence(BER.CONTEXT(7));
        ber.writeInt(this.maximumConnectsPerTarget);
        ber.endSequence();
    }
    if (this.parametersLocation !== undefined) {
        ber.startSequence(BER.CONTEXT(8));
        ber.writeInt(this.parametersLocation);
        ber.endSequence();
    }
    if (this.gainParameterNumber !== undefined) {
        ber.startSequence(BER.CONTEXT(9));
        ber.writeInt(this.gainParameterNumber);
        ber.endSequence();
    }
    if (this.labels !== undefined) {
        ber.startSequence(BER.CONTEXT(10));
        ber.startSequence(BER.EMBER_SEQUENCE);
        for(var i =0; i < this.labels.length; i++) {
            this.labels[i].encode(ber);
        }
        ber.endSequence();
        ber.endSequence();
    }
    if (this.schemaIdentifiers !== undefined) {
        ber.startSequence(BER.CONTEXT(11));
        ber.writeInt(this.schemaIdentifiers);
        ber.endSequence();
    }
    if (this.templateReference !== undefined) {
        ber.startSequence(BER.CONTEXT(12));
        ber.writeOID(this.templateReference, BER.EMBER_RELATIVE_OID);
        ber.endSequence();
    }
    ber.endSequence();
}

decodeTargets = function(ber) {
    let targets = [];

    ber = ber.getSequence(BER.EMBER_SEQUENCE);


    while(ber.remain > 0) {
        var seq = ber.getSequence(BER.CONTEXT(0));
        seq = seq.getSequence(BER.APPLICATION(14));
        seq = seq.getSequence(BER.CONTEXT(0));
        targets.push(seq.readInt());
    }

    return targets;
}

decodeSources = function(ber) {
    let sources = [];

    ber = ber.getSequence(BER.EMBER_SEQUENCE);

    while(ber.remain > 0) {
        var seq = ber.getSequence(BER.CONTEXT(0));
        seq = seq.getSequence(BER.APPLICATION(15));
        seq = seq.getSequence(BER.CONTEXT(0));
        sources.push(seq.readInt());
    }

    return sources;
};

module.exports.MatrixContents = MatrixContents;



function MatrixConnection() {

}

MatrixConnection.decode = function(ber) {
    var c = new MatrixConnection();
    ber = ber.getSequence(BER.APPLICATION(16));
    ber = ber.getSequence(BER.EMBER_SEQUENCE);
    while (ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if (tag == BER.CONTEXT(0)) {
            c.target = seq.readInt();
        }
        else if (tag == BER.CONTEXT(1)) {
            //sources
            var sources = seq.readOID(BER.EMBER_RELATIVE_OID);
            c.sources = sources.split(".");
        } else if (tag == BER.CONTEXT(2)) {
            c.operation = seq.readInt();
            // ConnectionOperation ::=
            //     INTEGER {
            //     absolute (0), -- default. sources contains absolute information
            //     connect (1), -- nToN only. sources contains sources to add to connection
            //     disconnect (2) -- nToN only. sources contains sources to remove from
            //     connection
            // }
        } else if (tag == BER.CONTEXT(3)) {
            m.disposition = seq.readInt();
            // ConnectionDisposition ::=
            //     INTEGER {
            //     tally (0), -- default
            //     modified (1), -- sources contains new current state
            //     pending (2), -- sources contains future state
            //     locked (3) -- error: target locked. sources contains current state
            //     -- more tbd.
            // }
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return m;
}

MatrixConnection.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(16));
    ber.startSequence(BER.EMBER_SEQUENCE);

    ber.startSequence(BER.CONTEXT(0));
    ber.writeInt(this.target);
    ber.endSequence();

    if (this.sources !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeOID(this.sources.join("."), BER.EMBER_RELATIVE_OID);
        ber.endSequence();
    }
    if (this.operation !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.writeInt(this.operation);
        ber.endSequence();
    }
    if (this.disposition !== undefined) {
        ber.startSequence(BER.CONTEXT(3));
        ber.writeInt(this.disposition);
        ber.endSequence();
    }
    ber.endSequence();
    ber.endSequence();
}

module.exports.MatrixConnection = MatrixConnection;

function Label() {
}

Label.decode = function(ber) {
    var l = {};

    ber = ber.getSequence(BER.APPLICATION(18));

    while (ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if (tag == BER.CONTEXT(0)) {
            l.basePath = seq.readOID(BER.EMBER_RELATIVE_OID);
        } else if (tag == BER.CONTEXT(1)) {
            l.description = seq.readString(BER.EMBER_STRING);
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return l;
};

Label.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(18));
    if (this.basePath !== undefined) {
        ber.startSequence(BER.CONTEXT(0));
        ber.writeOID(this.basePath, BER.EMBER_RELATIVE_OID);
    }
    if (this.description !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeString(this.basePath);
    }
    ber.endSequence();
}

module.exports.Label = Label;


function ParametersLocation() {
}

ParametersLocation.decode = function(ber) {
    var tag = ber.peek();
    ber = ber.getSequence(tag);
    this.value = ber.readValue();
}

module.exports.ParametersLocation = ParametersLocation;

function MatrixType() {
    this.value = "oneToN";
}

MatrixType.decode = function(ber) {
    var mt = new MatrixType();
    var type = ber.readInt();

    if (type === 1) {
        mt.value = "oneToOne";
    } else if (type === 2) {
        mt.value = "nToN";
    }
    return mt;
}

MatrixType.prototype.encode = function(ber) {
    if (this.type === "oneToOne") {
        ber.writeInt(1);
    }
    else if (this.type === "nToN") {
        ber.writeInt(2);
    }
    else {
        ber.writeInt(0);
    }
}

module.exports.MatrixType = MatrixType;

function MatrixMode() {
    this.value = "linear";
}

MatrixMode.decode = function(ber) {
    var mt = new MatrixMode();
    var mode = ber.readInt();

    if (mode === 1) {
        mt.value = "nonLinear";
    }
    return mt;
}

MatrixMode.prototype.encode = function(ber) {
    if (this.type === "nonLinear") {
        ber.writeInt(1);
    }
    else {
        ber.writeInt(0);
    }
}

module.exports.MatrixMode = MatrixMode;


/****************************************************************************
 * QualifiedMatrix
 ***************************************************************************/

function QualifiedMatrix(path) {
    QualifiedMatrix.super_.call(this);
    if (path != undefined) {
        this.path = path;
    }
}

util.inherits(QualifiedMatrix, TreeNode);


QualifiedMatrix.decode = function(ber) {
    var qm = new QualifiedMatrix();
    ber = ber.getSequence(BER.APPLICATION(17));
    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            qm.path = seq.readOID(BER.EMBER_RELATIVE_OID); // 13 => relative OID
        }
        else if(tag == BER.CONTEXT(1)) {
            qm.contents = MatrixContents.decode(seq);
        } else if(tag == BER.CONTEXT(2)) {
            qm.children = [];
            seq = seq.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                var nodeSeq = seq.getSequence(BER.CONTEXT(0));
                qm.addChild(Element.decode(nodeSeq));
            }
        } else if (tag == BER.CONTEXT(3)) {
            qm.targets = decodeTargets(seq);
        } else if (tag == BER.CONTEXT(4)) {
            qm.sources = decodeSources(seq);
        } else if (tag == BER.CONTEXT(5)) {
            qm.connections = [];
            seq = seq.getSequence(BER.EMBER_SEQUENCE);
            while(seq.remain > 0) {
                var conSeq = seq.getSequence(BER.CONTEXT(0));
                qm.connections.push(MatrixConnection.decode(conSeq));
            }
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return qm;
}

QualifiedMatrix.prototype.update = function(other) {
    callbacks = QualifiedMatrix.super_.prototype.update.apply(this);
    if (other !== undefined) {
        if (other.contents !== undefined) {
            this.contents = other.contents;
        }
        if (other.targets !== undefined) {
            this.targets = other.targets;
        }
        if (other.sources !== undefined) {
            this.sources = other.sources;
        }
        if (other.connections !== undefined) {
            this.connections = other.connections;
        }
    }

    return callbacks;
}

QualifiedMatrix.prototype.getDirectory = function(callback) {
    if (this.path === undefined) {
        throw new Error("Invalid path");
    }
    //console.log("Generating getDirectory command for node", this);
    var r = new Root();
    var qn = new QualifiedMatrix();
    qn.path = this.path;
    r.addElement(qn);
    qn.addChild(new Command(COMMAND_GETDIRECTORY));
    if(callback !== undefined) {
        this._directoryCallbacks.push((error, node) => { callback(error, node) });
    }
    return r;
}


QualifiedMatrix.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(17));

    ber.startSequence(BER.CONTEXT(0));
    ber.writeOID(this.path, BER.EMBER_RELATIVE_OID);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    if (this.targets !== undefined) {
        ber = ber.startSequence(BER.CONTEXT(3));

        for(var i=0; i<this.targets.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            ber.startSequence(BER.APPLICATION(14));
            ber.startSequence(BER.CONTEXT(0));
            ber.writeInt(this.targets[i]);
            ber.endSequence();
            ber.endSequence();
            ber.endSequence();
        }

        ber.endSequence();
    }

    if (this.sources !== undefined) {
        ber = ber.startSequence(BER.CONTEXT(4));

        for(var i=0; i<this.sources.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            ber.startSequence(BER.APPLICATION(15));
            ber.startSequence(BER.CONTEXT(0));
            ber.writeInt(this.sources[i]);
            ber.endSequence();
            ber.endSequence();
            ber.endSequence();
        }

        ber.endSequence();
    }

    if (this.connections !== undefined) {
        ber.startSequence(BER.CONTEXT(5));
        for(var i=0; i<this.sources.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.connections[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

module.exports.QualifiedMatrix = QualifiedMatrix;

/****************************************************************************
 * FunctionContent
 ***************************************************************************/

function FunctionContent() {
}

decodeTupleDescription = function(ber) {
    var tuple = {};
    ber = ber.getSequence(BER.APPLICATION(21));
    while(ber.remain > 0) {
        tag = ber.peek();
        var seq = ber.getSequence(tag);
        if (tag === BER.CONTEXT(0)) {
            tuple.type = seq.readInt();
        }
        else if (tag === BER.CONTEXT(1)) {
            tuple.name = seq.readString(BER.EMBER_STRING);
        }
    }
    return tuple;
};

encodeTupleDescription = function(tuple, ber) {
    ber.startSequence(BER.APPLICATION(21));
    if (tuple.type !== undefined) {
        ber.startSequence(BER.CONTEXT(0));
        ber.writeInt(tuple.type);
        ber.endSequence();
    }
    if (tuple.name !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeString(tuple.name);
        ber.endSequence();
    }
    ber.endSequence();
}

FunctionContent.decode = function(ber) {
    var fc = new FunctionContent();
    ber = ber.getSequence(BER.EMBER_SET);
    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            fc.identifier = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            fc.description = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            fc.arguments = [];
            seq = seq.getSequence(BER.EMBER_SEQUENCE);
            while(seq.remain > 0) {
                tag = seq.peek();
                var dataSeq = seq.getSequence(BER.CONTEXT(0));
                if (tag === BER.CONTEXT(0)) {
                    fc.arguments.push(decodeTupleDescription(dataSeq));
                }
            }
        } else if(tag == BER.CONTEXT(3)) {
            fc.result = [];
            while(seq.remain > 0) {
                tag = seq.peek();
                var dataSeq = seq.getSequence(tag);
                if (tag === BER.CONTEXT(0)) {
                    fc.result.push(decodeTupleDescription(dataSeq));
                }
            }
        } else if(tag == BER.CONTEXT(4)) {
            fc.templateReference = seq.readOID(BER.EMBER_RELATIVE_OID);
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return fc;
}

FunctionContent.prototype.encode = function(ber) {
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

    if(this.arguments !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.EMBER_SEQUENCE);
        for(var i =0; i < this.arguments; i++) {
            ber.startSequence(BER.CONTEXT(0));
            encodeTupleDescription(this.arguments[i], ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence(); // BER.CONTEXT(2)
    }

    if(this.result !== undefined) {
        ber.startSequence(BER.CONTEXT(3));
        ber.startSequence(BER.EMBER_SEQUENCE);
        for(var i =0; i < this.result; i++) {
            ber.startSequence(BER.CONTEXT(0));
            encodeTupleDescription(this.result[i], ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence(); // BER.CONTEXT(3)
    }

    ber.endSequence(); // BER.EMBER_SET
}

module.exports.FunctionContent = FunctionContent;

/****************************************************************************
 * QualifiedFunction
 ***************************************************************************/

function QualifiedFunction(path) {
    QualifiedFunction.super_.call(this);
    if (path != undefined) {
        this.path = path;
    }
}

util.inherits(QualifiedFunction, TreeNode);


QualifiedFunction.decode = function(ber) {
    var qf = new QualifiedFunction();
    ber = ber.getSequence(BER.APPLICATION(20));
    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            qf.path = seq.readOID(BER.EMBER_RELATIVE_OID); // 13 => relative OID
        }
        else if(tag == BER.CONTEXT(1)) {
            qf.contents = FunctionContent.decode(seq);
        } else if(tag == BER.CONTEXT(2)) {
            qf.children = [];
            seq = seq.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                var nodeSeq = seq.getSequence(BER.CONTEXT(0));
                qf.addChild(Element.decode(nodeSeq));
            }
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return qf;
}

QualifiedFunction.prototype.update = function(other) {
    callbacks = QualifiedFunction.super_.prototype.update.apply(this);
    if (other !== undefined) {
        if (other.contents !== undefined) {
            this.contents = other.contents;
        }
    }

    return callbacks;
}

QualifiedFunction.prototype.getDirectory = function(callback) {
    if (this.path === undefined) {
        throw new Error("Invalid path");
    }
    //console.log("Generating getDirectory command for node", this);
    var r = new Root();
    var qf = new QualifiedFunction();
    qf.path = this.path;
    r.addElement(qf);
    qf.addChild(new Command(COMMAND_GETDIRECTORY));
    if(callback !== undefined) {
        this._directoryCallbacks.push((error, node) => { callback(error, node) });
    }
    return r;
}


QualifiedFunction.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(20));

    ber.startSequence(BER.CONTEXT(0));
    ber.writeOID(this.path, BER.EMBER_RELATIVE_OID);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

module.exports.QualifiedFunction = QualifiedFunction;

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
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            nc.identifier = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            nc.description = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            nc.isRoot = seq.readBoolean();
        } else if(tag == BER.CONTEXT(3)) {
            nc.isOnline = seq.readBoolean();
        } else if(tag == BER.CONTEXT(4)) {
            nc.schemaIdentifiers = seq.readString(BER.EMBER_STRING);
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
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            c.number = seq.readInt();
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
 * QualifiedParameter
 ***************************************************************************/

function QualifiedParameter(number) {
    QualifiedParameter.super_.call(this);
    if(number !== undefined)
        this.number = number;
}

util.inherits(QualifiedParameter, TreeNode);
module.exports.QualifiedParameter = QualifiedParameter;

QualifiedParameter.decode = function(ber) {
    //console.log("Decoding QualifiedParameter");
    var qp = new QualifiedParameter();
    ber = ber.getSequence(BER.APPLICATION(9));
    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            qp.path = seq.readOID(BER.EMBER_RELATIVE_OID); // 13 => relative OID
            //console.log("Decoded path",qp.path);
        }
        else if(tag == BER.CONTEXT(1)) {
            //console.log("Decoding content");
            qp.contents = ParameterContents.decode(seq);
            //console.log("Decoded content",qp.contents);
        } else if(tag == BER.CONTEXT(2)) {
            qp.children = [];
            //console.log("Decoding children");
            seq = seq.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                var nodeSeq = seq.getSequence(BER.CONTEXT(0));
                qp.addChild(Element.decode(nodeSeq));
            }
        } else {
            return qp;
            //throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return qp;
}

QualifiedParameter.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(9));

    ber.startSequence(BER.CONTEXT(0));
    ber.writeOID(this.path, BER.EMBER_RELATIVE_OID);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

QualifiedParameter.prototype.update = function(other) {
    callbacks = QualifiedParameter.super_.prototype.update.apply(this);
    if(other.contents !== undefined) {
        this.contents = other.contents;
    }
    return callbacks;
}

QualifiedParameter.prototype.getDirectory = function(callback) {
    if (this.path === undefined) {
        throw new Error("Invalid path");
    }
    let r = new Root();
    let qp = new QualifiedParameter();
    qp.path = this.path;
    r.addElement(qp);
    qp.addChild(new Command(COMMAND_GETDIRECTORY));
    if(callback !== undefined) {
        this._directoryCallbacks.push((error, node) => { callback(error, node) });
    }
    return r;
}

QualifiedParameter.prototype.setValue = function(value, callback) {
    if(callback !== undefined) {
        this._directoryCallbacks.push(callback);
    }

    let r = new Root();
    let qp = new QualifiedParameter();
    r.addElement(qp);
    qp.path = this.path;
    qp.contents = new ParameterContents(value);
    return r;
}

/****************************************************************************
 * Parameter
 ***************************************************************************/

function Parameter(number) {
    Parameter.super_.call(this);
    if(number !== undefined)
        this.number = number;
}

util.inherits(Parameter, TreeNode);
module.exports.Parameter = Parameter;

Parameter.decode = function(ber) {
    var p = new Parameter();
    ber = ber.getSequence(BER.APPLICATION(1));

    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            p.number = seq.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            p.contents = ParameterContents.decode(seq);
        } else if(tag == BER.CONTEXT(2)) {
            seq = seq.getSequence(BER.APPLICATION(4));
            p.children = [];
            while(seq.remain > 0) {
                var paramSeq = seq.getSequence(BER.CONTEXT(0));
                p.addChild(Element.decode(paramSeq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return p;
}

Parameter.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(1));

    ber.writeIfDefined(this.number, ber.writeInt, 0);

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence();
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        for(var i=0; i<this.children.length; i++) {
            ber.startSequence(BER.CONTEXT(0));
            this.children[i].encode(ber);
            ber.endSequence();
        }
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence();
}

Parameter.prototype.setValue = function(value, callback) {
    if(callback !== undefined) {
        this._directoryCallbacks.push(callback);
    }
    
    return this.getTreeBranch(undefined, (m) => {
        m.contents = new ParameterContents(value);
    });
}

Parameter.prototype.update = function(other) {
    callbacks = Parameter.super_.prototype.update.apply(this);
    //console.log('update', this.getPath());
    //console.log(callbacks);
    if(other.contents !== undefined) {
        //console.log("other: ", other.contents);
        for(var key in other.contents) {
            //console.log(key, other.contents.hasOwnProperty(key));
            if(other.contents.hasOwnProperty(key)) {
                this.contents[key] = other.contents[key];
            }
        }
    }
    return callbacks;
}

Parameter.prototype.isStream = function() {
    return this.contents !== undefined && 
        this.contents.streamDescriptor !== undefined;
}

var ParameterAccess = new Enum({
    none: 0,
    read: 1,
    write: 2,
    readWrite: 3
});

var ParameterType = new Enum({
    integer: 1,
    real: 2,
    string: 3,
    boolean: 4,
    trigger: 5,
    enum: 6,
    octets: 7
});

function ParameterContents(value) {
    if(value !== undefined) {
        this.value = value;
    }
};

ParameterContents.decode = function(ber) {
    var pc = new ParameterContents();
    ber = ber.getSequence(BER.EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq = ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            pc.identifier = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            pc.description = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            pc.value = seq.readValue();
        } else if(tag == BER.CONTEXT(3)) {
            pc.minimum = seq.readValue();
        } else if(tag == BER.CONTEXT(4)) {
            pc.maximum = seq.readValue();
        } else if(tag == BER.CONTEXT(5)) {
            pc.access = ParameterAccess.get(seq.readInt());
        } else if(tag == BER.CONTEXT(6)) {
            pc.format = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(7)) {
            pc.enumeration = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(8)) {
            pc.factor = seq.readInt();
        } else if(tag == BER.CONTEXT(9)) {
            pc.isOnline = seq.readBoolean();
        } else if(tag == BER.CONTEXT(10)) {
            pc.formula = seq.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(11)) {
            pc.step = seq.readInt();
        } else if(tag == BER.CONTEXT(12)) {
            pc.default = seq.readValue();
        } else if(tag == BER.CONTEXT(13)) {
            pc.type = ParameterType.get(seq.readInt());
        } else if(tag == BER.CONTEXT(14)) {
            pc.streamIdentifier = seq.readInt();
        } else if(tag == BER.CONTEXT(15)) {
            pc.enumMap = StringIntegerCollection.decode(seq);
        } else if(tag == BER.CONTEXT(16)) {
            pc.streamDescriptor = StreamDescription.decode(seq);
        } else if(tag == BER.CONTEXT(17)) {
            pc.schemaIdentifiers = seq.readString(BER.EMBER_STRING);
        } else if (tag == null) {
            break;
        }
        else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return pc;
}

ParameterContents.prototype.encode = function(ber) {
    ber.startSequence(BER.EMBER_SET);
    
    ber.writeIfDefined(this.identifier, ber.writeString, 0, BER.EMBER_STRING);
    ber.writeIfDefined(this.description, ber.writeString, 1, BER.EMBER_STRING);
    ber.writeIfDefined(this.value, ber.writeValue, 2);
    ber.writeIfDefined(this.minimum, ber.writeValue, 3);
    ber.writeIfDefined(this.maximum, ber.writeValue, 4);
    ber.writeIfDefinedEnum(this.access, ParameterAccess, ber.writeInt, 5);
    ber.writeIfDefined(this.format, ber.writeString, 6, BER.EMBER_STRING);
    ber.writeIfDefined(this.enumeration, ber.writeString, 7, BER.EMBER_STRING);
    ber.writeIfDefined(this.factor, ber.writeInt, 8);
    ber.writeIfDefined(this.isOnline, ber.writeBoolean, 9);
    ber.writeIfDefined(this.formula, ber.writeString, 10, BER.EMBER_STRING);
    ber.writeIfDefined(this.step, ber.writeInt, 11);
    ber.writeIfDefined(this.default, ber.writeValue, 12);
    ber.writeIfDefinedEnum(this.type, ParameterType, ber.writeInt, 13);
    ber.writeIfDefined(this.streamIdentifier, ber.writeInt, 14);
   
    if(this.emumMap !== undefined) {
        ber.startSequence(BER.CONTEXT(15)); 
        StringIntegerCollection.encode(ber, this.enumMap);
        ber.endSequence();
    }

    if(this.streamDescriptor !== undefined) {
        ber.startSequence(BER.CONTEXT(16)); 
        this.streamDescriptor.encode(ber);
        ber.endSequence();
    }

    ber.writeIfDefined(this.schemaIdentifiers, ber.writeString, 17, BER.EMBER_STRING);

    ber.endSequence();
}

/****************************************************************************
 * StringIntegerCollection
 ***************************************************************************/

// This is untested, VPB doesn't seem to use this that I've seen so far

function StringIntegerCollection() {};

StringIntegerCollection.decode = function(ber) {
    var enumMap = {};
    ber = ber.getSequence(BER.APPLICATION(8));
    while(ber.remain > 0) {
        var seq = ber.getSequence(BER.CONTEXT(0));
        seq = seq.getSequence(BER.APPLICATION(7));
        var entryString, entryInteger;
        while(seq.remain > 0) {
            var tag = seq.peek();
            var dataSeq = seq.getSequence(tag);
            if(tag == BER.CONTEXT(0)) {
                entryString = dataSeq.readString(BER.EMBER_STRING);
            } else if(tag == BER.CONTEXT(1)) {
                entryInteger = dataSeq.readInt();
            } else {
                throw new errors.UnimplementedEmberTypeError(tag);
            }
        }

        enumMap[entryString] = entryInteger;
    }

    return new Enum(enumMap);
}

StringIntegerCollection.encode = function(ber, e) {
    ber.startSequence(BER.APPLICATION(8));
    ber.startSequence(BER.CONTEXT(0));
    e.enums.forEach((item) => {
        ber.startSequence(BER.APPLICATION(7));
        ber.startSequence(BER.CONTEXT(0));
        ber.writeString(item.key, BER.EMBER_STRING);
        ber.endSequence();
        ber.startSequence(BER.CONTEXT(1));
        ber.writeInt(item.value);
        ber.endSequence();
        ber.endSequence();
    });
    ber.endSequence();
    ber.endSequence();
}

/****************************************************************************
 * StreamDescription
 ***************************************************************************/

var StreamFormat = new Enum({
    unsignedInt8: 0,
    unsignedInt16BigEndian: 2,
    unsignedInt16LittleEndian: 3,
    unsignedInt32BigEndian: 4,
    unsignedInt32LittleEndian: 5,
    unsignedInt64BigEndian: 6,
    unsignedInt64LittleENdian: 7,
    signedInt8: 8,
    signedInt16BigEndian: 10,
    signedInt16LittleEndian: 11,
    signedInt32BigEndian: 12,
    signedInt32LittleEndian: 13,
    signedInt64BigEndian: 14,
    signedInt64LittleEndian: 15,
    ieeeFloat32BigEndian: 20,
    ieeeFloat32LittleEndian: 21,
    ieeeFloat64BigEndian: 22,
    ieeeFloat64LittleEndian: 23
});

function StreamDescription() {};

StreamDescription.decode = function(ber) {
    var sd = new StreamDescription();
    ber = ber.getSequence(BER.APPLICATION(12));

    while(ber.remain > 0) {
        var tag = ber.peek();
        var seq =ber.getSequence(tag);
        if(tag == BER.CONTEXT(0)) {
            sd.format = StreamFormat.get(seq.readInt());
        } else if(tag == BER.CONTEXT(1)) {
            sd.offset = seq.readInt();
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return sd;
}

StreamDescription.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(12));

    ber.writeIfDefinedEnum(this.format, StreamFormat, ber.writeInt, 0);
    ber.writeIfDefined(this.offset, ber.writeInt, 1);

    ber.endSequence();
}


