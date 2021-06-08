class Bag{
    constructor(path, solver, req, res){
        this.bagJS = new BagJS();
        this.path = path;
        this.solver = solver;
        this.req = req;
        this.res = res;

        // Append vars
        this.vars = {};

        this.parent = undefined;
    }

    enter(){
        var nbag = new Bag();
        for(var p in this)
            nbag[p] = this[p];

        nbag.parent = this;
        nbag.obj = utils.copyInNewObject(nbag.obj);

        return nbag;
    }

    exit(){
        return this.parent;
    }
}

class BagJS{
    constructor(){
        // Append vars
        this.vars = {};
    }

    enter(){
        var nbag = new BagJS();
        for(var p in this)
            nbag[p] = this[p];

        nbag.parent = this;
        nbag.vars = utils.copyInNewObject(nbag.vars);

        return nbag;
    }

    exit(){
        return this.parent;
    }
}

module.exports = Bag;