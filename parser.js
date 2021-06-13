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

    newChild(name){
        var pos = this.instructions.length;
        if(!name) name = pos;
        var instr = new Instruction(name);
        instr.pos = pos;
        instr.parent = this;
        this.curInstr = instr;
        return instr;
    }

    check(property){
        if(this.property==undefined)
            this.property = "";
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
    return (nch > 33 && nch < 47) || (nch > 58 && nch < 64) || (nch > 91 && nch < 96);
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
            'whitespace'
        ],
        whitespace: {
            Matches: function(ch){
                return isWhitespace(ch);
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
                'whitespace', 
                {
                    type: 'mandatory',
                    match: '(',
                    action: function(){
                        return '.arguments'
                    }
                },
                'whitespace',
                '!block'
            ],
            arguments: {
                OnStart: function(bag){
                    bag._argNum = 0;
                },
                MatchesOrder: true,
                Matches: [
                    {
                        type: 'mandatory',
                        match: function(ch, bag){
                            if(isAlpha(ch)){
                                var instr = bag.instruction.getInstr();
                                if(instr.name == "argument") 
                                    instr = instr.parent.newChild("argument");
                                else 
                                    instr = instr.newChild("argument");

                                //bag._curChild = instr;
                                instr.check("argName");
                                instr.argName += ch;
    
                                return true;
                            }
    
                            return false;
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

    var lastMatch;
    var lastDiskStr;
    var diskIsOrdered = false;

    function changeDisk(ret){
        if(ret){ 
            var instr = bag.instruction.getInstr().insert(ret);

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

            bag.disk = disk;
            instr._disk = disk;

            if(disk.OnStart) 
                disk.OnStart(bag);

            diskIsOrdered = disk.MatchesOrder == true;
            if(diskIsOrdered)
                instr._curOrder = 0;      
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
            if(typeof match == 'string'){
                //Interpretate signals
                var objMatch = {};
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
                if(i>0){
                    objMatch.match = match.substr(i, match.length-i);
                    match = objMatch;
                }
                else
                    changeDisk(instr.getDisk(match));
            }
            else if(typeof match.match == 'function'){
                if(match.match(ch, bag)){                    
                    if(match.action) 
                        changeDisk(match.action(bag));
                    lastMatch = match;
                    return true;
                }
            }
            else { // string
                if(match.match[0]==ch){
                    var validated = true;
                    for(var i=1; i<match.match.length; i++){
                        if(match.match[i] != String.fromCharCode(str[j+i])){
                            validated = false;
                            break;
                        }
                    }

                    if(validated){
                        j += match.match.length;
                        if(match.action)
                            changeDisk(match.action(bag));
                        lastMatch = match;
                        return true;
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

            if(!Array.isArray(disk)){ 
                if(disk == undefined)
                    console.log("red");

                matches = disk.Matches; 
            }

            if(matches == undefined){
                for(var p in disk){
                    checkMatch(disk[p]);
                }
            }
            else if(diskIsOrdered){
                var pos = instr._curOrder;
                while(pos>=0 && pos<matches.length){
                    var match = matches[pos];

                    if(typeof match == 'string'){ //force match object for the ordered
                        //Interpretate signals
                        var objMatch = {type: 'optional'};
                        var i=0;
                        for(;i<match.length; i++){
                            if(isSymbol(match[i])){
                                switch(match[i]){
                                    case 33: //!
                                        objMatch.type = "mandatory";
                                        break;
                                    case 62: //>
                                        objMatch.type = "repeatable";
                                        break;
                                }
                            }
                            else 
                                break;
                        }

                        objMatch.match = match.substr(i, match.length-i);
                        match = objMatch;
                    }

                    if(checkMatch(match)) {
                        switch(match.type){
                            case 'repeat':
                                instr._curOrder = 0;
                                break;

                            case 'exit':
                                changeDisk(instr.parent._disk);

                            case 'repeatable':
                                break;

                            default: 
                                instr._curOrder++;
                                break;
                        }

                        pos = -1;
                    }
                    else {
                        switch(match.type){
                            case 'mandatory':
                                pos = -1;
                                //todo: exception
                                break;

                            case 'repeatable':
                            case 'optional':
                                pos++;
                                break;

                            case 'repeat':
                                pos = -1;
                                instr._curOrder = 0;
                                break;
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

module.exports = Parser;