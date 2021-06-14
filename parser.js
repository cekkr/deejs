const Bag = require('./bag');

///
/// Instruction
///
class Instruction{
    constructor(name){
        this.name = name;

        this.content = "";
        this.instructions = [];
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

function isAlpha(nch){
    if(isNaN(nch)) nch = nch.charCodeAt(0);
    return (nch>=65&&nch<=90)||(nch>=97&&nch<=122);
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
            MustCalled: true,
            MatchesOrder: true,
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

function initDisks(disk=undefined){
    for(var p in disk){
        if(p != '_parent' && typeof disk[p] == 'object'){
            disk[p]._parent = disk;
            initDisks(disk[p]);
        }
    }
}

initDisks(disks);

function Parser(bag, str, cbk){
    bag.httpBuffer = "";
    bag.instruction = new Instruction();
    bag.args = [];

    var lastDiskStr;
    var diskIsOrdered = false;

    function changeDisk(ret){
        if(ret){ 
            var instr = bag.instruction.getInstr();

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

                if(!disk.Transparent)
                    instr = instr.insert(ret);

                lastDiskStr = ret;
            }

            //todo: insert ad hoc instruction if disk is object

            bag.disk = disk;
            instr._disk = disk;

            if(disk.OnStart) 
                disk.OnStart(bag);

            diskIsOrdered = disk.MatchesOrder == true;
            if(diskIsOrdered)
                instr._curOrder = instr._curOrder || 0;      
        }
    }

    changeDisk('root');

    let j = 0;
    for(; j<str.length; j++){
        var nch = str[j];
        var ch = String.fromCharCode(nch);

        var instr = bag.instruction.getInstr();
        var curDisk; // I know, it's ugly

        function checkMatch(match){
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

                /*if(i>0){ //to think a little better
                    objMatch.RefMatch = match.substr(i, match.length-i);
                    match = objMatch;
                }
                else
                    changeDisk(instr.getDisk(match));*/
            }
            
            if(match.RefMatch){
                var disk = curDisk._parent;
                while(disk && !disk[match.RefMatch]){
                    disk = disk._parent;
                }
                if(disk){
                    var tmpDisk = disk[match.RefMatch];
                    changeDisk(tmpDisk);
                    evaluateDisk(tmpDisk);
                } else {
                    //todo: error parser composition
                }
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

                            if(match.type){
                                switch(match.type){
                                    case 'exit':
                                        changeDisk(instr._disk);
                                        break;
                                }
                            }

                            lastMatch = match;
                            return true;
                        }
                    }
                }
            }

            ///
            /// Get back if instruction is finished
            ///
            if(curDisk.parent && instr._disk == curDisk){
                instr = instr.close();
                evaluateDisk(instr._disk);
            }

            return false;
        }

        function evaluateDisk(disk){
            curDisk = disk;
            var matches = disk;
            instr = bag.instruction.getInstr();

            if(!Array.isArray(disk)){ 
                if(disk == undefined)
                    console.log("red"); //fault

                matches = disk.Matches; 
            }

            if(!Array.isArray(matches))
                matches = [matches];

            if(matches == undefined){
                for(var p in disk){
                    checkMatch(disk[p]);
                }
            }
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
                        if(checkMatch(disk.MatchesThrough[i]))
                            return;
                    }
                }

                while(pos>=0 && pos<matches.length){
                    var match = matches[pos];

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
                        match = objMatch;
                    }

                    if(checkMatch(match)) {
                        bag._curMatchConfirmed = match;

                        switch(match.type){
                            case 'repeat':
                                instr._curOrder = 0;
                                break;

                            case 'exit':
                                var oldDisk = instr.close()._disk;
                                changeDisk(oldDisk);

                            case 'repeatable':
                                break;
                        }

                        pos = -1;
                    }
                    else {
                        if(bag._curMatchConfirmed == match){
                            //end of match
                            instr._curOrder = ++pos;
                            bag._curMatchConfirmed = undefined;

                            if(match.onClose) 
                                match.onClose(bag);
                        }
                        else {
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

                            if(instr._curOrder >= matches.length){
                                // We are sorry but it's time to go
                                instr = instr.close();
                                evaluateDisk(instr._disk);
                            }
                        }
                    }
                }

                if(pos == matches.length){
                    //todo: exception: excepted...
                }
            }
            else {
                if(typeof matches == 'string'){
                    checkMatch(match);
                }
                else {
                    for(var match of matches){
                        checkMatch(match)
                    }
                }
            }
        }

        ///
        /// Evaluate current disk
        ///
        evaluateDisk(bag.disk);
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