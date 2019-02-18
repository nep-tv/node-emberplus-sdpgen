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

var sdpmergerTree = JSON.parse(fs.readFileSync('sdpmergerTree.json'));

let mergerNodeProto = sdpmergerTree.children.pop();
for (let i = 0; i < 16; i++) {
    let n = JSON.parse(JSON.stringify(mergerNodeProto));
    n.contents.identifier += i;
    n.contents.description += i;
    n.contents.sdp[1] += i;
    sdpmergerTree.children.push(n);
}

jsonTree[0].children.push(sdpmergerTree);

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
    if (element.contents.identifier === "SDPoker_input") {
        if (element.contents.value === '') { return; }
        let output = element._parent.getElementByIdentifier("SDPoker_output");
        let poke = sdpoker.checkST2110(element.contents.value, {nmos: true});
        output.update({ contents: { value: poke.map(e => e ? e.message + "\n" : undefined).join('')} });
    } else if (element._parent.contents.identifier.startsWith("SDP_merger")) {
        let sdps = [];
        for (let c of element._parent.children) {
            if (!c.contents.identifier.startsWith("Merged")) {
                sdps.push(c.contents.value);
            }
        }
        let groupedSdp = element._parent.getElementByIdentifier("Merged_SDP");
        let output = element._parent.contents.sdp.join("\n") + "\n" + sdps.map(e => stripSdpHeader(e)).join('');
        groupedSdp.update({ contents: { value: output } });

    }
});

function stripSdpHeader(sdp) {
    //console.log(sdp);
    let lines = sdp.split("\n");
    let outputArray = [];
    let headerDone = false;
    for (let l of lines) {
        if (l.startsWith("m=") && !headerDone) { headerDone = true; }
        if (headerDone && l !== '') { outputArray.push(l); }
    }
    return outputArray.join("\n");
}