const https = require('https');
const fs = require('fs');
let ejs = require('ejs');
const ejsLint = require('ejs-lint');
var path = require("path");

const options = {
  key: fs.readFileSync('privateKey.key'),
  cert: fs.readFileSync('certificate.crt')
};

let _req, _res;

var supportedFormats = ['ejs','html']

function searchPath(url){
    url = 'htdocs/'+url;

    if(fs.existsSync(url)){
        if(fs.lstatSync(url).isDirectory()){
            for(var format of supportedFormats){
                if(fs.existsSync(url + "index."+format)){
                    url += "index."+format;
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

            if(fs.existsSync(cur+'_blackhole.ejs')){
                lastBlackHole = cur+'_blackhole.ejs';
                req = '';
            }
        }

        return {exists: fs.existsSync(lastBlackHole), file: lastBlackHole, req: req};
    }

    return {exists: fs.existsSync(url), file: url};
}

function include(file){
    var res = fs.readFileSync(currentFile+file);
    _res.write(res);
    return res;
}

var currentFile = 'htdocs/';

https.createServer(options, (req, res) => {
    _req = req;
    _res = res;

    //Analyze req.url
    var analyze = searchPath(req.url);
    currentFile = path.dirname(analyze.file);
    console.log(analyze);

    if(!analyze.exists){
        res.writeHead(404);
        res.end('Page not found');
    }
    else {
        res.writeHead(200);

        splitter(analyze.file);

        /*ejs.renderFile(analyze.file, {include: include}, {}, function(err, str){    
            if(err){
                var file = fs.readFileSync(analyze.file);
                var fileErr = ejsLint(file.toString());
                console.error(fileErr);
                res.write(fileErr);
            }
            else {
                res.write(str);      
                console.log(str);
            }
        });*/

        res.end();
    }

}).listen(8000);


let people = function(){ return "test"; };
let html = ejs.render('<%= people(); %>', {people: people});
console.log(html);

function splitter(filename){
    var activators = ['<%', '%>', '{', '}', 'var', 'const', 'let'];
    var maxLength = 5;

    var res = fs.readFileSync(filename);
    var acc = '';

    var j=0;
    for(; j<res.length; j++){
        nch = res[j];
        var ch = String.fromCharCode(nch);
        acc += ch;

        var winner = -1;
        for(var act of activators){
            for(var i=0; i<act.length; i++){
                if(acc[(acc.length-act.length)+i] != act[i])
                    break;
            }
            if(i == act.length){
                 winner = act;
                 acc = '';
            }
        }

        switch(winner){
            case '<%':
                
                break;
        }
    }
}