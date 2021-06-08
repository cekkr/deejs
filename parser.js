const Bag = require('./bag');

const disks = {
    root: [
        {
            match: '<?',
            action: function(bag){
                return disks.inTag;
            }
        },
        {
            match: function(ch){

            }
        }
    ],
    inTag: [
        
    ]
};


function Parser(bag, str, cbk){
    bag.disk = disks.root;

    let j = 0;
    for(; j<str.length; j++){

    }
}

module.exports = Parser;