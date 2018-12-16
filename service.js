var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
    name:'Node SDP Generator',
    description: 'NodeJS SDP Generator for Ember+ Subscribers',
    script: 'C:\\Node\\node-emberplus-sdpgen\\lsmsdpgen.js',
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ],
    wait: 2,
    grow: .5
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
    svc.start();
});

svc.install();