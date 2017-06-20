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
    self.timeout = null;
    self.connectTimeout = null;

    self.client.on('connecting', () => {
        self.emit('connecting');
    });

    self.client.on('connected', () => {
        self.root.clear();
        self.client.sendBERNode(self.root.getDirectory((node) => {
            self.emit('ready');
        }));
    });

    self.client.on('disconnected', () => {
        self.emit('disconnected');
        self.connectTimeout = setTimeout(() => {
            self.client.connect();
        }, 10000);
    });

    self.client.on('emberTree', (root) => {
        self.handleRoot(root);
    });
}

util.inherits(DeviceTree, EventEmitter);

DeviceTree.prototype.disconnect = function() {
    this.client.disconnect();
}

DeviceTree.prototype.makeRequest = function() {
    var self=this;
    if(self.activeRequest === null && self.pendingRequests.length > 0) {
        self.activeRequest = self.pendingRequests.shift();
        self.activeRequest();
        self.timeout = setTimeout(() => {
            self.timeoutRequest();
        }, 300);
    }
};

DeviceTree.prototype.addRequest = function(cb) {
    var self=this;
    self.pendingRequests.push(cb);
    self.makeRequest();
}

DeviceTree.prototype.finishRequest = function() {
    var self=this;
    if(self.timeout != null) {
        clearTimeout(self.timeout);
        self.timeout = null;
    }
    self.activeRequest = null;
    self.makeRequest();
}

DeviceTree.prototype.timeoutRequest = function() {
    var self = this;
    self.root.cancelCallbacks();
    self.activeRequest(new errors.EmberTimeoutError('Request timed out'));
}

DeviceTree.prototype.handleRoot = function(root) {
    var self=this;

    var callbacks = self.root.update(root);

    if(root.elements !== undefined) {
        for(var i=0; i<root.elements.length; i++) {
            callbacks = callbacks.concat(this.handleNode(this.root, root.elements[i]));    
        }

        // Fire callbacks once entire tree has been updated
        for(var i=0; i<callbacks.length; i++) {
            //console.log('hr cb');
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
        self.addRequest((error) => {
            if(error) {
                reject(error);
                self.finishRequest();
                return;
            }
            self.root.getNodeByPath(self.client, path, (error, node) => {
                if(error) {
                    reject(error);
                } else {
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
    

                self.client.sendBERNode(node.setValue(value, (error, node) => {
                    if(error) {
                        reject(error);
                    } else {
                        resolve(node);
                    }
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
