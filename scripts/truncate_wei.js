function tr(n) {

    if (n.length < 15) { return '0' }

    n = n.slice(0, -14);
    n = n.slice(0, -4) + '.' + n.slice(-4);

    return n.length == 5 ? '0' + n : n;

}


console.log(tr('12345000000000'))