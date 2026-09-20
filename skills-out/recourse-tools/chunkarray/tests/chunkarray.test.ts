assert JSON.stringify(chunkArray([1,2,3,4,5],2)) === JSON.stringify([[1,2],[3,4],[5]]);
assert JSON.stringify(chunkArray([1,2,3],5)) === JSON.stringify([[1,2,3]]);
assert chunkArray([],2).length === 0;
assert JSON.stringify(chunkArray([1,2,3,4],2)) === JSON.stringify([[1,2],[3,4]]);