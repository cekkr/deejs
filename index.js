const https = require('https');
const fs = require('fs');
let ejs = require('ejs');
const ejsLint = require('ejs-lint');
var path = require("path");

const utils = require('./utils');

const options = {
  key: fs.readFileSync('privateKey.key'),
  cert: fs.readFileSync('certificate.crt')
};

console.log(process.cwd());

var supportedFormats = ['ejs','html'];

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

class Bag{
    constructor(){
        bag.breaks = 0;
        bag.parserOrder = {};
        bag.obj = {data:23};
        bag.composition = [];
        bag.filesProp = {};

        bag.parent = undefined;
    }

    enter(){
        var nbag = new Bag();
        for(var p in this)
            nbag[p] = this[p];

        nbag.parent = this;
        nbag.obj = utils.copyInNewObject(nbag.obj);
        return nbag;
    }

    exit(){
        return this.parent;
    }
}

function parser(filename, bag=undefined, first=false){
    if(first){
        bag = new Bag();
    }

    var res = fs.readFileSync(filename);
    var acc = '';

    ///
    /// Helpers
    ///
    function appendHelper(name){
        var app = fs.readFileSync('helpers/'+name+".ejs");
        acc += app;
        //todo handle relative lines
    }

    appendHelper("top");

    ///
    /// Calculate paths and lines
    ///
    var absPath = path.resolve(filename).replaceAll('/','-').replaceAll('\\','-').replaceAll(':','');
    if(bag.filesProp[absPath] == undefined) bag.filesProp[absPath] = {line: 0, col: 0};
    bag.parserOrder[absPath] = [];
    var counterInit = {line:bag.filesProp[absPath].line, col: bag.filesProp[absPath].col};

    ///
    /// Recognize keywords
    ///
    var externals = ['<%','<script>','</script>'];
    var internals = ['include', 'out', '(',')', '%>',',','=',';','echo', '{', '}'];
    var shared =    ['var', 'const', 'let', "'", '"']
    var isInternal = false;

    ///
    /// General toggle
    ///
    var activators = internals;
    var isInTag = false;
    var isInScript = false;
    
    var isCalling = "";
    var callPos = 0;
    var lastArg = -1;
    var args = [];

    var varCtrl = undefined;
    var vars = {};

    ///
    /// Write functions
    ///
    function write(str, register=false){
        acc += str;
        if(!register) j += str.length;
    }

    function writeCache(){
        var b = bag.breaks++;
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

    let inString = undefined;
    var str = '';
    let j=0;

    ///
    /// Cycle ejs result
    ///
    for(; j<res.length; j++){

        nch = res[j];
        var ch = String.fromCharCode(nch);

        if(!inString){         
            acc += ch;

            if(ch == '\n'){ 
                bag.filesProp[absPath].line++;
                bag.filesProp[absPath].col = 0;
            }
            else 
                bag.filesProp[absPath].col++;

            if(varCtrl) varCtrl.read(ch)

            function checkActivators(minPos=0){
                var winner = -1;

                for(var act of activators){
                    checkActivator(act);
                }

                if(winner==-1) for(var act of shared){
                    checkActivator(act);
                }

                function checkActivator(act){
                    for(var i=0; i<act.length; i++){
                        if(acc[(acc.length-act.length-minPos)+i] != act[i])
                            break;
                    }
                    if(i == act.length){
                        winner = act;
                    }
                }

                return winner;
            }

            var winner = checkActivators();

            function isLetter($word){
                var patt = /[A-Z]|[a-z]|[0-9]/g
                return patt.test($word);
            }

            function checkWord(before=0){
                var word = '';
                var ret = 0;
                for(var i=acc.length-1-before; i>=0; i--){
                    if(isLetter(acc[i])){
                        word = acc[i] + word;
                    }
                    else{
                        if(word.length>0) break;
                        else if(checkActivators(ret++) != -1)
                            return undefined;
                    }
                }

                return word;
            }

            switch(winner){
                case '{':
                    if(isInTag)
                        bag = bag.enter();
                    break;

                case '}':
                    if(isInTag)
                        bag = bag.exit();
                    break;

                case '<script>':
                    if(!isInTag) isInScript = true;
                    break;

                case '</script>':
                    if(!isInTag) isInScript = false;
                    break;

                case '"':
                case "'":
                    if(isInTag){
                        inString = winner;
                        acc = acc.substr(0,acc.length-1);
                    }
                    break;

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
                    if(!varCtrl && word) {
                        varCtrl = vars[word];
                        if(!varCtrl) {
                            vars[word] = varCtrl = new VarController();
                            varCtrl.Name = word;
                        }
                    }
                    //else varCtrl.Name = word;
                    break;

                case 'out':
                case 'include':
                case 'echo':
                    isCalling = winner;
                    callPos = acc.length;
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
                    lastArg = acc.length;
                    break;
                
                case ',':
                    args.push(acc.substr(lastArg+1, acc.length-lastArg-1));
                    lastArg = acc.length;
                    break;

                case ')':
                    args.push(acc.substr(lastArg+1, acc.length-lastArg-1));
                    lastArg = acc.length;

                    if(isCalling == 'include'){
                        acc = acc.substr(0,callPos);
                        write("%>", true);

                        writeCache(acc);

                        acc = "<% ";

                        for(var v in vars){
                            bag.obj[vars[v].Name] = vars[v].Value;
                        }

                        parser(calculateRelativePos(filename, bag, args.pop()));
                        isCalling = undefined;
                    } 

                    break;

                case ';':
                case '\n':  
                
                    if(varCtrl)
                        varCtrlFinish();
                    else if(isCalling){
                        switch(isCalling){
                            case 'out':
                                if(isInTag) acc += '%>'
                                var v = vars[args[0]];
                                acc += v.Type +' '+ args[0];
                                if(v.Value) acc += '='+v.Value;
                                if(isInTag) acc += '<%'
                                break;
                            case 'echo':
                                var newAcc = acc.substr(0, callPos-4);
                                if(isInTag) newAcc += '%>';
                                newAcc += '<%=' + acc.substr(callPos+4,j-(callPos+4));
                                var argStr = '';
                                while(args.length>0) argStr = argStr + args.pop() ;
                                newAcc += argStr;
                                newAcc += '%>';
                                if(isInTag) newAcc += '<%'
                                acc = newAcc;
                                break;
                            case 'include':
                                acc = acc.substr(0,callPos-'include'.length);
                                write("%>", true);

                                writeCache(acc);

                                acc = "<% ";

                                for(var v in vars){
                                    bag.obj[vars[v].Name] = vars[v].Value;
                                }

                                var toInclude = args.pop();
                                //toInclude = toInclude.substr(1, toInclude.length-1);
                                parser(bag, calculateRelativePos(filename, toInclude));
                                isCalling = undefined;
                                break;
                        }
                    }
                    else {
                        //acc = acc.substr(0, acc.length-1);
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
        else
            if(ch == inString){
                inString = undefined;
                args.push(ch+str+ch)
                str = '';
            }
            else {
                str += ch;
            }
    }

    if(isInTag) write("%>", true);
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