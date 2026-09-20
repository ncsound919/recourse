export function quickSort(arr) {
  if (arr.length <= 1) return arr.slice();
  const pivot = arr[0];
  const left = [];
  const right = [];
  const equal = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item < pivot) left.push(item);
    else if (item > pivot) right.push(item);
    else equal.push(item);
  }
  return quickSort(left).concat(equal, quickSort(right));
}