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
}

///
/// Char utils
///
function isAlphaNumeric(nch){
    return (nch>=48&&nch<=57)||(nch>=65&&nch<=90)||(nch>=97&&nch<=122);
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
            }
        ],
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

                }
            }
        }
    }
};


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

            var instr = bag.instruction.insert(ret);
            var disk = bag.disk = eval('disks.'+ret);

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

        var disk = bag.disk;
        var matches = disk;
        var instr = bag.getInstr();

        if(!Array.isArray(disk)){ 
            matches = disk.Matches; 
        }

        function checkMatch(match){
            if(typeof match.match == 'function'){
                if(match.match(ch, bag)){                    
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
                        changeDisk(match.action(bag));
                        lastMatch = match;
                        return true;
                    }
                }
            }

            return false;
        }

        if(diskIsOrdered){
            var pos = instr._curOrder;
            while(pos>=0 && pos<matches.length){
                var match = matches[pos];

                if(checkMatch(match)) {
                    switch(match.type){
                        case 'repeat':
                            instr._curOrder = 0;
                            break;

                        case 'exit':
                            changeDisk(instr.parent.name);

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
            for(var match of matches){
                checkMatch(match)
            }
        }
    }
}

module.exports = Parser;