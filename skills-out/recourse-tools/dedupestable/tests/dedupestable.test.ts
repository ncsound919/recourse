assert JSON.stringify(dedupeStable([1,2,1,3,2,4])) === JSON.stringify([1,2,3,4]);
assert dedupeStable(["a","b","a","c","b"]).length === 3;
assert dedupeStable([]).length === 0;
assert JSON.stringify(dedupeStable([5,5,5])) === JSON.stringify([5]);