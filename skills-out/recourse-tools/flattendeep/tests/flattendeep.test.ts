assert JSON.stringify(flattenDeep([1, [2, [3, [4]], 5]])) === "[1,2,3,4,5]";
assert JSON.stringify(flattenDeep([[], [[]]])) === "[]";
assert JSON.stringify(flattenDeep([1, 2, 3])) === "[1,2,3]";