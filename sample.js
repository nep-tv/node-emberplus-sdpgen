const Decoder = require('.').Decoder;
const DeviceTree = require(".").DeviceTree;
const fs = require("fs");

const LOCALHOST = "127.0.0.1";
const PORT = 9008;

fs.readFile("./embrionix.ember", (e, data) => {
    let root = Decoder(data);

    const TreeServer = require("./").TreeServer;
    const server = new TreeServer(LOCALHOST, PORT, root);
    server.listen()
        .then(() => {
            console.log("listening");
        })
        .catch((e) => {
            console.log(e.stack);
        })
        .then(() => {
            let tree = new DeviceTree(LOCALHOST, PORT);
            return Promise.resolve()
                .then(() => tree.connect())
                .then(() => {
                    return tree.getDirectory();
                })
                .then(() => tree.disconnect())
                .then(() => tree.connect())
                .then(() => {
                    return tree.getDirectory();
                })
                .catch((e) => {
                    console.log(e.stack);
                })
                .then(() => tree.disconnect())
        })
        .then(() => {
            console.log("close");
            server.close();
        });
});
