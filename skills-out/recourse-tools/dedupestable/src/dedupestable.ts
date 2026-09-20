export function dedupeStable(arr) {
  const seen = new Set();
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}