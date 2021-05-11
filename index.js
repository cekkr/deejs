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
        bag.composition = [];
        bag.filesProp = {};
    }

    var breaks = 0;

    var res = fs.readFileSync(filename);
    var acc = '';

    var absPath = path.resolve(filename).replaceAll('/','-').replaceAll('\\','-').replaceAll(':','');
    if(bag.filesProp[absPath] == undefined) bag.filesProp[absPath] = {line: 0, col: 0};
    bag.parserOrder[absPath] = [];
    var counterInit = {line:bag.filesProp[absPath].line, col: bag.filesProp[absPath].col};

    var externals = ['<%', '{', '}',','];
    var internals = ['include', 'out', '(',')', '%>',',','=',';'];
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

    function writeCache(){
        var b = breaks++;
        bag.parserOrder[absPath].push(b);
        var name = absPath+'_'+b;
        var fileName = 'cache/'+name+".ejs";
        bag.composition.push(fileName);
        fs.writeFileSync(fileName, acc);

        ejs.renderFile(fileName, bag.obj, {}, function(err, str){    
            if(err){
                var file = fs.readFileSync(fileName);
                var fileErr = ejsLint(file.toString());

                if(err.message){
                    var lines = err.message.split('\n');
                    console.log(lines);
                    err.message = "Error: " + lines[lines.length-1] + "\n";
                    for(var i=1; i<lines.length-2; i++){
                        var line = lines[i];
                        var re = /([1-9]+)\|/g;
                        var split = line.split(re);
                        console.log(split);
                        var init = split[0]; //if(init.indexOf('>')<0)init+=' ';
                        err.message += init+(counterInit.line+parseInt(split[1]))+ '| ' +split[2];
                    }
                }

                console.error(fileErr || err.message);
                bag.res.write(fileErr || err.message);
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

        if(ch == '\n'){ 
            bag.filesProp[absPath].line++;
            bag.filesProp[absPath].col = 0;
        }
        else 
            bag.filesProp[absPath].col++;

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

        function isLetter($word){
            var patt = /[A-Z]|[a-z]|[0-9]/g
            return patt.test($word);
        }

        function checkWord(before){
            var word = '';
            for(var i=acc.length-1-before; i>=0; i--){
                if(isLetter(acc[i])){
                    word = acc[i] + word;
                }
                else
                    if(word.length>0) break;
            }

            return word;
        }

        switch(winner){
            case 'var':
            case 'let':
            case 'const':
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

            case '=':
                var word = checkWord();
                if(!varCtrl) {
                    varCtrl = vars[word];
                    if(!varCtrl) {
                        //varCtrl = new VarController();
                        //todo: error: variable not declared
                    }
                }
                //else varCtrl.Name = word;
                break;

            case 'out':
                isCalling = 'out';
                break;

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
            
            case ',':
                args.push(acc.substr(lastArg+1, j-lastArg-1));
                lastArg = j;
                break;

            case ')':
                args.push(acc.substr(lastArg+1, j-lastArg-1));
                lastArg = j;

                if(isCalling == 'include'){
                    acc = acc.substr(0,acc.indexOf('include'));
                    write("%>", true);

                    writeCache(acc);

                    acc = "<%";

                    for(var v in vars){
                        bag.obj[vars[v].Name] = vars[v].Value;
                    }

                    parser(bag, calculateRelativePos(filename, args[0]));
                    isCalling = undefined;
                } 

                break;

            case ';':
            case '\n':  
            
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

            case -1:

                break;
        }

        function varCtrlFinish(){
            if(varCtrl){
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
        if(this.phase < 3 && ch != this.lastCh){
            switch(ch){
                case ' ':
                    if(this.phase==0) this.phase = 1;
                    break;
                case '=':
                    this.Name = this.word;
                    this.word = '';
                    this.phase = 2;
                    break;
                case '"':
                case "'":
                    if(this.phase==2 && this.apex == ch){
                        if(this.apex) this.apex = undefined;
                        else this.apex = ch;
                    }
                case ";":
                    this.finish();
                default:
                    this.word += ch;
                    break;  
            }
        }
    }

    finish(){
        this.Value = this.word;
        this.phase = 3;
    }
}