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
        else if(parent !== undefined)
            return parent.getDisk(name);
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
    return  nch>=48&&nch<=57;
}

function isAlpha(nch){
    return (nch>=65&&nch<=90)||(nch>=97&&nch<=122);
}

function isAlphaNumeric(nch){
    return isNumeric(nch)||isAlpha(nch);
}

function isWhitespace(nch){
    return nch == 32 || nch == 9;
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
        function: {
            MatchesOrder: true,
            Matches: [
                {
                    type: 'optional',
                    match: function(ch, bag){
                        if(isLetter(ch)){
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
                }
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
                            if(isLetter(ch)){
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
    if(!disk) disk = disks;
    for(var p in disk){
        if(typeof disk[p] == 'object'){
            disk[p]._parent = disk;
            initDisks(disk[p]);
        }
    }
}

initDisks();

function Parser(bag, str, cbk){
    bag.httpBuffer = "";
    bag.instruction = new Instruction();
    bag.args = [];

    var lastMatch;
    var lastDiskStr;
    var diskIsOrdered = false;

    function changeDisk(ret){
        if(ret){ 
            if(ret[0]==46 && lastDiskStr)
                ret = lastDiskStr+ret;

            var instr = bag.instruction.getInstr().insert(ret);

            var disk = ret;
            if(typeof ret == 'string'){
                disk = eval('disks.'+ret);
            }
            bag.disk = disk;
            instr._disk = disk;

            if(disk.OnStart) 
                disk.OnStart(bag);

            diskIsOrdered = disk.MatchesOrder == true;
            if(diskIsOrdered)
                instr._curOrder = 0;

            lastDiskStr = ret;
        }
    }

    changeDisk('root');

    let j = 0;
    for(; j<str.length; j++){
        var nch = str[j];
        var ch = String.fromCharCode(nch);

        var instr = bag.getInstr();
        var curDisk; // I know, it's ugly

        function checkMatch(match){
            if(typeof match == 'string'){
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
                if(match.match[0]==nch){
                    var validated = true;
                    for(var i=1; i<match.match.length; i++){
                        if(match.match[i]!=str[j+i]){
                            validated = false;
                            break;
                        }
                    }

                    if(validated){
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
            if(instr._disk == curDisk){
                instr = instr.close();
                evaluateDisk(instr._disk);
            }

            return false;
        }

        function evaluateDisk(disk){
            curDisk = disk;
            var matches = disk;

            if(!Array.isArray(disk)){ 
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

                    if(checkMatch(match)) {
                        switch(match.type){
                            case 'repeat':
                                instr._curOrder = 0;
                                break;

                            case 'exit':
                                changeDisk(instr.parent._disk);

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
}

module.exports = Parser;