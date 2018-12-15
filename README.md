# Node Ember+ SDP Generator

This is an implementation of [Lawo's
Ember+](https://github.com/Lawo/ember-plus) control protocol to advertised ST2110-20 video flows over ember. Using a 
basic web form you can generate an expressive JSON document that defines an Ember Tree with SDP parameters. These values 
will be accessible by any Ember+ subscriber over port 9090.

It has been primarily designed to quickly generate handmade SDPs for devices that do not support SDP and enable them to 
be used as Gadgets in Lawo's VSM software. It is a suggested workaround for integrating Sony LSM products into VSM's 
Network routing layer.     

This is an open source project supported by NEP Australia. Feel free to provide feedback using contacts below.

## Supported Use
This should broadly work on any Node.JS server however has been designed and tested on Node.Js 10.13. It has been tested 
on Windows 10, Windows Server 2016 and Ubuntu Server 18.04.

Note: This has been developed as a quick tool and should be tested before use in production. We will update this message 
after we have run in a production environment. We recommended checking back regularly or watching the GitHub repo for 
updates. Please contact with any bugs or feature requests.  

## Roadmap
Future implementations will include validation of data inputs on configuration utility, verification of SDP to ST2110 
standard and windows logging for the service. 

Possibly interested in using NMOS to dynamically generate SDPs based on configuration on Sony LSM servers.  

## Contact
Dan Murphy
dmurphy@nepgroup.com

## Credits
Ember+ Server Build from https://github.com/evs-broadcast/node-emberplus

Originally forked from https://github.com/bmayton/node-emberplus

Developed From Idea by Anthony Tunen at Lawo

## Install and usage
First install NPM if not installed https://www.npmjs.com/get-npm

Use "Install.bat" to install. Then use "SDP Generator.bat" to run service.

##### Run in Node natively 
```javascript
//Install dependencies
npm install

// Run SDP Generator Ember+ Service and Web Configuration Utility
node sdpgen.js


