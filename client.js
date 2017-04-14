const EventEmitter = require('events').EventEmitter;
const util = require('util');
const winston = require('winston-color');
const net = require('net')

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
}

util.inherits(S101Client, EventEmitter);

S101Client.prototype.connect = function() {
    var self = this;
    self.socket = net.createConnection(self.port, self.address, () => {
        winston.debug('socket connected');
        self.emit('connected');
    });

    self.socket.on('data', (data) => {
        self.codec.dataIn(data);
    });

    self.socket.on('close', () => {
        self.socket = null;
    });
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

module.exports = S101Client;

