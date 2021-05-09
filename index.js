const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('privateKey.key'),
  cert: fs.readFileSync('certificate.crt')
};

https.createServer(options, (req, res) => {
    console.log(req.url);
    res.writeHead(200);
    res.end('hello world\n');

}).listen(8000);

let ejs = require('ejs');
let people = function(){ return "test"; };
let html = ejs.render('<%= people(); %>', {people: people});

console.log(html);