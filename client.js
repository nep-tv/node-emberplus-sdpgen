const EventEmitter = require('events').EventEmitter;
const util = require('util');
const winston = require('winston');
const net = require('net');
const BER = require('./ber.js');
const ember = require('./ember.js');

const S101Codec = require('./s101.js');

function S101Client(address, port) {
    var self = this;
    S101Client.super_.call(this);

    self.address = address;
    self.port = port;
    self.socket = null;

    self.codec = new S101Codec();
    self.connect();

    setInterval(() => {
        self.sendKeepaliveRequest();
    }, 10000);

    self.codec.on('keepaliveReq', () => {
        self.sendKeepaliveResponse();
    });

    self.codec.on('emberPacket', (packet) => {
        self.emit('emberPacket', packet);

        var ber = new BER.Reader(packet);
        try {
            var root = ember.Root.decode(ber);
            self.emit('emberTree', root);
        } catch(e) {
            console.log(e);
        }
    });
}

util.inherits(S101Client, EventEmitter);

S101Client.prototype.connect = function() {
    var self = this;
    self.emit('connecting');
    console.log("socket connecting");

    self.socket = net.createConnection(self.port, self.address, () => {
        winston.debug('socket connected');
        self.emit('connected');
    });

    self.socket.on('data', (data) => {
        self.codec.dataIn(data);
    });

    self.socket.on('close', () => {
        self.emit('disconnected');
        self.socket = null;
    });

    self.socket.on('error', (e) => {
        //self.emit('disconnected');
        //self.socket = null;
        console.log("Socket error", e);
    });
}

S101Client.prototype.disconnect = function() {
    var self = this;
    if(self.socket !== null) {
        self.socket.destroy();
        self.socket = null;
    }
}

S101Client.prototype.sendKeepaliveRequest = function() {
    var self = this;
    if(self.socket !== null) {
        self.socket.write(self.codec.keepAliveRequest());
        winston.debug('sent keepalive request');
    }
}

S101Client.prototype.sendKeepaliveResponse = function() {
    var self = this;
    if(self.socket !== null) {
        self.socket.write(self.codec.keepAliveResponse());
        winston.debug('sent keepalive response');
    }
}

S101Client.prototype.sendBER = function(data) {
    var self = this;
    var frames = self.codec.encodeBER(data);
    for(var i=0; i<frames.length; i++) {
        //console.log(frames);
        self.socket.write(frames[i]);
        //winston.info('sent frame', self.codec.validateFrame(frames[i].slice(1, frames[i].length-1)));
        //console.log(frames[i], 
        //    self.codec.validateFrame(frames[i].slice(1, frames[i].length-1)));
    }
}

S101Client.prototype.sendBERNode = function(node) {
    var self=this;
    if(node === null) return;
    var writer = new BER.Writer();
    node.encode(writer);
    self.sendBER(writer.buffer);

    //var reader = new BER.Reader(writer.buffer);
    //console.log(util.inspect(ember.Root.decode(reader), {depth:null}));
}

module.exports = S101Client;

