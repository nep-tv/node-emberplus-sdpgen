const DeviceTree = require('.').DeviceTree;
const fs = require('fs');
const http = require('http');


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
