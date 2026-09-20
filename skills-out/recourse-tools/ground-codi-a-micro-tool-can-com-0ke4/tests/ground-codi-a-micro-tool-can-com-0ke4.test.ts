const fn = compileSpec('detect if the text mentions the word urgent', [{input: 'this is urgent', output: true}, {input: 'this is normal', output: false}]);
assert(fn('urgent') === true);
assert(fn('normal') === false);
assert(fn('this is urgent') === true);
assert(fn('this is normal') === false);
const fn2 = compileSpec('check for presence of cat', [{input: 'a cat is here', output: true}, {input: 'no dog', output: false}]);
assert(fn2('cat') === true);
assert(fn2('dog') === false);