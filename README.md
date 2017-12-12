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

Basic trees of parameters should work.  Streams aren't there yet, but
shouldn't be too far off.  Everything else is probably missing at this point
(e.g. the newer matrix stuff).

QualifiedNode and QualifiedParameter have been added in release 1.1.0.
This version should be able to retrieve an EVS XT4k tree.
We intend to implement the server version with Matrix support pretty soon.

## Example usage

```javascript
const DeviceTree = require('emberplus').DeviceTree;

var tree = new DeviceTree("localhost", 9998);

tree.on('ready', () => {
        // When device returns a qualified node, you don't have a complete tree
        // Collect entire tree with the expand function.
        // The function returns a Promise
        tree.expand(tree.root.elements[0]).then((node) => {
            console.log(tree.root.elements[0]);
        }); 

        // You can also get one qualified parameter or node at a time.
        tree.getDirectory(root.elements[0]).then((node) => {
            console.log(tree.root.elements[0]);
        });

        // Subscribe to parameter changes
        tree.subscribe(node, (node) => {
            console.log("Volume changed: %d", node.contents.value);
        });

        // Change parameter value
        tree.setValue(node, -20.0);

    }).catch((e) => {
        console.log("Failed to resolve node:", e);
    });
});

```
