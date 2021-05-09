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

console.log(process.cwd());

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

        parser(analyze.file, true);

        /**/
    }

}).listen(8000);


let people = function(){ return "test"; };
let html = ejs.render('<%= people(); %>', {people: people});
console.log(html);

var composition = [];

function calculateRelativePos(from, to){
    if(to[0]=='"'||to[0]=="'") to = to.substr(1,to.length-2);

    var filename = path.basename(from);
    var dir = from.substr(0,from.length-filename.length);
    return (dir + path.basename(to)).replace('//','/');
}

var breaks = 0;
function writeCache(acc){
    var name = path.basename(__dirname)+'_'+breaks++;
    var fileName = 'cache/'+name+".ejs";
    composition.push(fileName);
    fs.writeFileSync(fileName, acc);

    ejs.renderFile(fileName, {}, {}, function(err, str){    
        if(err){
            var file = fs.readFileSync(fileName);
            var fileErr = ejsLint(file.toString());
            console.error(fileErr);
            _res.write(fileErr);
        }
        else {
            _res.write(str);      
        }
    });
}

function parser(filename, first=false){
    var breaks = 0;
    var res = fs.readFileSync(filename);
    var acc = '';
    var hasWrite = false;

    var externals = ['<%', '{', '}', 'var', 'const', 'let'];
    var internals = ['include','(',')', '%>',','];

    var activators = internals;
    var isInTag = false;
    var isInNormalTag = false;
    
    var isCalling = "";
    var lastArg = -1;
    var args = [];

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
            }
        }

        switch(winner){
            case '<%':
                isInTag = true;
                var next = res[j+1];
                isInNormalTag = next != ' ' 
                activators = internals;
                break;
            
            case '%>':
                isInTag = false;
                isInNormalTag = false;
                activators = externals;
                break;

            case 'include':
                isCalling = 'include';
                break;

            case '(':
                lastArg = j;
                break;
            
            case ',',')':
                args.push(acc.substr(lastArg+1, j-lastArg-1));
                lastArg = j;
            case ')':
                if(isCalling == 'include'){
                    acc = acc.substr(0,acc.indexOf('include'));
                    acc += "%>";

                    writeCache(acc);
                    hasWrite = true;

                    acc = "<%";

                    parser(calculateRelativePos(filename, args[0]));
                }    

                break;
        }
    }

    if(hasWrite == false)
        writeCache(acc);

    if(first)
        _res.end();
}