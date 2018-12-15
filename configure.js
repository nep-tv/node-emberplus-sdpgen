const http = require('http');
const fs = require('fs');


httpserver = http.createServer( function(req, res) {
        var html = fs.readFileSync('form.html');
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(html);
});

port = 3000;
host = '0.0.0.0';
httpserver.listen(port, host);
console.log('Webserver Started at http://' + host + ':' + port);
