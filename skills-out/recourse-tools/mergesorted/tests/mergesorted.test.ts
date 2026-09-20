const m = mergeSorted([1, 4, 6], [2, 3, 5]);
assert m.length === 6;
assert JSON.stringify(m) === "[1,2,3,4,5,6]";
assert JSON.stringify(mergeSorted([], [1])) === "[1]";