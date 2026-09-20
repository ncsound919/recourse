export function flattenDeep(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (Array.isArray(item)) {
      const flattened = flattenDeep(item);
      for (let j = 0; j < flattened.length; j++) {
        result.push(flattened[j]);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}