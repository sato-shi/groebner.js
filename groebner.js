var monomial = require('./monomial')
var coefficient = require('./coefficient')
var polynomial = require('./polynomial')


function s_polynomial(f, g){
    // Return S-polynomial of f and g with respect to the order.
    // S(f, g) = (lc(g)*T/lb(f))*f - (lc(f)*T/lb(g))*g,
    // where T = lcm(lb(f), lb(g)).

    var fl = polynomial.leading_term(f),
        gl = polynomial.leading_term(g);

    var t = monomial.lcm(fl[0], gl[0]);
    return polynomial.sub(polynomial.term_mul(f, [monomial.sub(t, fl[0]), gl[1]]), 
                          polynomial.term_mul(g, [monomial.sub(t, gl[0]), fl[1]]))
}


// Return the reduced polynomial of reducee by reducer.  That is, if
// one of reducee's bases is divisible by the leading base of reducer
// with respect to the order, the returned polynomial is the result
// of canceling out the term.

function step_reduce(reducee, reducer){
    var term = polynomial.leading_term(reducer), // term = [base, coeff]
        lb = term[0],
        lc = term[1];
    for(var i = 0; i < reducee.length; i++){
        var b = reducee[i][0],
            c = reducee[i][1];
        if(monomial.equal(monomial.lcm(b, lb), b)){
            return polynomial.add(reducee, polynomial.term_mul(reducer, [
                monomial.sub(b, lb), 
                coefficient.div(coefficient.neg(c), lc)
            ]))
        }
    }
}

// Return normalized form of f with respect to reducer, a set of
// polynomials, and order.
function reduce_closure(f, reducers){
    // console.log('redclothes', f, reducers)
    while(true){
        var reduced = null;
        for(var i = 0; i < reducers.length; i++){
            reduced = step_reduce(f, reducers[i]);
            if(reduced){
                f = reduced;
                break
            }
        }
        if(!reduced) return f;
    }
}

// Return a Groebner basis of the ideal generated by given generating
// set of polynomials with respect to the order.

// Be careful, this implementation is very naive.
exports.naive_buchberger = function naive_buchberger(groebner){
    groebner = groebner.map(polynomial.filter_zero).filter(x => x.length > 0)

    var pairs = []
    for(var i = 0; i < groebner.length; i++){
        for(var j = 0; j < groebner.length; j++){
            if(i === j) continue;
            pairs.push([groebner[i], groebner[j]])
        }
    }

    while(pairs.length > 0){
        var fg = pairs.pop(),
            f = fg[0],
            g = fg[1];
        var h = reduce_closure(s_polynomial(f, g), groebner);
        if(!polynomial.is_zero(h)){
            for(var i = 0; i < groebner.length; i++){
                pairs.push([groebner[i], h])
            }
            groebner.push(h)
        }
    }
    return groebner
}


// Return the reduced Groebner basis constructed from a Groebner
// basis.

// 1) lb(f) divides lb(g) => g is not in reduced Groebner basis
// 2) monic

exports.reduce_groebner = function reduce_groebner(gb){
    var H = pre_reduction(gb);
    // H.forEach(k => console.log(k))
    return actual_reduction(H)
}


function is_groebner(G){
    for(var i = 0; i < G.length; i++){
        for(var j = i + 1; j < G.length; j++){
            var s = s_polynomial(G[i], G[j]);
            s = polynomial.ring_rem(s, G)
            if(s.length > 0) return false;
        }
    }
    return true;
}
exports.is_groebner = is_groebner

function pre_reduction(gb){
    // Becker, Weispfenn ing, p. 217: H is Groebner basis of the ideal generated by G.

    var F = gb.slice(0),
        H = [];
    while(F.length > 0){
        var f0 = F.pop()
        if(!F.concat(H).some(function(f){
            return monomial.divides(polynomial.leading_term(f)[0],
                                    polynomial.leading_term(f0)[0])
        })){
            H.push(f0)
        }
    }
    return H.sort(function(a, b){
        return monomial.cmp(polynomial.leading_term(a)[0],
                            polynomial.leading_term(b)[0])
    })
}

function actual_reduction(P){
    var Q = [];

    for(var i = 0; i < P.length; i++){
        var p = P[i];

        var h = polynomial.ring_rem(p, P.slice(0, i).concat(P.slice(i + 1)))
        if(h){
            Q.push(h)
        }
    }
    return Q.map(polynomial.monic)
}


exports.old_reduce_groebner = function old_reduce_groebner(gb){
    var reduced_basis = [];
    var lbc = gb
        .map(k => [polynomial.leading_term(k), k])
        .sort((a, b) => monomial.cmp(a[0], b[0]));

    var lbs = lbc.map(k => k[0]),
        lbr = lbc.map(k => k[1])

    for(var i = 0; i < lbs.length; i++){
        var lbi = lbs[i][0];
        var divisor_found = false;
        for(var j = lbs.length - 1; j > i; j--){
            var lbj = lbs[j][0];
            if(monomial.equal(monomial.lcm(lbj, lbi), lbi)){
                // divisor found
                divisor_found = true
                break
            }
        }
        if(!divisor_found){
            var g = lbr[i];
            var c = lbs[i][1];
            if(coefficient.is_one(c) == false){
                // make it monic
                g = polynomial.scalar_mul(g, coefficient.inv(c))
            }
            reduced_basis.push(g)
        }
    }
    return reduced_basis
}

exports.is_reduced = function is_reduced(G){
    // G.sort(key=lambda g: order(g.LM))
    for(var i = 0; i < G.length; i++){
        var g = G[i];

        if(!coefficient.is_one(polynomial.leading_term(g)[1])){
            console.log('not-monic')
            return false
        }

        for(var j = 0; j < g.length; j++){
            var term = g[j];
            var H = G.slice(0, i).concat(G.slice(i+1))
            for(var k = 0; k < H.length; k++){
                var h = H[k];
                if(monomial.divides(polynomial.leading_term(h)[0], term[0])){
                    return false
                }
            }
        }
    }
    return true;
}

// Return a Groebner basis of the ideal generated by given generating
// set of polynomials with respect to the order.

// This function uses the 'normal strategy'.
exports.normal_strategy = function normal_strategy(groebner){
    var pairs = [],
        lcms = [];
    var treat = {};
    
    groebner = groebner.map(polynomial.filter_zero).filter(x => x.length > 0)

    for(var i = 0; i < groebner.length; i++){
        var f = groebner[i],
            lb_f = polynomial.leading_term(f)[0]
        for(var j = i + 1; j < groebner.length; j++){
            var g = groebner[j],
                lb_g = polynomial.leading_term(g)[0];

            var lcm_f_g = monomial.lcm(lb_f, lb_g)

            if(monomial.equal(lcm_f_g, monomial.add(lb_f, lb_g))){ // disjoint
                treat[i+':'+j] = 1
                treat[j+':'+i] = 1
            }else{
                // keep lcms sorted, and so pairs in parallel
                k = monomial.bisect(lcms, lcm_f_g)
                pairs.splice(k, 0, [i, j])
                lcms.splice(k, 0, lcm_f_g)
            }
        }
    }
    // main loop
    while(pairs.length > 0){
        var ij = pairs.shift(),
            i = ij[0], j = ij[1];
        var lcm_f_g = lcms.shift()
        treat[i+':'+j] = 1
        var divisor_found = false;
        for(var p = 0; p < groebner.length; p++){
            if(treat[i+':'+p] && treat[p+':'+j]){
                var pivot = polynomial.leading_term(groebner[p])[0]
                if(monomial.equal(monomial.lcm(pivot, lcm_f_g), lcm_f_g)){
                    divisor_found = true;
                    break
                }
            }
        }
        if(!divisor_found){
            var f = groebner[i],
                g = groebner[j],
                h = reduce_closure(s_polynomial(f, g), groebner);
            
            if(!polynomial.is_zero(h)){
                var lb_h = polynomial.leading_term(h)[0]
                var hindex = groebner.length;
                for(var i = 0; i < groebner.length; i++){
                    var lb_f = polynomial.leading_term(f)[0],
                        lcm_f_h = monomial.lcm(lb_f, lb_h);
                    if(monomial.equal(lcm_f_h, monomial.add(lb_f, lb_h))){ // disjoint
                        treat[i + ':' + hindex] = 1
                    }else{
                        var k = monomial.bisect(lcms, lcm_f_h);
                        pairs.splice(k, [i, hindex])
                        lcms.splice(k, [lcm_f_h])
                    }
                }
                groebner.push(h)
            }
        }
    }
    return groebner
}
