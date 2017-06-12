# node-emberplus

This is an implementation of [Lawo's
Ember+](https://github.com/Lawo/ember-plus) control protocol for Node.  One of
Node's great strengths is the ready availability of frameworks for various
communication protocols and user interfaces; this module allows those to be
integrated with Ember+ somewhat more easily than the reference libember C++
implementation.

It is, at this point in time, still very much a work in progress.  I am
developing it primarily to control our instance of [Virtual Patch
Bay](http://www.r3lay.com/product/vpb-virtual-patch-bay/), which seems to make
use of only a subset of of the Glow DTD.  As such, I'm focusing on
implementing the parts of the DTD that are necessary for my use case.  Please
consider this highly experimental code; any use in production environments is
entirely at your own risk.
