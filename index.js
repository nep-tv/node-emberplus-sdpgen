const TreeServer = require("./server");
const fs = require('fs');
const http = require('http');
const sdpoker = require('sdpoker');
const axios = require('axios');

// Change this IP Address to LSM Server
const LSM_SERVER_IP = "192.168.110.102";
const AUDIO_PACKET_TIME = 0.125;
const AUDIO_FRAME_COUNT = 6; // Note: Assumption is 48000

// Set amount of child nodes in parser
const sdp_parsers = 16;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let lsmConfig = '';

console.log("Attempting to connect to LSM...");
axios.get('https://'+LSM_SERVER_IP+'/x-nmos/node/v1.1/senders', { timeout: 3000 })
    .then( async (response) => {
	
        let promises = [];
        let flows = [];

        let i=0;
        response.data.forEach(function(sender) {

            promises[i] = axios.get(sender.manifest_href);
            flows[sender.manifest_href] = sender.label;
            i++;
        });
		
        await Promise.all(promises).then(function(values) {
			
            var FlowJSON = [];
            var strSDP;

            values.forEach(function(sdp) {
                strSDP = sdp.data;
                if (sdp.data.includes('exactframerate=25')) {
                    strSDP = strSDP.replace(/SSN=ST2110-20:2017/g, "SSN=ST2110-20:2017; interlace=1 ");
                }

                FlowJSON.push('{"contents":{"identifier":"' + flows[sdp.config.url] + '","value":"' + strSDP + '","access":"read","type":"string"}}');
            });

            lsmConfig = '{"contents":{"isOnline":true,"identifier":"SonyLSM","description":"Sony LSM NMI Server"},"children":[' + FlowJSON +']}'; 
            lsmConfig = lsmConfig.replace(/\n/g, " \\r\\n");
            lsmConfig = lsmConfig.replace(/channel1/g, "primary");
            lsmConfig = lsmConfig.replace(/channel2/g, "secondary");
            lsmConfig = lsmConfig.replace(/a=rtpmap:(\d*) L(\d*)\/(\d*)\/(\d*)/g, "a=rtpmap:$1 L$2/$3/$4 \\r\\na=ts-refclk:localmac=00-0B-72-06-08-77 \\r\\na=mediaclk:direct=0 rate=$3 \\r\\na=clock-domain:local=0 \\r\\na=framecount:" + AUDIO_FRAME_COUNT + " \\r\\na=ptime:" + AUDIO_PACKET_TIME);
			
        });

    })
    .catch(error => {
        console.log(error);
	})
	.then(() => {
		
		var jsonConfigFile = fs.readFileSync('config.json');
		var jsonTree = JSON.parse(jsonConfigFile);
		if (lsmConfig !== '') {
			jsonTree[0].children[0].children.unshift(JSON.parse(lsmConfig));
		}

		// Add SDPoker node
		var sdpokerTree = JSON.parse(fs.readFileSync('sdpokerTree.json'));
		jsonTree[0].children.push(sdpokerTree);

		// Add SDP parser node
		var sdpParserTree = JSON.parse(fs.readFileSync('sdpParserTree.json'));
		for (let i = 0; i < sdpParserTree.children.length; i++) {
			sdpParserTree.children[i].children = makeMoreChildren(sdpParserTree.children[i].children[0]);
		}
		jsonTree[0].children.push(sdpParserTree);
		
		var objEmberTree = TreeServer.JSONtoTree(jsonTree);

		const server = new TreeServer("0.0.0.0", 9090, objEmberTree);

		server.listen().then(() => {
			console.log("Ember+ Server Started at TCP 0.0.0.0:9090");

			let httpserver = http.createServer( function(req, res) {
				var html = fs.readFileSync('form.html');
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end(html);
			});

			let port = 3000;
			let host = '0.0.0.0';
			httpserver.listen(port, host);
			console.log('Webserver Started at http://' + host + ':' + port);

		}).catch((e) => { console.log(e.stack); });

		//server._debug = true;
		server.on("value-change", (element) => {
			if (element.contents.identifier === "SDPoker_input") {
				if (element.contents.value === '') { return; }
				let output = element._parent.getElementByIdentifier("SDPoker_output");
				let poke = sdpoker.checkST2110(element.contents.value, {nmos: true});
				output.update({ contents: { value: poke.map(e => e ? e.message + "\n" : undefined).join('')} });
			} 
			else if (element._parent.contents.mergerType > 0) { // If parameter is part of an SDP merger node
				let output = element._parent.contents.header.join("\n");
				for (let c of element._parent.children) {
					if (c.number > 1 && c.contents.value !== '') {
						switch (element._parent.contents.mergerType) {
							case 1: // Standard merger
								output +=  "\n" + stripSdpHeader(c.contents.value);
								break;
							case 2: // EVS 4K mangler
								output += "\n" + mangleSdpsForEvs(c.contents.value, c.contents.identifier.substr(-1), true);
								break;
							case 3: // EVS SSM mangler
								output += "\n" + mangleSdpsForEvs(c.contents.value, c.contents.identifier.substr(-1));
								break;
							default:
								return false;
						}
					}
				}
				output += element._parent.contents.footer.join("\n");
				let groupedSdp = element._parent.getElementByIdentifier("Merged_SDP");
				groupedSdp.update({ contents: { value: output } });
			}
		});
	});


// Server




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

function mangleSdpsForEvs(sdp, phase, sdp_is_4k = false) {
    let lines = sdp.split("\n");
    let outputArray = [];
    let headerDone = false;
    for (let l of lines) {
        if (l.startsWith("m=") && !headerDone) { headerDone = true; }
        if (sdp_is_4k && l.startsWith("a=ts-refclk")) { continue; }
        else if (sdp_is_4k && l.startsWith("a=mediaclk")) { continue; }
        else if (l.startsWith("a=mid:primary")) { 
            outputArray.push("a=mid:" + phase); 
            break;
        }
        else if (sdp_is_4k && l.startsWith("a=fmtp")) {
            l = l.replace("width=1920;", "width=3840;");
            l = l.replace("height=1080;", "height=2160;");
            outputArray.push(l);
        }
        else if (headerDone && l !== '') { outputArray.push(l); }
    }

    return outputArray.join("\n");
}

function makeMoreChildren(child) {
    let newChildren = [];
    for (let i = 0; i < sdp_parsers; i++) {
        let n = JSON.parse(JSON.stringify(child));
        n.contents.identifier += i;
        n.contents.description += i;
        n.contents.header[2] += i;
        newChildren.push(n);
    }
    return newChildren;
}