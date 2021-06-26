module.exports = {
    copyInNewObject: function(obj){
        var nObj;
        if(Array.isArray(obj)){
            nObj = [];
        }
        else {
            nObj = {};
        }

        for(var p in obj){
            nObj[p] = obj[p];
        }
        
        return nObj;
    }
}