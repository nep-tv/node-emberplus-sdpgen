const DeviceTree = require('.').DeviceTree;
const fs = require('fs');
const http = require('http');
const sdpoker = require('sdpoker');


var root;
var tree = new DeviceTree("0.0.0.0", 9090);
const ember = require('./ember.js');
tree.connect()
    .then(() => {
        return tree.getDirectory();
    })
    .then((r) => {
        root = r ;
        return tree.expand(r.elements[0]);
    })
    .then(() => {
        console.log("Ember Initialised");
    })
    .catch((e) => {
        console.log(e.stack);
    });

// Server
const TreeServer = require(".").TreeServer;
var jsonConfig = fs.readFileSync('config.json');
var jsonTree = JSON.parse(jsonConfig);
var sdpokerTree = JSON.parse(fs.readFileSync('sdpokerTree.json'));
jsonTree[0].children.push(sdpokerTree);

var objEmberTree = TreeServer.JSONtoTree(jsonTree);

const server = new TreeServer("0.0.0.0", 9090, objEmberTree);

server.listen().then(() => {
    console.log("Ember+ Server Started at TCP 0.0.0.0:9090");


    httpserver = http.createServer( function(req, res) {
        var html = fs.readFileSync('form.html');
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(html);
    });

    port = 3000;
    host = '0.0.0.0';
    httpserver.listen(port, host);
    console.log('Webserver Started at http://' + host + ':' + port);


}).catch((e) => { console.log(e.stack); });

server.on("value-change", (element) => {
    if (element.contents.identifier === "SDPoker-input") {
        let output = element._parent.getElementByIdentifier("SDPoker-output");
        let poke = sdpoker.checkST2110(element.contents.value, {});
        output.update({ contents: { value: poke.map(e => e ? e.message + "\n" : undefined)} });
    }
});
    