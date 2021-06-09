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
        if(this.curInstr && instr.name.startsWith(this.curInstr.name)){
            this.curInstr.insert(instr);
        }
        else {
            this.instructions.push(instr);
            this.curInstr = instr;
        }
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
                bag.instruction.curInstr.content += ch;
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

        }
    }
};


function Parser(bag, str, cbk){
    bag.httpBuffer = "";
    bag.instruction = new Instruction();
    bag.args = [];

    var lastCont;

    function changeDisk(ret){
        if(ret){ 
            bag.instruction.insert(ret);
            bag.disk = eval('disks.'+ret);
        }
    }

    changeDisk('root');

    let j = 0;
    for(; j<str.length; j++){
        var nch = str[j];
        var ch = String.fromCharCode(nch);

        var matches = bag.disk;
        if(!Array.isArray(matches)) matches = matches.Matches;

        for(var cont of matches){
            if(typeof cont.match == 'function'){
                if(cont.match(ch, bag)){                    
                    changeDisk(cont.action(bag));
                    lastCont = cont;
                }
            }
            else { // string
                if(cont.match[0]==nch){
                    var validated = true;
                    for(var i=1; i<cont.match.length; i++){
                        if(cont.match[i]!=str[j+i]){
                            validated = false;
                            break;
                        }
                    }

                    if(validated){
                        changeDisk(cont.action(bag));
                        lastCont = cont;
                    }
                }
            }
        }
    }
}

module.exports = Parser;