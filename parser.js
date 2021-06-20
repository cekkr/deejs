const Bag = require('./bag');

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
        if(this.parent.isMatch)
            return this.parent.getParentDisk();
        return this.parent;
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

    getDisk(name){
        if(this[name] !== undefined)
            return this[name];
        else if(this.parent !== undefined)
            return this.parent.getDisk(name);
        return null; //or get error
    }

    close(){
        this.parent.curInstr = undefined;
        return this.parent;
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
                bag.instruction.getInstr().content += ch;
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
                            var instr = bag.instruction.getInstr();
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
                MatchesOrder: true,
                MatchesThrough: 'whitespace',
                Matches: [
                    {
                        type: 'mandatory',
                        match: function(ch, bag){
                            var instr = bag.instruction.getInstr();

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

function isDiskOrdered(disk){
    var mainDisk = disk;
    var instr = instruction;

    var topDisk;
    while(disk != null){

        if(disk.MatchesOrder == true && instr.completed == false)
            topDisk = undefined;
        else if(topDisk == undefined) 
            topDisk = disk;

        instr = instr.parent;
        disk = disk._parent;
    }

    return topDisk == mainDisk;
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
        while(true){
            var path = bag.parserPath.pop();
            if(path[0]=="inTag")
                console.log("stop");
            if(path[1]==what)
                break;
        }
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
            cInst.parent = parent;
            cInst.path = tPath;
            cInst.name = lastPath;
            cInst.isMatch = !isNaN(lastPath);
            cInst.obj = lastObj;

            if(cInst.isMatch) alivePath.push(cInst);
        }
        else if(Object.keys(cInst).length>0){
            // You should close completed actions
            //todo
            console.log("todo");
        }
        
        instruction = cInst;
    }

    function destroyInstruction(){
        var instr = instruction;
        instruction = instr.parent;
        delete instr.parent[instr.path];
        //todo: remove from alivePaths
    }

    function confirmInstruction(){
        console.log("check", instruction);
        //todo: remove from alivePaths (?)
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

            if(!disk.Transparent /*&& instr._disk != disk*/){
                /*instr = instr.insert(disk.name);
                instr._disk = disk;*/
                bag.parserPath.push([disk.name, disk]);                
                selectInstruction();
                instruction.disk = disk;
            }

            //todo: insert ad hoc instruction if disk is object         

            if(disk.OnStart) 
                disk.OnStart(bag);

            diskIsOrdered = disk.MatchesOrder;
            if(diskIsOrdered)
                instr._curOrder = instr._curOrder || 0;   

            if(isDiskOrdered(disk))
                bag.disk = disk;   

        }
    }

    ///
    /// Exit Disk
    ///
    function exitDisk(){
        var curDisk = instruction.disk;
        var nxtDisk = instruction.getParentDisk().disk;

        parserPathPop(curDisk);
        selectInstruction();

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

            if(!match._disk && match.RefMatch){
                var disk = instr._disk;
                while(disk && !disk[match.RefMatch]){
                    disk = disk._parent;
                }

                if(disk){
                    match._disk = disk[match.RefMatch];    
                }
                else {
                    //todo: error parser composition
                }
            }
            
            if(match._disk){
                var prevDisk = instr._disk;
                var tmpDisk = match._disk;

                bag.parserPath.push([tmpDisk.name, tmpDisk]);
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
                bag.generalDisk = disk;
            }

            curDisk = disk;
            var matches = disk;
            //var instr = bag.instruction.getInstr();
            var instr = instruction;

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
                    bag.parserPath.push([p, disk[p]]);
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

                // Check through
                if(disk.MatchesThrough){
                    if(!Array.isArray(disk.MatchesThrough))
                        disk.MatchesThrough = [disk.MatchesThrough];

                    for(var i in disk.MatchesThrough){
                        if(checkMatch('"'+disk.MatchesThrough[i]))
                            return true;
                    }
                }

                while(pos>=0 && pos<matches.length){
                    var match = matches[pos];

                    bag.parserPath.push([pos, match]);
                    selectInstruction();

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
                                var oldDisk = instr.close()._disk;
                                changeDisk(oldDisk);

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
                            selectInstruction();

                            if(pos == -1){
                                destroyInstruction();
                                return; //?
                            }

                            if(instr._curOrder >= matches.length){
                                // We are sorry but it's time to go
                                //instr = instr.close();
                                instruction.completed = true;
                                exitDisk();
                                return evaluateDisk();
                            }

                            // I love you <3 @naxheel

                        }
                    }
                }

                if(pos == matches.length){
                    //todo: exception: excepted...
                }
            }
            ///
            /// Unordered Matches
            ///
            else {
                var i=0;
                for(var match of matches){
                    bag.parserPath.push([i++, match]);
                    selectInstruction();

                    var ret = checkMatch(match);

                    if(ret)
                        confirmInstruction();
                    else
                        destroyInstruction();

                    parserPathPop(match);
                    selectInstruction();

                    if(ret){
                        // Exit type is possible just with unordered disk
                        if(match.type == "exit"){
                            exitDisk();
                            return true;                      
                        }                        
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
        /// Evaluate alivePath
        ///
        for (var path of alivePath){
            console.log("todo", path.path);
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