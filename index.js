const https = require('https');
const fs = require('fs');
let ejs = require('ejs');

const options = {
  key: fs.readFileSync('privateKey.key'),
  cert: fs.readFileSync('certificate.crt')
};

var supportedFormats = ['ejs','html']

function searchPath(url){
    url = 'htdocs/'+url;

    if(fs.existsSync(url)){
        if(fs.lstatSync(url).isDirectory()){
            for(var format of supportedFormats){
                if(fs.existsSync(url + "."+format)){
                    url += "."+format;
                    break;
                }
            }
        }
    } else {
        var split = url.split('/');
        var cur = '';
        var lastBlackHole = '';
        var req = '';
        for(var s of split){
            cur += s +'/';
            if(!fs.existsSync(cur)){
                req += '/'+s;
            }
)
            if(fs.existsSync(cur+'_blackhole.ejs')){
                lastBlackHole = cur+'_blackhole.ejs';
                req = '';
            }
        }

        return {exists: fs.existsSync(lastBlackHole), file: lastBlackHole, req: req};
    }

    return {exists: fs.existsSync(url), file: url};
}

https.createServer(options, (req, res) => {
    //Analyze req.url
    var analyze = searchPath(req.url);

    console.log(analyze);

    if(!analyze.exists){
        res.writeHead(404);
        res.end('Page not found');
    }
    else {
        res.writeHead(200);
        res.end('hello world\n');
    }

}).listen(8000);


let people = function(){ return "test"; };
let html = ejs.render('<%= people(); %>', {people: people});
console.log(html);