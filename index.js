const https = require('https');
const fs = require('fs');
let ejs = require('ejs');
const ejsLint = require('ejs-lint');
var path = require("path");

const options = {
  key: fs.readFileSync('privateKey.key'),
  cert: fs.readFileSync('certificate.crt')
};

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

/*function include(file){
    var res = fs.readFileSync(currentFile+file);
    _res.write(res);
    return res;
}*/

var currentFile = 'htdocs/';

https.createServer(options, (req, res) => {
    var bag = {
        req: req,
        res: res
    };

    //Analyze req.url
    var analyze = searchPath(req.url);
    //currentFile = path.dirname(analyze.file);
    console.log(analyze);

    if(!analyze.exists){
        res.writeHead(404);
        res.end('Page not found');
    }
    else {
        res.writeHead(200);

        parser(bag, analyze.file, true);

        /**/
    }

}).listen(8000);


/*let people = function(){ return "test"; };
let html = ejs.render('<%= people(); %>', {people: people});
console.log(html);*/

var composition = [];

function calculateRelativePos(from, to){
    if(to[0]=='"'||to[0]=="'") to = to.substr(1,to.length-2);

    var filename = path.basename(from);
    var dir = from.substr(0,from.length-filename.length);
    return (dir + path.basename(to)).replace('//','/');
}

function parser(bag, filename, first=false){
    if(first){
        bag.breaks = 0;
        bag.parserOrder = {};
        bag.obj = {data:23};
    }

    var res = fs.readFileSync(filename);
    var acc = '';

    var absPath = path.resolve(filename).replaceAll('/','-').replaceAll('\\','-').replaceAll(':','');
    bag.parserOrder[absPath] = [];

    var externals = ['<%', '{', '}',','];
    var internals = ['include', 'out', '(',')', '%>',','];
    var shared =    ['var', 'const', 'let']
    var isInternal = false;

    var activators = internals;
    var isInTag = false;
    var isInNormalTag = false;
    
    var isCalling = "";
    var lastArg = -1;
    var args = [];

    var varCtrl = undefined;
    var vars = {};

    var j=0;

    function write(str, register=false){
        acc += str;
        if(!register) j += str.length;
    }

    var breaks = 0;
    function writeCache(){
        var b = breaks++;
        bag.parserOrder[absPath].push(b);
        var name = absPath+'_'+breaks++;
        var fileName = 'cache/'+name+".ejs";
        composition.push(fileName);
        fs.writeFileSync(fileName, acc);
    
        ejs.renderFile(fileName, bag.obj, {}, function(err, str){    
            if(err){
                var file = fs.readFileSync(fileName);
                var fileErr = ejsLint(file.toString());
                console.error(fileErr);
                bag.res.write(fileErr);
            }
            else {
                bag.res.write(str);      
            }
        });
    }

    for(; j<res.length; j++){
        nch = res[j];
        var ch = String.fromCharCode(nch);
        acc += ch;

        if(varCtrl) varCtrl.read(ch)

        var winner = -1;
        for(var act of activators){
            checkActivator(act);
        }

        if(winner==-1) for(var act of shared){
            checkActivator(act);
        }

        function checkActivator(act){
            for(var i=0; i<act.length; i++){
                if(acc[(acc.length-act.length)+i] != act[i])
                    break;
            }
            if(i == act.length){
                 winner = act;
            }
        }

        switch(winner){
            case 'var','let','const':
                varCtrl = new VarController()
                varCtrl.Type = winner;
                varCtrl.Internal = isInternal;
                break;

            case '<%':
                isInTag = true;
                var next = res[j+1];
                isInNormalTag = next != ' ' 
                activators = internals;
                isInternal = true;
                break;
            
            case '%>':
                isInTag = false;
                isInNormalTag = false;
                activators = externals;
                isInternal = false;
                break;

            case 'out':
                isCalling = 'out';

            case 'include':
                isCalling = 'include';
                break;

            case ',':
                if(varCtrl){
                    var type = varCtrl.Type;
                    varCtrlFinish();
                    varCtrl = new VarController();
                    varCtrl.Type = type;
                }
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
                    write("%>", true);

                    writeCache(acc);

                    acc = "<%";

                    parser(bag, calculateRelativePos(filename, args[0]));
                    isCalling = undefined;
                } 
            case ';','\n':  
            
                varCtrlFinish();
            
                if(isCalling){
                    switch(isCalling){
                        case 'out':
                            if(isInTag) acc += '%>'
                            var v = vars[args[0]];
                            acc += v.Type +' '+ args[0];
                            if(v.Value) acc += '='+v.Value;
                            if(isInTag) acc += '<%'
                            break;
                    }
                }

                break;
        }

        function varCtrlFinish(){
            if(varCtrl){
                varCtrl.finish();
                vars[varCtrl.Name] = varCtrl;
                varCtrl = undefined;
            }
        }
    }

    writeCache(acc);

    if(first)
        bag.res.end();
}

class VarController{
    
    constructor() {
        this.lastCh;
        this.phase = 0;
        this.word = '';
        this.apex = undefined;

        this.Type;
        this.Name;
        this.Value;
    }

    read(ch){
        if(ch != this.lastCh){
            switch(ch){
                case ' ':
                    if(this.phase==0) this.phase = 1;
                    break;
                case '=':
                    this.Name = this.word;
                    this.word = '';
                    this.phase = 2;
                    break;
                case '"',"'":
                    if(this.phase==2 && this.apex == ch){
                        if(this.apex) this.apex = undefined;
                        else this.apex = ch;
                    }
                default:
                    this.word += ch;
                    break;  
            }
        }
    }

    finish(){
        this.Value = this.word;
    }
}