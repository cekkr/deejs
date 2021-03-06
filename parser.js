const Bag = require('./bag');
const Utils = require('./utils');

///
/// Instruction
///
class Instruction{
    constructor(name){
        this.name = name;

        this.content = "";
        this.instructions = [];
        this.pathInstructions = {};
        this.activeInstructions = [];
        this.curInstr = undefined;
    }

    insert(instr){
        if(typeof instr == 'string')
            instr = new Instruction(instr);

        if(this.curInstr && instr.name.startsWith(this.curInstr.name)){
            this.curInstr.insert(instr);
        }
        else {
            this.instructions.push(instr);
            this.curInstr = instr;
            instr.parent = this;
        }

        return instr;
    }

    getParentDisk(){
        if(this.isMatch)
            return this.parent.getParentDisk();
        return this.obj || this.disk; //the last one is for security
    }

    getEnsuredParentDisk(){
        var disk = this.getParentDisk();
        if(isDiskConfirmed(disk))
            return disk;

        return this.parent.getEnsuredParentDisk();
    }

    getInstr(){
        if(this.curInstr)
            return this.curInstr.getInstr();
        else
            return this;
    }

    newChild(name, isCurInstr=true){
        var pos = this.instructions.length;
        if(!name) name = pos;
        var instr = new Instruction(name);
        instr.pos = pos;
        instr.parent = this;

        this.instructions.push(instr);
        if(isCurInstr) this.curInstr = instr;
        return instr;
    }

    check(property){
        if(this[property]==undefined)
            this[property] = "";
    }

    close(){
        this.parent.curInstr = undefined;
        return this.parent;
    }

    isToComplete(){
        var disk = this.getParentDisk();
        return (disk.MatchesOrder && !this.completed) || disk.Transparent
    }

    setParent(parent){
        this.parent = parent;
        this.getPath();
    }

    getPath(){
        if(this.path) return this.path;

        var path = this.name === undefined ? "" : this.name;
        if(this.parent != null){
            var gp = this.parent.getPath();
            if(gp) path = gp + "." + path;
        }

        this.path = path;
        return path;
    }

    confirm(instr){
        if(instr){
            if(this.instructions.indexOf(instr)<0)
                this.instructions.push(instr);
            if(this.activeInstructions.indexOf(instr)<0)
                this.activeInstructions.push(instr);
            this.confirm();
        }
        else {
            if(this.parent) 
                this.parent.confirm(this);
        }
    }

    deconfirm(instr){
        if(instr){
            if(this.instructions.indexOf(instr)>=0)
                delete this.instructions[this.instructions.indexOf(instr)];
            if(this.activeInstructions.indexOf(instr)>=0)
                delete this.activeInstructions[this.activeInstructions.indexOf(instr)];
            this.confirm();
        }
        else {
            if(this.parent) 
                this.parent.confirm(this);
        }
    }
}

///
/// Char utils
///
function isNumeric(nch){
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return  nch>=48&&nch<=57;
}

function isAlphaLowerCase(nch){
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return nch>=97&&nch<=122;
}

function isAlpha(nch){
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return (nch>=65&&nch<=90)||isAlphaLowerCase(nch);
}

function isAlphaNumeric(nch){
    return isNumeric(nch)||isAlpha(nch);
}

function isWhitespace(nch){
    if(nch == ' ' || nch == '\t') return true; //la situazione sta diventando ridicola...
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return nch == 32 || nch == 9;
}

function isSymbol(nch){
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return (nch >= 33 && nch <= 47) || (nch >= 58 && nch <= 64) || (nch >= 91 && nch <= 96);
}

///
/// Instruction
///
var instruction;

///
/// Disks
///
const disks = {
    root: {
        Matches:[
            {
                match: '<?',
                action: function(){
                    return 'inTag';
                }
            },
            {
                match: function(ch, bag){
                    instruction.content += ch;
                }
            }
        ]
    },
    inTag:{ 
        Important: true,
        MatchesThrough: ['whitespace', 'separator'],
        Matches: [
            {
                match: '?>',
                action: function(){
                    return 'root';
                }
            }, 
            {
                match: 'async',
                action: function(bag){
                    bag.args.push('async');
                }
            }, 
            {
                match: 'function',
                action: function(){
                    return 'inTag.function';
                }
            },
            'expression'   
        ],
        OverAll: {
            comment: {
                Important: true,
                MatchesOrder: true,
                Matches: [
                    {
                        match: ['/*'],
                        action: function(){
                            return true;
                        }
                    },
                    {
                        match: ['*/']
                    }
                ]
            },
            commentInline: {
                Important: true,
                MatchesOrder: true,
                Matches: [
                    {
                        match: ['//']
                    },
                    {
                        match: ['\n']
                    }
                ]
            }
        },
        whitespace: {
            Transparent: true,
            Matches: function(ch){
                return isWhitespace(ch) || ch=='\n' || ch =='\r';
            }
        },
        separator: {
            Transparent: true,
            Matches: function(ch){
                return ch == ';';
            }
        },
        expression: {
            MatchesOrder: true,
            Matches: [
                'varDeclaration',
                'whitespace',
                {
                    type: 'mandatory',
                    match: function(ch){
                        var instr = instruction;

                        var isIt = isAlpha(ch);
                        if(isIt)
                            instr.content += ch;

                        return isIt;
                    }
                },
                '(IF varDeclaration ? ELSE !)operator'
            ],
            varDeclaration: {
                Matches: [
                    {
                        match: ['var', 'let', 'const'],
                        action: function(bag){
                            var instr = instruction;
                            //instr = instr.insert('declaration');
                            instr.type = bag.lastMatchString;
                        }
                    }
                ]
            },
            operator: {
                Matches: [
                    {
                        match: ['==', '=']
                    }
                ]
            }
        },
        value: {
            number: {
                Matches: [
                    {
                        match: function(ch, bag){
                            return isNumeric(ch);
                        }
                    }
                ]
            },
            string: {
                MatchesOrder: true,
                Matches: [
                    {
                        match: function(ch, bag){

                        }
                    }
                ]
            }
        },
        block: {
            //MustCalled: true, //?
            MatchesOrder: true,
            MatchesThrough: 'whitespace',
            Matches: [
                {
                    type: 'mandatory',
                    match: '{',
                    action: function(){
                        console.log("debug block");
                    }
                },
                '!inTag',
                {
                    type: 'mandatory',
                    match: '}',
                }
            ]
        },
        function: {
            MatchesOrder: true,
            MatchesThrough: 'whitespace',
            Matches: [
                {
                    type: 'optional',
                    match: function(ch, bag){
                        if(isAlpha(ch)){
                            var instr = instruction;
                            instr.check("functionName");
                            instr.functionName += ch;

                            return true;
                        }

                        return false;
                    }
                }, 
                {
                    type: 'mandatory',
                    match: '(',
                    action: function(){
                        return '.arguments'
                    }
                },
                '!block'
            ],
            arguments: {
                OnStart: function(bag){
                    bag._argNum = 0;
                },
                OnExit: function(bag){
                    //debug purposes
                    console.log("argument exit");
                },
                MatchesOrder: true,
                MatchesThrough: 'whitespace',
                Matches: [
                    {
                        type: 'mandatory',
                        match: function(ch, bag){
                            var instr = instruction;//bag.instruction.getInstr();

                            if(isAlpha(ch)){    
                                if(!instr._curArg) 
                                    instr._curArg = instr.newChild("argument", false);

                                //bag._curChild = instr;
                                instr._curArg.check("argName");
                                instr._curArg.argName += ch;                                

                                return true;
                            }

                            if(instr.name == "argument") 
                                instr.close();

                            return false;
                        },
                        onClose: function(bag){
                            var instr = bag.instruction.getInstr();
                            instr._curArg = undefined;
                        }
                    },
                    {
                        type: 'optional',
                        match: '=',
                        action: function(){
                            return '.assign';
                        }
                    },
                    {
                        type: 'repeat',
                        match: ',',
                        action: function(bag){
                            /*var instr = bag.instruction.getInstr();
                            instr = instr.parent.newChild("argument");*/
                        }
                    },
                    {
                        type: 'exit',
                        match: ')'
                    }
                ],
                assign: {
                    Matches:[
                        'value'
                    ]
                }
            }
        }
    }
};

function initDisks(disk=undefined, name='', overAll=null){
    for(var p in disk){
        if(p != '_parent' && typeof disk[p] == 'object'){
            if(isAlphaLowerCase(p[0])){
                disk[p]._parent = disk;
                var thisName = (name!=''?name+'.':'')+p;
                disk[p].name = p;
                disk[p].fullName = thisName;

                if(disk[p].OverAll){
                    if(!overAll) overAll = [];
                    for(var o in disk[p].OverAll){
                        var obj = disk[p].OverAll[o];
                        disk[p][o] = disk[p].OverAll[o];

                        if(typeof obj == "string"){
                            overAll.push(obj);
                            //obj.Transparent = true; //cazzata da rivalutare
                        }
                        else {
                            overAll.push(o);
                        }
                    }
                }

                if(overAll){
                    if(!Array.isArray(disk[p].MatchesThrough)){
                        disk[p].MatchesThrough = disk[p].MatchesThrough ? [disk[p].MatchesThrough] : [];

                        for(var o of overAll){
                            if(overAll.indexOf(disk[p].name)<0)
                                disk[p].MatchesThrough.push(o);
                        }
                    }
                }

                initDisks(disk[p], thisName, overAll ? Utils.copyInNewObject(overAll) : null);
            }
        }
    }
}

///
/// Cycle functions
///
var comingFromAlivePathNum = -1;
var line = 1, pos = 0;

function getDiskEnsured(disk){
    var instr = instruction;
    if(!instr)
        return disk;

    var topDisk = instr.getParentDisk();
    while(instr != null && disk != null){

        if(instr.isToComplete())
            topDisk = undefined;
        else if(topDisk == undefined) 
            topDisk = disk;

        instr = instr.parent;
        if(instr == undefined) break;
        disk = instr.getParentDisk();
    }

    return topDisk;
}

function diskHasDisk(disk, child){
    //if(disk==child) return true;

    if(Array.isArray(disk))
        return disk.indexOf(child) >= 0;
    else
        return disk[child.name] !== undefined;
}

function isDiskConfirmed(disk){
    if(!disk || !instruction)
        return false;

    if(disk.Important || instruction.Important)
        return true;

    var ensured = getDiskEnsured(disk);

    if(!ensured){
        console.log("debug: !ensured");
        getDiskEnsured(disk);
    }

    if(ensured == disk)
        return true;

    if(!ensured)
        return true;

    ensured = ensured._parent;

    while(ensured){
        if(diskHasDisk(ensured, disk))
            return true;
        ensured = ensured._parent;
    }

    return false; // =(
}

initDisks(disks);
console.log("debug init disk");

function Parser(bag, str, cbk){
    bag.httpBuffer = "";
    bag.instruction = new Instruction();
    bag.args = [];

    var lastDiskStr;

    ///
    /// Parser Path 
    ///
    bag.parserPath = [];

    function calcParserPath(){
        var str = "";
        for(var path of bag.parserPath){
            if(str) str += ".";
            str += path;
        }
        return str;
    }

    function parserPathGetPos(posOf){
        for(var p in bag.parserPath){
            var ppath = bag.parserPath[p];
            if(ppath && (ppath == posOf || ppath[1]==posOf || ppath[2]==posOf)){
                return p;
            }
        }

        return -1;
    }

    ///
    /// ParserPathPop
    ///
    function parserPathPop(what){
        if(what == undefined)
            what = getLastParserPath();

        var go = parserPathGetPos(what)>=0;

        if(!go){
            console.error("what not found");
        }
        else {
            while(true){
                var path = bag.parserPath.pop();
                if(!path || path == what || path[1] == what || path[2] == what)
                    break;
            }
        }

        selectInstruction();
    }

    function parserPathPush(name, what=-1, pos=-1){
        var instr;

        if(name == undefined)
            console.log("debug");

        if(name.constructor.name == "Instruction"){
            pos = what;
            instr = name;
            what = name.obj;
            name = instr.name;  
        }
        else if(name.constructor.name == "Object"){
            pos = what;
            what = name;
            name = what.name;
        }

        /*for(var pp of bag.parserPath){
            if(pp[1]==what || pp[2] == what) 
                return false;
        }*/

        var glPP = getLastParserPath();
        if(glPP && (glPP[1]==what || glPP[2] == what)) 
            return false; //is repeatition

        if(glPP && glPP[1]._parent == what._parent){
            parserPathPop(glPP);
        }

        var arr = [name, what];

        if(instr)
            arr.push(instr);
        
        if(pos>=0){
            var p=0;
            var newArr = [];
            for(;p<bag.parserPath.length; p++){
                if(p>=pos){
                    var pop = bag.parserPath.pop();
                    newArr.unshift(pop);
                    p--
                }
            }

            bag.parserPath.push(arr);
            bag.parserPath = bag.parserPath.concat(newArr);
            console.log(bag.parserPath);
        }
        else {
            bag.parserPath.push(arr);
        }

        if(arr.length<3){
            selectInstruction();
            arr.push(instruction);
        }

        return arr;
    }

    function parserPathReplace(from, to){
        for(var i in alivePath){
            if(alivePath[i][2] == from[2]){
                alivePath[i] = to;
                break;
            }
        }
    }

    function getLastParserPath(){
        var n = bag.parserPath.length;
        if(n == 0) 
            return undefined;

        return bag.parserPath[n-1];
    }

    ///
    /// Instruction fault
    ///
    function instructionFault(from){
        console.log("debug");
    }

    ///
    /// Select instruction
    ///
    var alivePath = []; //(?)
    function selectInstruction(){
        var tPath = "";
        var lastPath;
        var lastPaths;
        var lastObj;
        var lastInstr;
        var cInst = bag.instruction;
        for(var paths of bag.parserPath){
            var path = paths[0];
            lastObj = paths[1];
            if(paths[2]) {
                lastInstr = paths[2];
                lastInstr.endLine = [line, pos];
            }
            if(tPath) tPath += ".";
            tPath += path;
            
            /*if(cInst.pathInstructions[path]){
                cInst = cInst.pathInstructions[path];
                if(cInst) lastInstr = cInst;
                tPath = "";
            }*/

            if(lastPaths){
                if(paths[0] == 'varDeclaration')
                    console.log("debug");
                lastPaths[2].pathInstructions[paths[0]] = paths[2];
            }

            lastPaths = paths;
            lastPath = path;
        }

        console.log("Selected instruction: ", tPath);

        var glPP = getLastParserPath();

        if(glPP==undefined){
            console.log("debug");
            return;
        }

        cInst = glPP[2];

        /// New instruction
        if(!cInst && lastPath !== undefined){
            var parent = lastInstr;
            cInst = new Instruction();
            if(parent)
                parent.pathInstructions[lastPath] = cInst;

            //cInst.top = parent;
            //cInst.path = tPath;
            cInst.name = lastPath;
            cInst.isMatch = !isNaN(lastPath);
            cInst.obj = lastObj;

            cInst.startLine = [line, pos];

            /*if(cInst.isMatch){ 
                alivePath.push(cInst);
            }*/

            cInst.setParent(parent);

            while(parent != null && parent.isMatch)
                    parent = parent.parent;
            
        }
        /*else if(Object.keys(cInst.pathInstructions).length>0){
            // You should close completed actions
            //todo
            //console.log("todo");
        }*/
        
        if(cInst){
            var exInst = instruction;
            instruction = cInst;
            if(!instruction)  
                instructionFault(exInst);
        }
    }

    ///
    /// Alive path
    ///
    function alivePathGetPos(posOf){
        for(var p in alivePath){
            var ppath = alivePath[p];
            if(ppath && (ppath == posOf || ppath[1]==posOf || ppath[2]==posOf)){
                return p;
            }
        }

        return -1;
    }

    function removeAlivePath(io){
        //var io = alivePathGetPos(alive);
        if(io >= 0 && io<alivePath.length){
            var path = alivePath[io];
            alivePath.splice(io, 1);
            destroyInstruction(path[2]);
            return true;
        }

        return false;
    }

    function destroyInstruction(instr){
        if(!instr) 
            instr = instruction;

        if(!instr){
            console.log("debug");
            return;
        }

        if(instr.name == "expression")
            console.log("debug");

        if(!instr)
            return;

        instr.deconfirm()

        var exInst = instruction;
        instruction = instr.parent;
        if(!instruction)  
            instructionFault(exInst, instr);
        if(instruction){
            // Remove yourself from parent's pathInstructions
            delete instr.pathInstructions[instr.name];

            // Remove yourself from parent instructions (if exists)
            var p = instruction.instructions.indexOf(instr);
            if(p>=0) instruction.instructions.splice(p, 1);
        }

        if(!instruction)
            instructionFault();

        //todo: remove from alivePaths
        var pos = alivePathGetPos(instr);
        if(pos >= 0) 
            removeAlivePath(pos); // ha-ha! il colpevole!

        parserPathPop(instr);

        //console.log("debug: instruction destroyed", instr);
        //if(instr.name=="function") console.log("debug");
    }

    /*function instructionIsInsideBagDisk(){
        var instr = instruction;
        var disk = bag.disk;
        var compDisk = instr.disk;

        if(compDisk == disk)
            return false;

        while(compDisk){
            if(compDisk == disk)
                return true;
            compDisk = compDisk._parent;
        }
        return false;
    }*/

    function confirmInstruction(instr){
        if(!instr) 
            instr = instruction;

        console.log("confirm", instr);
        instr.confirm();

        if(bag.disk != instr.getParentDisk())
            parserPathPop(instr);

        //bag.parserPath.pop();

        /*if(instructionIsInsideBagDisk()){
            var pp = getLastParserPath();
            alivePath.push(pp);            
        }
        else {
            var pp = getLastParserPath();
            changeDisk(pp[1]);
            console.log("check that");
        }*/

        //alivePath.splice(alivePath.indexOf(instruction), 1);
    }

    ///
    /// Ensure Object Disk
    ///
    function ensureObjectDisk(disk){
        if(disk){
            if(typeof disk == 'string'){

                if(true){

                    if(disk == ".arguments")
                        console.log("debug");

                    var dsk = disks;
                    var spl = disk.split('.');
                    for(var sp of spl){
                        if(sp){
                            dsk = dsk[sp];
                             if(!dsk){
                                 for(var pp of bag.parserPath){
                                     if(pp[0]==sp)
                                        dsk = pp[1];
                                 }
                             }
                        }
                        else {
                            dsk = getLastParserPath()[1];
                        }
                    }

                    if(!dsk){
                        console.log("disk ", disk, "not found!");
                        process.exit(-1);
                    }

                    return dsk;
                }
            }
        }

        return disk;
    }

    ///
    /// AlivePath
    ///
    function addToAlivePath(parserPath){
        if(comingFromAlivePathNum>=0){
            alivePath[comingFromAlivePathNum] = getLastParserPath();
        }
        else {
            var glPP = getLastParserPath();
            var io = alivePathGetPos(glPP);
            if(io<0)
                alivePath.push(glPP);
        }
    }

    ///
    /// Change Disk
    ///
    function changeDisk(ret, getBack=false){
        if(ret){ 
            var res = false;

            //var instr = bag.instruction.getInstr();
            instr = instruction;

            var disk = ensureObjectDisk(ret);      

            if(!disk.Transparent /*&& instr._disk != disk*/){
                /*instr = instr.insert(disk.name);
                instr._disk = disk;*/

                var glPP = getLastParserPath();
                if(glPP && glPP[0]=='inTag' && disk.name == "function")
                    console.log("debug");

                //var alivePos = alivePath.indexOf(glPP);

                //if(glPP[2].parent) glPP[2].parent.instructions.push(glPP[2]);

                if(!getBack){
                    parserPathPush(disk.name, disk);  
                    curPP = getLastParserPath(); 
                    if(curPP[2].isToComplete())
                        addToAlivePath(curPP);
                }
                else {
                    while(getLastParserPath()[1] != disk)
                        bag.parserPath.splice(bag.parserPath.length-1,1);
                    selectInstruction();
                }

                //if(!disk.MatchesOrder)
                    //glPP[2].instructions.push(instruction);
                
                instruction.disk = disk;
                res = true;  
            }

            if(bag.TempImportant){
                instruction.Important = true;
                bag.TempImportant = undefined;
            }

            if(isDiskConfirmed(disk)){
                bag.disk = disk;  
            }

            //todo: insert ad hoc instruction if disk is object         

            if(disk.OnStart) 
                disk.OnStart(bag); 

            curDisk = disk;

            return res; //returns if disk is added to parserPaths
        }

        return false;
    }

    ///
    /// Exit Disk
    ///
    function exitDisk(curDisk){
        if(!curDisk)
            curDisk = instruction.getParentDisk();
        if(curDisk == undefined)
            return false;

        //var glPP = getLastParserPath();

        //or better select it from parsePath?

        if(!instruction.parent){
            console.error("debug, instruction without parent");
            return; //autocompleted
        }

        var nxtDisk = instruction.parent.getParentDisk(); //curDisk._parent;//instruction.getParentDisk().disk;

        if(curDisk == nxtDisk){
            return false;
        }

        //nxtDisk correction
        //parserPathPop(instruction);
        
        //var curPP = getLastParserPath();
        //var alivePos = alivePath.indexOf(curPP);

        if(!curDisk.Transparent || true){ //experimental: try ever to remove it
            parserPathPop(curDisk);
            var curPath = getLastParserPath();

            if(!curPath)
                return false;

            var exInstr = instruction;
            instruction = curPath[2];
            if(!instruction)  
                instructionFault(exInstr);
            nxtDisk = instruction.getParentDisk();

            if(comingFromAlivePathNum>=0)
                alivePath[comingFromAlivePathNum] = curPath;

            //saves inTag matches in root...
            //nxtInstr.parent.instructions.push(nxtInstr);
        }

        if(nxtDisk && nxtDisk != disks){
            changeDisk(nxtDisk, true);
            //evaluateDisk(); //?

            return nxtDisk;
        }
    }

    bag.instruction.name = "base";
    bag.instruction.obj = disks;
    bag.disk = disks;
    parserPathPush(bag.instruction);
    changeDisk('root');
    instruction.confirm();
    //bag.instruction = instruction;

    let j = 0;
    for(; j<str.length; j++){
        var nch = str[j];
        var ch = String.fromCharCode(nch);
        console.log('ch', ch);

        if(ch=='\n'){
            line++;
            pos=0;
        }
        else 
            pos++;

        ///
        /// Check Match
        ///
        function updateMatchInstruction(disk){
            disk = ensureObjectDisk(disk);
            

            if(!disk){
                console.log("debug null disk");
                return;
            }

            var glPP = getLastParserPath();
            /*if(!disk.fullName.startsWith(glPP[1].fullName)){
                parserPathPop();
            }*/

            var res = changeDisk(disk);

            /*if(!res)
                parserPathPush(disk);*/

            if(bag.disk != disk) {
                var last = getLastParserPath();
                addToAlivePath(last);
                parserPathPop(last);
            }
            
            if(!res)
                parserPathPop(disk);
        }

        function executeDisk(disk){
            var curDisk = bag.disk;
            var glPP = getLastParserPath();

            changeDisk(disk);

            var res = evaluateDisk(disk);

            var nglPP = getLastParserPath();
            if(glPP != nglPP && nglPP[1] == disk){
                if(res){
                    confirmInstruction();
                }
                else {
                    destroyInstruction();
                }   
            }
            else 
                console.log("debug");

            changeDisk(curDisk);

            return res;
        }
        
        function searchDiskIn(disk, what, past=null){
            if(!past) past = [];
            past.push(disk);

            if(typeof disk != 'object')
                return false;

            for(var v in disk){
                if(what == v)
                    return disk[v];
                
                if(past.indexOf(disk[v])<0){
                    var res = searchDiskIn(disk[v], what, past);
                    if(res)
                        return res;
                }
            }

            past.pop();

            return false;
        }

        function checkMatch(match){
            //var instr = bag.instruction.getInstr();
            var instr = instruction;

            if(match == undefined){
                return false;
            }

            if(typeof match == 'string'){
                //Interpretate signals (are always referred to other symbols)
                var objMatch = {type: "optional"};
                var isString = false;
                var inParenthesis = false;
                var conditional = [], parenthesisAccumulated = "";

                function applySymbol(mi){
                    switch(mi){
                        case '!': 
                            objMatch.type = "mandatory";
                            break;
                        case '>': 
                            objMatch.type = "repeatable";
                            break;
                        case '?':
                            objMatch.type = 'optional'; //automatic
                            break;
                        case '=':
                            isString = true;
                            break;
                        case '"':
                            objMatch.temporary = true;
                            break;
                        case '(':
                            inParenthesis = true;
                            break;
                    }
                }

                var i=0;                
                for(;i<match.length; i++){
                    var mi = match[i];

                    if(inParenthesis){
                        if(mi == ' '){
                            if(parenthesisAccumulated) conditional.push(parenthesisAccumulated);
                            parenthesisAccumulated = '';
                        }
                        else if(mi == ')'){
                            if(parenthesisAccumulated) conditional.push(parenthesisAccumulated);
                            inParenthesis = false;
                        }
                        else
                            parenthesisAccumulated += mi;
                    }
                    else {
                        if(isSymbol(mi))
                            applySymbol(mi);
                        else 
                            break;
                    }
                }

                //todo: se c'?? il condizionale, esaminarlo
                // (IF varDeclaration ? ELSE !)operator

                var lastCmd = "";

                for(var cond of conditional){
                    var hasCmd = false;

                    var upCond = cond.toUpperCase();
                    switch(upCond){
                        case 'IF':
                        case 'ELSE':
                            lastCmd = upCond;    
                            hasCmd = true;
                            break;
                    }

                    if(!hasCmd){
                        switch(lastCmd){
                            case 'IF':
                                console.log("debug");                                
                            break;

                            case 'ELSE':

                            break;
                        }
                    }
                }

                var toMatch = match.substr(i, match.length-i);

                if(isString)
                    objMatch.match = toMatch;
                else
                    objMatch.RefMatch = toMatch;

                match = objMatch;
            }
            else if(typeof match == 'function'){
                match = {match: match}; //uhm...
            }

            if(!match._disk && match.RefMatch){
                var disk = instr.disk || instr.obj;

                // Check back
                while(disk && !disk[match.RefMatch]){
                    disk = disk._parent;
                }

                // Check forward
                if(!disk){
                    disk = searchDiskIn(instr.disk || instr.obj, match.RefMatch);
                }

                if(disk && disk[match.RefMatch])
                    disk = disk[match.RefMatch];

                if(disk){
                    match._disk = disk;    
                }
                else {
                    //todo: error parser composition
                    throw new Error("Disk not found");
                }
            }
            
            ///
            /// Execute disk
            ///
            if(match._disk){
                //var prevDisk = instr.disk;
                var curDisk = bag.disk;
                var tmpDisk = match._disk;

                var glPP = getLastParserPath();

                //parserPathPush(tmpDisk.name, tmpDisk);
                if(tmpDisk.name == "expression" && glPP[0] == 'inTag')
                    console.log("debug");
                
                var res = executeDisk(tmpDisk);

                if(objMatch && objMatch.temporary)
                    bag.disk = curDisk;

                return res;
            }
            
            ///
            /// Normal matching
            ///
            else if(typeof match.match == 'function'){
                if(match.match(ch, bag)){                    
                    if(match.action){
                        updateMatchInstruction(match.action(bag));
                        //instr._curOrder++;
                    }
                    lastMatch = match;
                    return true;
                }
            }
            else { // array[string]
                if(!Array.isArray(match.match))
                    match.match = [match.match];

                for(var matchMatch of match.match){
                    if(matchMatch && matchMatch[0]==ch){
                        var validated = true;
                        for(var i=1; i<matchMatch.length; i++){
                            if(matchMatch[i] != String.fromCharCode(str[j+i])){
                                validated = false;
                                break;
                            }
                        }

                        if(validated){
                            bag.lastMatchString = matchMatch;

                            // it jumps to the end of the word
                            // in this sense, we are acceding in a importat keyword
                            // and the next instruction should be considered as the base level
                            j += matchMatch.length-1;

                            if(match.action){
                                bag.TempImportant = true;
                                updateMatchInstruction(match.action(bag));
                                //instr._curOrder++; ?
                            }

                            // Ex if match.type == 'exit'

                            lastMatch = match;
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        ///
        /// Evaluate Disk
        ///
        function evaluateDisk(disk){
            if(!disk){
                disk = bag.disk;
                /*var pos = parserPathGetPos(disk);
                var ppos = parseInt(pos)+1;
                var pnum = bag.parserPath.length-ppos;
                bag.parserPath.splice(ppos, pnum);*/

                //this is the automatic path
            }

            curDisk = disk;
            
            if(disk.name == "function")
                console.log("debug");

            if(!disk.Transparent)
                console.log("evaluating", disk.fullName);
            if(!instruction)
                console.log("debug");
            console.log("instruction", instruction.path);

            if(disk.fullName == "inTag")
                console.log("debug");

            var matches = disk;

            //var instr = bag.instruction.getInstr();
            var instr = instruction;
            instr._curOrder = instr._curOrder || 0; // temporary

            if(!Array.isArray(disk)){ 
                if(disk == undefined)
                    console.log("disk fault"); //fault

                matches = disk.Matches; 
            }

            if(!Array.isArray(matches))
                matches = [matches];

            ///
            /// Exit
            ///
            function exit(){
                var instr = instruction;

                if(instr.parent && instr.parent.instructions.indexOf(instr)<0)
                    instr.parent.instructions.push(instr);

                if(disk.OnExit)
                    disk.OnExit();

                var lastPP = getLastParserPath();

                console.log("exiting from", lastPP[0]);
                //todo: study what todo

                instr.completed = true;
                var prec = exitDisk(disk);

                if(comingFromAlivePathNum>=0){
                    alivePath[comingFromAlivePathNum] = getLastParserPath();
                }

                /*if(lastPP[2] == instr){
                    //var ap = removeAlivePath(instr);
                    //parserPathPop();
                    if(comingFromAlivePathNum>=0){
                        alivePath[comingFromAlivePathNum] = getLastParserPath();
                    }
                }*/

                //return evaluateDisk(prec);
                return false;
            }

            ///
            /// Check MatchesThrough
            ///
            if(disk.MatchesThrough){
                if(!Array.isArray(disk.MatchesThrough))
                    disk.MatchesThrough = [disk.MatchesThrough];

                for(var i in disk.MatchesThrough){
                    var through = disk.MatchesThrough[i];

                    if(through == "comment")
                        console.log("debug");

                    if(checkMatch('"'+through)){
                        return true;
                    }
                }
            }

            ///
            /// Disks match (theoretical)
            ///
            if(matches == undefined){
                for(var p in disk){
                    parserPathPush(p, disk[p]);
                    checkMatch(disk[p]);
                    parserPathPop(disk[p]);
                }
            }
            ///
            /// Disk Ordered
            ///
            else if(disk.MatchesOrder){
                var pos = instr._curOrder;

                //todo: guarda perch?? non accetta whitespace in function
                //if(instr.name == "function" && ch==' ') console.log("debug");

                //if(ch == '{') console.log('debug');

                while(pos>=0 && pos<matches.length){
                    var match = matches[pos];

                    ///
                    /// Elaborate contracted match
                    ///
                    if(typeof match == 'string'){ //force match object for the ordered
                        //Interpretate signals
                        var objMatch = {type: 'optional'};
                        var i=0;
                        for(;i<match.length; i++){
                            if(isSymbol(match[i])){
                                switch(match[i]){
                                    case '!': 
                                        objMatch.type = "mandatory";
                                        break;
                                    case '>': 
                                        objMatch.type = "repeatable";
                                        break;
                                }
                            }
                            else 
                                break;
                        }

                        objMatch.RefMatch = match.substr(i, match.length-i);
                        matches[pos] = match = objMatch;
                    }

                    ///
                    /// Go go go!
                    ///
                    var glPP = getLastParserPath();
                    //parserPathPush(pos, match);                    

                    if(checkMatch(match)) {
                        if(instr._curMatchConfirmed != undefined && instr._curMatchConfirmed != match){
                            console.log("to check");
                        }

                        instr._curMatchConfirmed = match;

                        switch(match.type){
                            case 'repeat':
                                instr._curOrder = 0;
                                break;

                            case 'exit':
                                exit();

                            case 'repeatable':
                                //todo(?)
                                break;
                        }

                        return true;
                    }
                    else {                         
                        if(instr._curMatchConfirmed == match){
                            //end of match
                            instr._curOrder = ++pos;
                            instr._curMatchConfirmed = undefined;

                            if(match.onClose) 
                                match.onClose(bag);

                            if(instruction != glPP[2])
                                confirmInstruction();
                            //parserPathPop();
                        }
                        else { 
                            if(instruction != glPP[2])  
                                destroyInstruction();
                            
                            switch(match.type){
                                case 'mandatory':
                                    pos = -1;
                                    //todo: exception
                                    break;

                                case 'repeatable':
                                case 'optional':
                                    case 'repeat':
                                    instr._curOrder = ++pos;
                                    break;

                                default: 
                                    instr._curOrder++;
                                    break;
                            }

                            ///
                            /// Exit (if order ends or mandatory is wrong)
                            ///

                            //parserPathPop(match);                       

                            if(pos == -1){
                                //destroyInstruction();
                                return exit(); //?
                            }

                            if(instr._curOrder >= matches.length){
                                // We are sorry but it's time to go
                                //instr = instr.close();
                                return exit();
                            }

                            // I love you <3 @naxheel

                        }
                    }

                    if(bag.disk != disk)
                        return;
                }

                if(pos >= matches.length){
                    //todo: exception: excepted...
                    //destroyInstruction();
                    return exit();
                }
            }
            ///
            /// Unordered Matches
            ///
            else {
                var i=0;
                for(var match of matches){
                    var glPP = getLastParserPath();

                    var ret = checkMatch(match);

                    if(glPP && instruction != glPP[2]){
                        if(ret){
                            confirmInstruction();
                        }
                        else {
                            destroyInstruction();
                        }        
                    }

                    if(bag.disk != disk)
                        return;

                    if(ret){
                        // Exit type is possible just with unordered disk
                        if(match.type == "exit"){
                            //exitDisk();
                            exit();                                             
                        }              
                        
                        return true; 
                    }
                }  
            }

            ///
            /// Internal matches
            ///
            if(instruction.name == disk.name){
                var toDelete = [];
                for(var active of instruction.activeInstructions){
                    if(!mountInstruction(active)){
                        toDelete = instruction.activeInstructions.indexOf(active);
                    }
                }

                for(var d in toDelete){
                    var del = toDelete[d];
                    instruction.activeInstructions.splice(del,1);
                }
            }

            return false;
        }

        ///
        /// forkToInstruction
        ///
        function forkToInstruction(instr){
            var baseInstr = instruction;// bag.instruction;
            instruction = instr;
            if(!instruction)  
                instructionFault(baseInstr);

            var disk = instruction.getParentDisk();
    
            var path = instr.getPath();
            var paths = path.split('.');
            
            var curInstr = baseInstr;
    
            /*var p = 0;

            for(;p<bag.parserPath.length; p++){
                //var newInstr = curInstr.pathInstructions[pp];
                var parsPath = bag.parserPath[p];
                if(!parsPath[2])
                    break;

                curInstr = bag.parserPath[p][2]; //ex newInstr

            }*/

            if(instr.name == "arguments")
                console.log("debug");

            ///
            /// Algorithm: parserPath composer
            ///
            var ppLength = bag.parserPath.length;

            var i = instr;
            var p = ppLength-1, winP;
            for(; p >= 0; p--){
                while(i){
                    if(i == bag.parserPath[p][2]){
                        winP = p;
                        p=-1;

                        while(getLastParserPath()[2]!=i)
                            parserPathPop();

                        break;
                    }
                    i = i.parent;
                }
            }

            while(i != instr){
                parserPathPush(instr, winP+1);
                instr = instr.parent;
            }

            // Checking algorithm
            selectInstruction();
            var instr = instruction;
            var p = bag.parserPath.length-1;
            while(instr){
                if(!bag.parserPath[p] || instr != bag.parserPath[p][2])
                    console.log("ODDIO"); // perch?? ODDIO >:(

                instr = instr.parent;
                p--;
            }
    
            // Select disk
            changeDisk(disk);
            if(instruction.isMatch){
                console.error("Instruction is match ???");
                process.exit(-1);

                //console.log('debug: instruction isMatch');
                parserPathPush(instruction);
                console.log("!!!INSTRUCTION IS MATCH!!!")
                return checkMatch(instruction);
            }
            else 
                return evaluateDisk(disk);
        }

        ///
        /// Function: mountInstruction
        /// queste funzioni messe un po' a cazzo di cane...
        function mountInstruction(instr){
            var scurInstr = instruction;
            var scurParserPath = Utils.copyInNewObject(bag.parserPath);
            var scurDisk = bag.disk;

            var res = forkToInstruction(instr);

            /// Ripristinate old variable

            //Inherit parserPath from last operation if disk coincide
            if(instr.getParentDisk() != scurDisk){                
                if(!res)
                    console.log("debug");

                // Turn back
                bag.parserPath = scurParserPath;  
                var exInstr = instruction;
                instruction = scurInstr;  
                if(!instruction)  
                    instructionFault(exInstr);
                bag.disk = scurDisk;
            }
            else {
                // Remove from alivePath if the path is "official"
                // But don't remove the instruction, because it is still in work!
                alivePath.splice(comingFromAlivePathNum, 1);
            }

            return res;
        }

        ///
        /// Evaluate alivePath
        ///
        for (var p in alivePath){
            var path = alivePath[p];
            comingFromAlivePathNum = p;
            //console.log("Concurrent instruction", path);
            var instr = path[2];
            if(!mountInstruction(instr)){
                removeAlivePath(p);
                //console.log("Unmounted", path);
            }
        }
        comingFromAlivePathNum = -1;

        ///
        /// Evaluate current disk (looking for new ways)
        ///
        if(bag.disk.name == "function")
            console.log("debug");

        if(instruction)
            evaluateDisk();

    }

    ///
    /// End of execution, exit from all disk
    ///
    while(bag.parserPath.length > 0)
        if(!exitDisk())
            break;

    console.log(bag);
    cbk(bag);
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    process.exit(1);
  });

module.exports = Parser;