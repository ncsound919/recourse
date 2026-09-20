assert JSON.stringify(quickSort([3, 1, 2])) === "[1,2,3]";
assert JSON.stringify(quickSort([])) === "[]";
assert JSON.stringify(quickSort([5, 5, 1])) === "[1,5,5]";
assert JSON.stringify(quickSort([9, 7, 8, 7])) === "[7,7,8,9]";