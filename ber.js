const BER = require('asn1').Ber;
const errors = require('./errors.js');
const util = require('util');
const Long = require('long');

var APPLICATION = function(x) { return x | 0x60; };
var CONTEXT = function(x) { return x | 0xa0; };
var UNIVERSAL = function(x) { return x; };

const EMBER_SET = 0x20 | 17;
const EMBER_STRING = 12;


module.exports.APPLICATION = APPLICATION;
module.exports.CONTEXT = CONTEXT;
module.exports.UNIVERSAL = UNIVERSAL;
module.exports.EMBER_SET = EMBER_SET;
module.exports.EMBER_STRING = EMBER_STRING;

function ExtendedReader(data) {
    ExtendedReader.super_.call(this, data);
}

util.inherits(ExtendedReader, BER.Reader);
module.exports.Reader = ExtendedReader;

ExtendedReader.prototype.getSequence = function(tag) {
    //var seq = this.readSequence(tag);
    //if(seq === null) return null;

    //var buf = this._buf.slice(this._offset, this._offset + this._len);

    var buf = this.readString(tag, true);
    return new ExtendedReader(buf);
}

ExtendedReader.prototype.readValue = function() {
    var tag = this.peek(tag);
    if(tag == EMBER_STRING) {
        return this.readString(EMBER_STRING);
    } else if(tag == UNIVERSAL(2)) {
        return this.readInt();
    } else if(tag == UNIVERSAL(9)) {
        // real, need to write decoder
        //throw new errors.UnimplementedEmberTypeError(tag);
        return this.readReal();
    } else if(tag == UNIVERSAL(1)) {
        return this.readBoolean();
    } else if(tag == UNIVERSAL(4)) {
        return this.readString(UNIVERSAL(4), true);
    } else {
        throw new errors.UnimplementedEmberTypeError(tag);
    }
}

ExtendedReader.prototype.readRealBad = function(tag) {
    if(tag !== undefined) {
        tag = UNIVERSAL(9);
    }

    var b = this.peek();
    if(b === null) {
        return null;
    }

    var buf = this.readString(b, true);

    if(buf.length == 0) {
        return 0;
    }

    //console.log(buf);

    var preamble = buf.readUInt8(0);
    var o = 1;

    if(buf.length == 1 && preamble == 0x40) {
        return Infinity;
    } else if(buf.length == 1 && preamble == 0x41) {
        return -Infinity;
    } else if(buf.length == 1 && preamble == 0x42) {
        return NaN;
    }

    var sign = (preamble & 0x40)? -1 : 1;
    var exponentLength = 1 + (preamble & 3);
    var significandShift = (preamble >> 2) & 3;

    //console.log("significandShift: %d", significandShift);
    
    // I'm not entirely confident that what follows is correct in all cases.
    // There seem to be few examples of BER for Real types out in the wild.
    // libember handles this by manipulating raw bits of an IEEE double,
    // which doesn't work so well in JavaScript.  I think the below
    // has the same behavior as libember (which mandates binary base-2).

    var exponent = 0;
    
    if(buf.length - o < exponentLength) {
        throw new errors.ASN1Error('Invalid ASN.1; not enough length to contain exponent');
    }

    if(buf.readUInt8(o) & 0x80) {
        exponent = -1;
    }

    for(var i=0; i<exponentLength; i++) {
        exponent = (exponent << 8) | buf.readUInt8(o++);
    }

    var significand = 0;
    while(o < buf.length) {
        significand = (significand << 8) | buf.readUInt8(o++);
    }

    significand = (significand << significandShift);

    while(significand > 2.0) {
        significand = significand / 2.0;
    }

    value = sign * significand * Math.pow(2, exponent);
    //console.log("Real = %d [%d * %d ^ %d]", 
    //    value, significand, 2, exponent);

    return value
}

ExtendedReader.prototype.readReal = function(tag) {
    if(tag !== undefined) {
        tag = UNIVERSAL(9);
    }

    var b = this.peek();
    if(b === null) {
        return null;
    }

    var buf = this.readString(b, true);

    if(buf.length == 0) {
        return 0;
    }

    //console.log(buf);

    var preamble = buf.readUInt8(0);
    var o = 1;

    if(buf.length == 1 && preamble == 0x40) {
        return Infinity;
    } else if(buf.length == 1 && preamble == 0x41) {
        return -Infinity;
    } else if(buf.length == 1 && preamble == 0x42) {
        return NaN;
    }

    var sign = (preamble & 0x40)? -1 : 1;
    var exponentLength = 1 + (preamble & 3);
    var significandShift = (preamble >> 2) & 3;

    var exponent = 0;
    
    if(buf.readUInt8(o) & 0x80) {
        exponent = -1;
    }
    
    if(buf.length - o < exponentLength) {
        throw new errors.ASN1Error('Invalid ASN.1; not enough length to contain exponent');
    }

    for(var i=0; i<exponentLength; i++) {
        exponent = (exponent << 8) | buf.readUInt8(o++);
    }

    var significand = new Long(0, 0, true);
    while(o < buf.length) {
        significand = significand.shl(8).or(buf.readUInt8(o++));
    }

    significand = significand.shl(significandShift);

    var mask = Long.fromBits(0x00000000, 0x7FFFF000, true)
    while(significand.and(mask).eq(0)) {
        significand = significand.shl(8);
    }
    
    mask = Long.fromBits(0x00000000, 0x7FF00000, true)
    while(significand.and(mask).eq(0)) {
        significand = significand.shl(1);
    }

    significand = significand.and(Long.fromBits(0xFFFFFFFF, 0x000FFFFF, true));

    exponent = Long.fromNumber(exponent);
    var bits = exponent.add(1023).shl(52).or(significand);
    if(sign < 0) {
        bits = bits.or(Long.fromBits(0x00000000, 0x80000000, true));
    }

    var fbuf = Buffer.alloc(8);
    fbuf.writeUInt32LE(bits.getLowBitsUnsigned(), 0);
    fbuf.writeUInt32LE(bits.getHighBitsUnsigned(), 4);

    return fbuf.readDoubleLE(0);
}

function ExtendedWriter(options) {
    ExtendedWriter.super_.call(this, options);
}

ExtendedWriter._shorten = function(value) {
    var size = 4;
    while((((value & 0xff800000) === 0) || ((value & 0xff800000) === 0xff800000 >> 0)) &&
             (size > 1)) {
        size--;
        value <<= 8;
    }
    
    return {size, value}
}

ExtendedWriter._shortenLong = function(value) {
    var mask = Long.fromBits(0x00000000, 0xff800000, true);
    value = value.toUnsigned();

    var size = 8;
    while(value.and(mask).eq(0) || (value.and(mask).eq(mask) && (size > 1))) {
        size--;
        value = value.shl(8);
    }

    return {size, value};
}

ExtendedWriter.prototype.writeReal = function(value, tag) {
    if(tag === undefined) {
        tag = UNIVERSAL(9);
    }

    this.writeByte(tag);
    if(value == 0) {
        this.writeLength(0);
        return;
    } else if(value == Infinity) {
        this.writeLength(1);
        this.writeByte(0x40);
        return;
    } else if(value == -Infinity) {
        this.writeLength(1);
        this.writeByte(0x41);
        return;
    } else if(isNaN(value)) {
        this.writeLength(1);
        this.writeByte(0x42);
        return;
    }

    var fbuf = Buffer.alloc(8);
    fbuf.writeDoubleLE(value, 0);


    var bits = Long.fromBits(fbuf.readUInt32LE(0), fbuf.readUInt32LE(4), true);
    //console.log(bits);
    var significand = bits.and(Long.fromBits(0xFFFFFFFF, 0x000FFFFF, true)).or(
        Long.fromBits(0x00000000, 0x00100000, true));
    var exponent = bits.and(Long.fromBits(0x00000000, 0x7FF00000, true)).shru(52)
        .sub(1023).toSigned();
    while(significand.and(0xFF) == 0)
        significand = significand.shru(8);
    while(significand.and(0x01) == 0) 
        significand = significand.shru(1);

    //console.log(significand, exponent);
    exponent = exponent.toNumber();
    //console.log(significand.toNumber(), exponent);
    
    exponent = ExtendedWriter._shorten(exponent);
    significand = ExtendedWriter._shortenLong(significand);

    this.writeLength(1 + exponent.size + significand.size);
    var preamble = 0x80;
    if(value < 0) preamble |= 0x40;
    this.writeByte(preamble);

    for(var i=0; i<exponent.size; i++) {
        this.writeByte((exponent.value & 0xFF000000) >> 24);
        exponent.value <<= 8;
    }

    var mask = Long.fromBits(0x00000000, 0xFF000000, true);
    for(var i=0; i<significand.size; i++) {
        var b = significand.value.and(mask);
        //console.log("masked:", b);
        this.writeByte(significand.value.and(mask).shru(56).toNumber());
        significand.value = significand.value.shl(8);
    }
}

util.inherits(ExtendedWriter, BER.Writer);
module.exports.Writer = ExtendedWriter;
