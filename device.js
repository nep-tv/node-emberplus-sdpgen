const EventEmitter = require('events').EventEmitter;
const util = require('util');
const S101Client = require('./client.js');
const ember = require('./ember.js');


function DeviceTree(host, port) {
    DeviceTree.super_.call(this);
    var self = this;
    self.client = new S101Client(host, port);
    self.root = new ember.Root();

    self.client.on('connected', () => {
        self.client.sendBERNode(this.root.getDirectory((node) => {
            console.log("Ready!");
            self.emit('ready');
        }));
    });

    self.client.on('emberTree', (root) => {
        self.handleRoot(root);
    });
}

util.inherits(DeviceTree, EventEmitter);

DeviceTree.prototype.handleRoot = function(root) {
    var self=this;

    var callbacks = self.root.update(root);

    if(root.elements === undefined) {
        // unimplemented
        return;
    }

    for(var i=0; i<root.elements.length; i++) {
        callbacks = callbacks.concat(this.handleNode(this.root, root.elements[i]));    
    }

    console.log('handleRoot: ', callbacks);
    for(var i=0; i<callbacks.length; i++) {
        callbacks[i]();
    }
}

DeviceTree.prototype.handleNode = function(parent, node) {
    var callbacks = [];
    var n = parent.getElementByNumber(node.number);
    if(n === null) {
        parent.addChild(node);
        n = node;
    } else {
        callbacks = n.update(node);

    }
    var children = node.getChildren();
    if(children !== null) {
        for(var i=0; i<children.length; i++) {
            callbacks = callbacks.concat(this.handleNode(n, children[i]));
        }
    }

    console.log('handleNode: ', callbacks);
    return callbacks;
}

DeviceTree.prototype.getNodeByPath = function(path, callback) {
    this.root.getNodeByPath(this.client, path, callback);
}

function TreePath(path) {
    this.identifiers = [];
    this.numbers = [];

    if(path !== undefined) {
        for(var i=0; i<path.length; i++) {
            if(Number.isInteger(path[i])) {
                this.numbers.push(path[i]);
                this.identifiers.push(null);
            } else {
                this.identifiers.push(path[i]);
                this.numbers.push(null);
            }
        }
    }
}


module.exports = DeviceTree;
