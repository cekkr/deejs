module.exports = {
    copyInNewObject: function(obj){
        var nObj = {};
        for(var p in obj){
            nObj[p] = obj[p];
        }
    }
}