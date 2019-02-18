const DeviceTree = require('.').DeviceTree;
const fs = require('fs');
const http = require('http');
const sdpoker = require('sdpoker');
const sdp_mergers = 16;
const evs_4k_manglers = 16;
const evs_superslow_manglers = 16;


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
sdpmergerTree.children = generateChildren(sdpmergerTree.children);

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
        let output = element._parent.contents.header.join("\n") + "\n";
        for (let c of element._parent.children) {
            if (!c.contents.identifier.startsWith("Merged") && c.contents.value !== '') {
                output += stripSdpHeader(c.contents.value) + "\n";
            }
        }
        output += element._parent.contents.footer.join("\n");
        let groupedSdp = element._parent.getElementByIdentifier("Merged_SDP");
        groupedSdp.update({ contents: { value: output } });
    } else if (element._parent.contents.identifier.startsWith("EVS_4K")) {
        let output = element._parent.contents.header.join("\n");
        for (let c of element._parent.children) {
            if (!c.contents.identifier.startsWith("Mangled") && c.contents.value !== '') {
                output += "\n" + mangleSdpsForEvs4k(c.contents.value, c.contents.identifier.substr(-1));
            }
        }
        output += "\n" + element._parent.contents.footer.join("\n");
        let groupedSdp = element._parent.getElementByIdentifier("Mangled_SDP");
        groupedSdp.update({ contents: { value: output } });
    } else if (element._parent.contents.identifier.startsWith("EVS_SSM")) {
        let output = element._parent.contents.header.join("\n");
        for (let c of element._parent.children) {
            if (!c.contents.identifier.startsWith("Mangled") && c.contents.value !== '') {
                output += "\n" + mangleSdpsForEvsSsm(c.contents.value, c.contents.identifier.substr(-1));
            }
        }
        output += "\n" + element._parent.contents.footer.join("\n");
        let groupedSdp = element._parent.getElementByIdentifier("Mangled_SDP");
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

function mangleSdpsForEvs4k(sdp, phase) {
    let lines = sdp.split("\n");
    let outputArray = [];
    let headerDone = false;
    for (let l of lines) {
        if (l.startsWith("m=") && !headerDone) { headerDone = true; }
        if (l.startsWith("a=ts-refclk")) { continue; }
        else if (l.startsWith("a=mediaclk")) { continue; }
        else if (l.startsWith("a=mid:primary")) { 
            outputArray.push("a=mid:" + phase); 
            break;
        }
        else if (l.startsWith("a=fmtp")) {
            l = l.replace("width=1920;", "width=3840;");
            l = l.replace("height=1080;", "height=2160;");
            outputArray.push(l);
        }
        else if (headerDone && l !== '') { outputArray.push(l); }
    }

    return outputArray.join("\n");
}

function mangleSdpsForEvsSsm(sdp, phase) {
    let lines = sdp.split("\n");
    let outputArray = [];
    let headerDone = false;
    for (let l of lines) {
        if (l.startsWith("m=") && !headerDone) { headerDone = true; }
        if (l.startsWith("a=mid:primary")) { 
            outputArray.push("a=mid:" + phase); 
            break;
        }
        else if (headerDone && l !== '') { outputArray.push(l); }
    }
    
    return outputArray.join("\n");
}

function generateChildren(children) {
    let newChildren = [];
    for (let i = 0; i < sdp_mergers; i++) {
        let n = JSON.parse(JSON.stringify(children[0]));
        n.contents.identifier += i;
        n.contents.description += i;
        n.contents.header[1] += i;
        newChildren.push(n);
    }
    for (let i = 0; i < evs_4k_manglers; i++) {
        let n = JSON.parse(JSON.stringify(children[1]));
        n.contents.identifier += i;
        n.contents.description += i;
        n.contents.header[1] += i;
        newChildren.push(n);
    }
    for (let i = 0; i < evs_superslow_manglers; i++) {
        let n = JSON.parse(JSON.stringify(children[2]));
        n.contents.identifier += i;
        n.contents.description += i;
        n.contents.header[1] += i;
        newChildren.push(n);
    }
    return newChildren;
}