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
        return this.disk;
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
        var disk = getParentDisk();
        return (disk.MatchesOrder && !instr.completed) || disk.Transparent
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
    root: [
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
    ],
    inTag:{ 
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
        whitespace: {
            Transparent: true,
            Matches: function(ch){
                return isWhitespace(ch);
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
                {
                    type: 'mandatory',
                    match: function(ch){
                        return isAlpha(ch);
                    }
                }
            ],
            varDeclaration: {
                Matches: [
                    {
                        match: ['var', 'let', 'const'],
                        action: function(bag){
                            var instr = bag.instruction.getInstr();
                            instr = instr.insert('declaration');
                            instr.type = bag.lastMatchString;
                        }
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
                },
                'inTag',
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

function initDisks(disk=undefined, name=''){
    for(var p in disk){
        if(p != '_parent' && typeof disk[p] == 'object'){
            if(isAlphaLowerCase(p[0])){
                disk[p]._parent = disk;
                var thisName = (name!=''?name+'.':'')+p;
                disk[p].name = p;
                disk[p].fullName = thisName;
                initDisks(disk[p], thisName);
            }
        }
    }
}

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
        disk = instr.getParentDisk();
    }

    return topDisk;
}

function isDiskConfirmed(disk){
    return getDiskEnsured(disk) == disk;
}

initDisks(disks);

function Parser(bag, str, cbk){
    bag.httpBuffer = "";
    bag.instruction = new Instruction();
    bag.args = [];

    var lastDiskStr;
    var diskIsOrdered = false;

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

    ///
    /// ParserPathPop
    ///
    function parserPathPop(what){
        var go = false;
        for(var ppath of bag.parserPath){
            if(ppath[1]==what){
                go = true;
                break;
            }
        }

        if(!go){
            console.log("stop");
        }
        else {
            while(true){
                var path = bag.parserPath.pop();
                if(path[1]==what)
                    break;
            }
        }

        selectInstruction();
    }

    function parserPathPush(name, what=-1, pos=-1){
        for(var pp of bag.parserPath){
            if(pp[1]==what) 
                return false;
        }

        var arr = [name];

        if(name.constructor.name == "Instruction"){
            pos = what;
            what = name;
            name = what.name;
        }

        if(what.constructor.name == "Instruction")
            arr.push(what.obj);
        
        arr.push(what);
        
        if(pos>=0){
            var p=0;
            var newArr = [];
            for(;p<bag.parserPath.length; p++){
                if(p>=pos)
                    newArr.unshift(bag.parserPath.pop());
            }

            bag.parserPath.push(arr);
            bag.parserPath.concat(newArr);
        }
        else 
            bag.parserPath.push(arr);

        if(arr.length<3){
            selectInstruction();
            arr.push(instruction);
        }

        return true;
    }

    function getLastParserPath(){
        var n = bag.parserPath.length;
        if(n == 0) 
            return undefined;

        return bag.parserPath[n-1];
    }

    ///
    /// Select instruction
    ///
    var alivePath = []; //(?)
    function selectInstruction(){
        var tPath = "";
        var lastPath;
        var lastObj;
        var cInst = bag.instruction;
        for(var paths of bag.parserPath){
            var path = paths[0];
            lastObj = paths[1];
            if(tPath) tPath += ".";
            tPath += path;
            
            if(cInst.pathInstructions[path]){
                cInst = cInst.pathInstructions[path];
                tPath = "";
            }

            lastPath = path;
        }

        if(tPath){
            var parent = cInst;
            cInst = cInst.pathInstructions[tPath] = new Instruction();
            cInst.top = parent;
            cInst.path = tPath;
            cInst.name = lastPath;
            cInst.isMatch = !isNaN(lastPath);
            cInst.obj = lastObj;

            /*if(cInst.isMatch){ 
                alivePath.push(cInst);
            }*/
            
            while(parent != null && parent.isMatch)
                    parent = parent.top;
            cInst.parent = parent;
        }
        else if(Object.keys(cInst.pathInstructions).length>0){
            // You should close completed actions
            //todo
            //console.log("todo");
        }
        
        instruction = cInst;
    }

    function destroyInstruction(){
        var instr = instruction;
        instruction = instr.top;
        delete instr.top[instr.path];

        //todo: remove from alivePaths
        alivePath.splice(alivePath.indexOf(instr), 1);

        console.log("debug: instruction destroyed", instr);
        if(instr.name=="function")
            console.log("debug");
    }

    function instructionIsInsideBagDisk(){
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
    }

    function confirmInstruction(){
        console.log("confirm", instruction);
        instruction.parent.instructions.push(instruction);

        if(instructionIsInsideBagDisk()){
            var pp = getLastParserPath();
            alivePath.push(pp);            
        }
        else {
            var pp = getLastParserPath();
            changeDisk(pp[1]);
            console.log("check that");
        }

        //alivePath.splice(alivePath.indexOf(instruction), 1);

        /*var instr = instruction;
        var prev = instruction.close();
        var disk = prev.getParentDisk();
        prev.instructions.push(instr);
        ch angeDisk(disk); //it has a sense?*/
    }

    ///
    /// Change Disk
    ///
    function changeDisk(ret){
        if(ret){ 
            //var instr = bag.instruction.getInstr();
            instr = instruction;

            var disk = ret;
            if(typeof ret == 'string'){
                if(ret[0]=='.' && lastDiskStr)
                    ret = lastDiskStr+ret;

                disk = eval('disks.'+ret);

                if(disk == undefined){
                    //Search by parent
                    disk = bag.disk;
                    while(disk){
                        if(disk[ret])
                            break;
                        disk = disk.parent;
                    }
                }

                lastDiskStr = ret;
            }

            if(isDiskConfirmed(disk)){
                bag.disk = disk;  
                console.log('debug: bag.disk', disk);
            }

            if(!disk.Transparent /*&& instr._disk != disk*/){
                /*instr = instr.insert(disk.name);
                instr._disk = disk;*/
                parserPathPush(disk.name, disk);                
                instruction.disk = disk;
            }

            //todo: insert ad hoc instruction if disk is object         

            if(disk.OnStart) 
                disk.OnStart(bag);

            diskIsOrdered = disk.MatchesOrder;
            if(diskIsOrdered)
                instr._curOrder = instr._curOrder || 0;   

        }
    }

    ///
    /// Exit Disk
    ///
    function exitDisk(){
        var curDisk = instruction.disk;
        //or better select it from parsePath?
        var nxtDisk = curDisk._parent;//instruction.getParentDisk().disk;

        if(!curDisk.Transparent){
            parserPathPop(curDisk);
        }

        if(nxtDisk){
            changeDisk(nxtDisk);
            //evaluateDisk(); //?
        }
    }

    changeDisk('root');

    let j = 0;
    for(; j<str.length; j++){
        var nch = str[j];
        var ch = String.fromCharCode(nch);
        console.log('ch', ch);

        ///
        /// Check Match
        ///
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
                            case '?':
                                objMatch.type = 'optional'; //automatic
                                break;
                            case '=':
                                isString = true;
                                break;
                            case '"':
                                objMatch.temporary = true;
                                break;
                        }
                    }
                    else 
                        break;
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
                var disk = instr.disk;
                while(disk && !disk[match.RefMatch]){
                    disk = disk._parent;
                }

                if(disk && disk[match.RefMatch])
                    disk = disk[match.RefMatch];

                if(disk){
                    match._disk = disk;    
                }
                else {
                    //todo: error parser composition
                }
            }
            
            if(match._disk){
                //var prevDisk = instr.disk;
                var tmpDisk = match._disk;

                parserPathPush(tmpDisk.name, tmpDisk);
                changeDisk(tmpDisk);
                var res = evaluateDisk(tmpDisk);
                parserPathPop(tmpDisk);
                //if(match.temporary)

                //changeDisk(prevDisk);
                exitDisk();

                return res;
            }
            else if(typeof match.match == 'function'){
                if(match.match(ch, bag)){                    
                    if(match.action){
                        changeDisk(match.action(bag));
                        instr._curOrder++;
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

                            j += matchMatch.length-1;

                            if(match.action){
                                changeDisk(match.action(bag));
                                instr._curOrder++;
                            }

                            // Ex if match.type == 'exit'

                            lastMatch = match;
                            return true;
                        }
                    }
                }
            }

            ///
            /// Get back if instruction is finished
            ///
            // Reflect about this
            /*if(curDisk.parent && instr._disk == curDisk){
                instr = instr.close();
                evaluateDisk(instr._disk);
            }*/

            return false;
        }

        ///
        /// Evaluate Disk
        ///
        function evaluateDisk(disk){
            if(!disk){
                disk = bag.disk;

                //this is the automatic path
                //bag.generalDisk = disk;
            }

            curDisk = disk;
            
            if(disk.name == "function")
                console.log("debug");
            console.log(disk.name);

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
            else if(diskIsOrdered){
                var pos = instr._curOrder;
                /*var refInstr = instr;
                while(pos == undefined && refInstr != undefined){
                    refInstr = refInstr.parent;
                    pos = refInstr._curOrder;
                }*/

                //todo: guarda perchè non accetta whitespace in function
                if(instr.name == "function" && ch==' ')
                    console.log("debug");

                // Check through
                if(disk.MatchesThrough){
                    if(!Array.isArray(disk.MatchesThrough))
                        disk.MatchesThrough = [disk.MatchesThrough];

                    for(var i in disk.MatchesThrough){
                        if(checkMatch('"'+disk.MatchesThrough[i]))
                            return true;
                    }
                }

                function exit(){
                    if(disk.OnExit)
                        disk.OnExit();

                    instruction.completed = true;
                    exitDisk();
                    return evaluateDisk();
                }

                if(ch == '{')
                    console.log('debug');

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
                    parserPathPush(pos, match);

                    var matchDisk = undefined;                    
                    if(checkMatch(match._disk || match)) {
                        if(instr._curMatchConfirmed != undefined && instr._curMatchConfirmed != match){
                            console.log("to check");
                        }

                        instr._curMatchConfirmed = match;

                        switch(match.type){
                            case 'repeat':
                                instr._curOrder = 0;
                                break;

                            case 'exit':
                                /*var oldDisk = instr.close()._disk;
                                changeDisk(oldDisk); */
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

                            confirmInstruction();
                        }
                        else {   
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

                            parserPathPop(match);                       

                            if(pos == -1){
                                destroyInstruction();
                                return; //?
                            }

                            if(instr._curOrder >= matches.length){
                                // We are sorry but it's time to go
                                //instr = instr.close();
                                return exit();
                            }

                            // I love you <3 @naxheel

                        }
                    }
                }

                if(pos >= matches.length){
                    //todo: exception: excepted...
                    destroyInstruction();

                    return exit();
                }
            }
            ///
            /// Unordered Matches
            ///
            else {
                var i=0;
                for(var match of matches){
                    parserPathPush(i++, match);

                    var ret = checkMatch(match);

                    if(ret){
                        confirmInstruction();
                    }
                    else {
                        destroyInstruction();
                        parserPathPop(match);
                    }        

                    if(ret){
                        // Exit type is possible just with unordered disk
                        if(match.type == "exit"){
                            exitDisk();                                             
                        }              
                        
                        return true; 
                    }
                }  
            }

            //todo: No corrispondence, so delete the disk's instruction

            return false;
        }

        ///
        /// Evaluate current disk (looking for new ways)
        ///
        evaluateDisk();

        ///
        /// forkToInstruction
        ///
        function forkToInstruction(instr){
            instruction = instr;
    
            var disk = instruction.getParentDisk();
    
            var path = instr.path;
            var paths = path.split('.');
            
            var baseInstr = bag.instruction;
            var curInstr = baseInstr;
    
            var p = 0;
            for(;p<paths.length; p++){
                var pp = paths[p];
                var newInstr = curInstr.pathInstructions[pp];
    
                if(!newInstr)
                    break;
    
                curInstr = newInstr;
            }
    
            while(instr.getParentDisk() != disk)
                instr = instr.parent;
    
            while(instr != curInstr){
                parserPathPush(instr, p);
                instr = instr.parent;
            }
    
            // Select disk
            changeDisk(disk);
            if(instruction.isMatch){
                console.log('debug: instruction isMatch');
                parserPathPush(instruction);
                return checkMatch(instruction);
            }
            else 
                return evaluateDisk(disk);
        }

        ///
        /// Function: mountInstruction
        /// queste funzioni messe un po' a cazzo di cane...
        function mountInstruction(instr){
            var curInstr = instruction;
            var curParserPath = Utils.copyInNewObject(bag.parserPath);
            var curDisk = bag.disk;

            var res = forkToInstruction(instr);

            instruction = curInstr;
            bag.parserPath = curParserPath;
            bag.disk = curDisk;

            return res;
        }

        ///
        /// Evaluate alivePath
        ///
        for (var p in alivePath){
            var path = alivePath[p];
            console.log("Concurrent instruction", path);
            var instr = path[2];
            if(!mountInstruction(instr))
                alivePath.splice(p, 1);
        }

    }

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