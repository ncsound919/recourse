const a = [1, 3, 5, 7, 9];
assert binarySearch(a, 5) === 2;
assert binarySearch(a, 1) === 0;
assert binarySearch(a, 9) === 4;
assert binarySearch(a, 4) === -1;
assert binarySearch([], 3) === -1;