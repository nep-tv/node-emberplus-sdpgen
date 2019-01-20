// Change this IP Address to LSM Server
const LSM_SERVER_IP = "192.168.210.102";
const AUDIO_PACKET_TIME = 0.125;
const AUDIO_FRAME_COUNT = 6; // Note: Assumption is 48000

// ############################################################
// ############################################################
// ############################################################

const axios = require('axios');
const request = require('sync-request');
const DeviceTree = require('.').DeviceTree;
const TreeServer = require(".").TreeServer;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

axios.get('https://'+LSM_SERVER_IP+'/x-nmos/node/v1.1/senders')
    .then(response => {

        let promises = [];
        let flows = [];

        let i=0;
        response.data.forEach(function(sender) {

            promises[i] = axios.get(sender.manifest_href);
            flows[sender.manifest_href] = sender.label;
            i++;
        });

        Promise.all(promises).then(function(values) {

            var FlowJSON = [];
            var DeviceJSON = [];
            var strSDP;

            values.forEach(function(sdp) {
                strSDP = sdp.data;
                if (sdp.data.includes('exactframerate=25')) {
                    strSDP = strSDP.replace(/SSN=ST2110-20:2017/g, "SSN=ST2110-20:2017; interlace=1 ");
                }

                FlowJSON.push('{"contents":{"identifier":"' + flows[sdp.config.url] + '","value":"' + strSDP + '","access":"read","type":"string"}}');
            });

            DeviceJSON.push('{"contents":{"isOnline":true,"identifier":"SonyLSM","description":"Sony LSM NMI Server"},"children":[' + FlowJSON +']}');
            let jsonConfig = '[{"contents":{"isOnline":true,"identifier":"TFC","description":"TFC"},"children":[{"contents":{"isOnline":true,"identifier":"SDPGenerator","description":"Node JS SDP Generator"},"children":[' + DeviceJSON + ']}]}]';
            jsonConfig = jsonConfig.replace(/\n/g, " \\r\\n");
            jsonConfig = jsonConfig.replace(/channel1/g, "primary");
            jsonConfig = jsonConfig.replace(/channel2/g, "secondary");
            jsonConfig = jsonConfig.replace(/a=rtpmap:(\d*) L(\d*)\/(\d*)\/(\d*)/g, "a=rtpmap:$1 L$2/$3/$4 \\r\\na=ts-refclk:localmac=00-0B-72-06-08-77 \\r\\na=mediaclk:direct=0 rate=$3 \\r\\na=clock-domain:local=0 \\r\\na=framecount:" + AUDIO_FRAME_COUNT + " \\r\\na=ptime:" + AUDIO_PACKET_TIME);

            var root;
            var tree = new DeviceTree("0.0.0.0", 9090);
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
            var jsonTree = JSON.parse(jsonConfig);
            var objEmberTree = TreeServer.JSONtoTree(jsonTree);

            const server = new TreeServer("0.0.0.0", 9090, objEmberTree);
            server.listen().then(() => {
                console.log("Ember+ Server Started at TCP 0.0.0.0:9090");
            }).catch((e) => { console.log(e.stack); });

        });

    })
    .catch(error => {
        console.log(error);
    });