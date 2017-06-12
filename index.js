const S101Client = require('./client.js');
const ember = require('./ember.js');
const BER = require('./ber.js');
const util = require('util');
const DeviceTree = require('./device.js');

tree = new DeviceTree('patchbay.media.mit.edu', 9998);
tree.on('ready', () => {
    tree.getNodeByPath('R3LAYVirtualPatchBay/Sources/Monitor In/PeakValue', (error, node) => {
        if(error) {
            console.log(error);
            return;
        }
        console.log(util.inspect(node, {depth:null, colors:true}));
    });
});
