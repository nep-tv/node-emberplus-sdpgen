const EventEmitter = require('events').EventEmitter;
const util = require('util');
const S101Server = require('./client.js').S101Server;
const ember = require('./ember.js');

function TreeServer(host, port, tree) {
    TreeServer.super_.call(this);
    var self = this;

    self.callback = undefined;
    self.timeoutValue = 2000;
    self.server = new S101Server(host, port);
    self.tree = tree;
    self.clients = new Set();
    self.subscribers = {};

    self.server.on('listening', () => {
        self.emit('listening');
        if (self.callback !== undefined) {
            self.callback();
            self.callback = undefined;
        }
    });

    self.server.on('connection', (client) => {
        self.clients.add(client);
        client.on("emberTree", (root) => {
            // Queue the action to make sure responses are sent in order.
            client.addRequest(() => {
                self.handleRoot(client, root);
            });
        });
        client.on("disconnected", () => {
            self.clients.delete(client);
        });
        self.emit('connection', client);
    });

    self.server.on('disconnected', () => {
        self.emit('disconnected');
    });

    self.server.on("error", (e) => {
        self.emit("error", e);
        if (self.callback !== undefined) {
            self.callback(e);
        }
    });

}

util.inherits(TreeServer, EventEmitter);


TreeServer.prototype.listen = function() {
    return new Promise((resolve, reject) => {
        this.callback = (e) => {
            if (e === undefined) {
                return resolve();
            }
            return reject(e);
        };
        this.server.listen();
    });
};

TreeServer.prototype.handleRoot = function(client, root) {
    if ((root === undefined) || (root.elements === undefined) || (root.elements < 1)) {
        this.emit("error", new Error("invalid request"));
        return;
    }

    const node = root.elements[0];
    if (node.path !== undefined) {
        this.handleQualifiedNode(client, node);
    }
    else if (node instanceof ember.Command) {
        // Command on root element
        this.handleCommand(client, this.tree, node.number);
    }
    else {
        this.handleNode(client, node);
    }
}

TreeServer.prototype.handleQualifiedNode = function(client, node) {
    const path = node.path;
    // Find this element in our tree
    const element = this.tree.getElementByPath(path);

    if ((element === null) || (element === undefined)) {
        this.emit("error", new Error(`unknown element at path ${path}`));
        return;
    }

    if ((node.children !== undefined) && (node.children.length === 1) &&
        (node.children[0] instanceof ember.Command)) {
        this.handleCommand(client, element, node.children[0].number);
    }
    else {
        if (node instanceof ember.QualifiedMatrix) {
            this.handleQualifiedMatrix(client, element, node);
        }
        else if (node instanceof ember.QualifiedParameter) {
            this.handleQualifiedParameter(client, element, node);
        }
    }
}


TreeServer.prototype.handleNode = function(client, node) {
    // traverse the tree
    let element = node;
    let path = [];
    while(element !== undefined) {
        if (element.number === undefined) {
            this.emit("error", "invalid request");
            return;
        }
        if (element instanceof ember.Command) {
            break;
        }
        let children = element.getChildren();
        if ((children === undefined) || (children.length === 0)) {
            break;
        }
        path.push(element.number);
        element = element.children[0];
    }
    let cmd = element;

    if (cmd === undefined) {
        this.emit("error", "invalid request");
        return;
    }

    element = this.tree.getElementByPath(path.join("."));

    if ((element === null) || (element === undefined)) {
        this.emit("error", new Error(`unknown element at path ${path}`));
        return;
    }

    if (cmd instanceof ember.Command) {
        this.handleCommand(client, element, cmd.number);
    }
    else if ((cmd instanceof ember.MatrixNode) && (cmd.connections !== undefined)) {
        this.handleMatrixConnections(client, element, cmd.connections);
    }
    else if ((cmd instanceof ember.Parameter) &&
        (cmd.contents !== undefined) && (cmd.contents.value !== undefined)) {
        // New value Received.
        this.setValue(element, cmd.contents.value, client);
    }
    else {
        this.emit("error", new Error(`invalid request format`));
    }
}

TreeServer.prototype.handleQualifiedMatrix = function(client, element, matrix)
{
    this.handleMatrixConnections(client, element, matrix.connections);
}

TreeServer.prototype.handleQualifiedParameter = function(client, element, parameter)
{
    if (parameter.contents.value !== undefined) {
        this.setValue(element, parameter.contents.value, client);
    }
}


TreeServer.prototype.handleMatrixConnections = function(client, matrix, connections, response = true) {
    var res;
    var root; // ember message root
    if (matrix.isQualified()) {
        root = new ember.Root();
        res = new ember.QualifiedMatrix(matrix.path);
        root.addChild(res);
    }
    else {
        res = new ember.MatrixNode(matrix.number);
        root = matrix._parent.getTreeBranch(res);
    }
    res.connections = {};
    for(let target in connections) {
        let connection = connections[target];
        var conResult = new ember.MatrixConnection(connection.target);
        res.connections[connection.target] = conResult;

        if (connection.sources === undefined) {
            conResult.sources = matrix.connections[connection.target].sources;
            continue;
        }
        else {
            if ((connection.operation === undefined) ||
                (connection.operation.value == ember.MatrixOperation.absolute)) {
                matrix.connections[connection.target].setSources(connection.sources);
                this.emit("matrix-change", {target: target, sources: connection.sources});
            }
            else if (connection.operation == ember.MatrixOperation.connect) {
                matrix.connections[connection.target].connectSources(connection.sources);
                conResult.sources = matrix.connections[connection.target].sources;
                this.emit("matrix-connect", {target: target, sources: connection.sources});
            }
            else { // Disconnect
                matrix.connections[connection.target].disconnectSources(connection.sources);
                conResult.sources = matrix.connections[connection.target].sources;
                this.emit("matrix-disconnect", {target: target, sources: connection.sources});
            }
            if (response) {
                conResult.sources = matrix.connections[connection.target].sources;
                conResult.disposition = ember.MatrixDisposition.modified;
            }
            else {
                conResult.operation = connection.operation;
            }
        }
    }
    if (client !== undefined) {
        client.sendBERNode(root);
    }
    this.updateSubscribers(matrix.getPath(), root, client);
}

const validateMatrixOperation = function(matrix, target, sources) {
    if (matrix === undefined) {
        throw new Error(`matrix not found with path ${path}`);
    }
    if (matrix.contents === undefined) {
        throw new Error(`invalid matrix at ${path} : no contents`);
    }
    if (matrix.contents.targetCount === undefined) {
        throw new Error(`invalid matrix at ${path} : no targetCount`);
    }
    if ((target < 0) || (target >= matrix.contents.targetCount)) {
        throw new Error(`invalid target id at ${target}`);
    }
    if (sources.length === undefined) {
        throw new Error("invalid sources format");
    }
}

const doMatrixOperation = function(server, path, target, sources, operation) {
    let matrix = server.tree.getElementByPath(path);

    validateMatrixOperation(matrix, target, sources);

    let connections = new ember.MatrixConnection(target);
    connections.sources = sources;
    connections.operation = operation;
    server.handleMatrixConnections(undefined, matrix, connections, false);
}

TreeServer.prototype.matrixConnect = function(path, target, sources) {
    doMatrixOperation(this, path, target, sources, ember.MatrixOperation.connect);
}

TreeServer.prototype.matrixDisconnect = function(path, target, sources) {
    doMatrixOperation(this, path, target, sources, ember.MatrixOperation.disconnect);
}

TreeServer.prototype.matrixSet = function(path, target, sources) {
    doMatrixOperation(this, path, target, sources, ember.MatrixOperation.absolute);
}

TreeServer.prototype.handleCommand = function(client, element, cmd) {
    if (cmd === ember.GetDirectory) {
        this.handleGetDirectory(client, element);
    }
    else if (cmd === ember.Subscribe) {
        this.handleSubscribe(client, element);
    }
    else if (cmd === ember.Unsubscribe) {
        this.handleUnSubscribe(client, element);
    }
    else {
        this.emit("error", new Error(`invalid command ${cmd}`));
    }
}


TreeServer.prototype.handleGetDirectory = function(client, element) {
    if (client !== undefined) {
        client.sendBERNode(element);
    }
}

TreeServer.prototype.handleSubscribe = function(client, element) {
    this.subscribe(client, element);
}

TreeServer.prototype.handleUnSubscribe = function(client, element) {
    this.unsubscribe(client, element);
}


TreeServer.prototype.subscribe = function(client, element) {
    const path = element.getPath();
    if (this.subscribers[path] === undefined) {
        this.subscribers[path] = new Set();
    }
    this.subscribers[path].add(client);
}

TreeServer.prototype.unsubscribe = function(client, element) {
    const path = element.getPath();
    if (this.subscribers[path] === undefined) {
        return;
    }
    this.subscribers[path].delete(client);
}

TreeServer.prototype.setValue = function(element, value, origin) {
    return new Promise((resolve, reject) => {
        // Change the element value if write access permitted.
        if ((element.contents !== undefined) &&
            (element.contents.access !== undefined) &&
            (element.contents.access.value > 1)) {
            element.contents.value = value;
            this.emit("value-change", element);
        }

        let res = this.handleGetDirectory(origin, element);
        // Update the subscribers
        this.updateSubscribers(element.getPath(), res, origin);
    });
}

TreeServer.prototype.updateSubscribers = function(path, response, origin) {
    if (this.subscribers[path] === undefined) {
        return;
    }

    for (let client of this.subscribers[path]) {
        if (client === origin) {
            continue; // already sent the response to origin
        }
        if (this.clients.has(client)) {
            client.queueMessage(response);
        }
        else {
            // clean up subscribers - client is gone
            this.subscribers[path].delete(client);
        }
    }
}

const parseObj = function(parent, obj, isQualified) {
    let path = parent.getPath();
    for(let i = 0; i < obj.length; i++) {
        let emberElement;
        let content = obj[i];
        let number = content.number !== undefined ? content.number : i;
        delete content.number;
        //console.log(`parsing obj at number ${number}`, content);
        if (content.value !== undefined) {
            //console.log("new parameter");
            // this is a parameter
            if (isQualified) {
                emberElement = new ember.QualifiedParameter(`${path}${path !== "" ? "." : ""}${number}`);
            }
            else {
                emberElement = new ember.Parameter(number);
            }
            emberElement.contents = new ember.ParameterContents(content.value);
            if (content.type) {
                emberElement.contents.type = ember.ParameterType.get(content.type);
                delete content.type;
            }
            else {
                emberElement.contents.type = ember.ParameterType.string;
            }
            if (content.access) {
                emberElement.contents.access = ember.ParameterAccess.get(content.access);
                delete content.access;
            }
            else {
                emberElement.contents.access = ember.ParameterAccess.read;
            }
        }
        else if (content.targetCount !== undefined) {
            //console.log("new matrix");
            if (isQualified) {
                emberElement = new ember.QualifiedMatrix(`${path}${path !== "" ? "." : ""}${number}`);
            }
            else {
                emberElement = new ember.MatrixNode(number);
            }
            emberElement.contents = new ember.MatrixContents();

            if (content.labels) {
                emberElement.contents.labels = [];
                for(let l = 0; l < content.labels.length; l++) {
                    emberElement.contents.labels.push(
                        new ember.Label(content.labels[l])
                    );
                }
                delete content.labels;
            }
        }
        else {
            //console.log("new node");
            if (isQualified) {
                emberElement = new ember.QualifiedNode(`${path}${path !== "" ? "." : ""}${number}`);
            }
            else {
                emberElement = new ember.Node(number);
            }
            emberElement.contents = new ember.NodeContents();
        }
        for(let id in content) {
            if ((id !== "children") && (content.hasOwnProperty(id))) {
                //console.log(`adding contents ${id}`);
                emberElement.contents[id] = content[id];
            }
            else {
                parseObj(emberElement, content.children, isQualified);
            }
        }
        parent.addChild(emberElement);
    }
}

TreeServer.JSONtoTree = function(obj, isQualified = true) {
    let tree = new ember.Root();
    parseObj(tree, obj, isQualified);
    return tree;
}

module.exports = TreeServer;
