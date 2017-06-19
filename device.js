const EventEmitter = require('events').EventEmitter;
const util = require('util');
const Promise = require('bluebird');
const S101Client = require('./client.js');
const ember = require('./ember.js');
const errors = require('./errors.js');

function DeviceTree(host, port) {
    DeviceTree.super_.call(this);
    var self = this;
    self.client = new S101Client(host, port);
    self.root = new ember.Root();
    self.pendingRequests = [];
    self.activeRequest = null;
    self.activeNode = null;
    self.activeCallback = null;

    self.client.on('connected', () => {
        self.client.sendBERNode(this.root.getDirectory((node) => {
            //console.log("Ready!");
            self.emit('ready');
        }));
    });

    self.client.on('emberTree', (root) => {
        //console.log(util.inspect(root, {depth:null, colors: true}));
        self.handleRoot(root);
    });
}

util.inherits(DeviceTree, EventEmitter);

DeviceTree.prototype.makeRequest = function() {
    var self=this;
    if(self.activeRequest === null && self.pendingRequests.length > 0) {
        self.activeRequest = self.pendingRequests.shift();
        self.activeRequest();
    }
};

DeviceTree.prototype.addRequest = function(cb) {
    var self=this;
    self.pendingRequests.push(cb);
    self.makeRequest();
}

DeviceTree.prototype.finishRequest = function() {
    var self=this;
    self.activeRequest = null;
    self.makeRequest();
}

DeviceTree.prototype.handleRoot = function(root) {
    var self=this;

    var callbacks = self.root.update(root);

    if(root.elements !== undefined) {
        for(var i=0; i<root.elements.length; i++) {
            callbacks = callbacks.concat(this.handleNode(this.root, root.elements[i]));    
        }

        //console.log('handleRoot: ', callbacks);

        // Fire callbacks once entire tree has been updated
        for(var i=0; i<callbacks.length; i++) {
            console.log('hr cb');
            callbacks[i]();
        }
    }

}

DeviceTree.prototype.handleNode = function(parent, node) {
    var self=this;
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

    //console.log('handleNode: ', callbacks);
    return callbacks;
}

DeviceTree.prototype.getNodeByPath = function(path) {
    var self=this;
    if(typeof path === 'string') {
        path = path.split('/');
    }

    return new Promise((resolve, reject) => {
        //console.log("promise created", path);
        self.addRequest((error) => {
            //console.log("cb called");
            if(error) {
                reject(error);
                self.finishRequest();
                return;
            }
            //console.log("gnbp", path);
            self.root.getNodeByPath(self.client, path, (error, node) => {
                if(error) {
                    reject(error);
                } else {
                    //console.log('resolved', node.constructor.name, path);
                    resolve(node);
                }
                self.finishRequest();
            });
        });
    });
}

DeviceTree.prototype.subscribe = function(node, callback) {
    if(node instanceof ember.Parameter && node.isStream()) {
        // TODO: implement
    } else {
        node.addCallback(callback);
    }
}

DeviceTree.prototype.setValue = function(node, value) {
    var self=this;
    return new Promise((resolve, reject) => {
        if(!(node instanceof ember.Parameter)) {
            reject(new errors.EmberAccessError('not a property'));
        } else if(node.contents !== undefined && node.contents.value == value) {
            resolve(node);
        } else {
            console.log('setValue', node.getPath(), value);
            self.addRequest((error) => {
                if(error) {
                    reject(error);
                    self.finishRequest();
                    return;
                }
    

                console.log('sber');
                self.client.sendBERNode(node.setValue(value, (error, node) => {
                    console.log('sber cb');
                    if(error) {
                        reject(error);
                    } else {
                        resolve(node);
                    }
                    console.log('fr');
                    self.finishRequest();
                }));
            });
        }
    });
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
