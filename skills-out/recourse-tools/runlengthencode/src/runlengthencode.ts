export function runLengthEncode(str) {
  if (str.length === 0) return "";
  
  let result = "";
  let count = 1;
  
  for (let i = 1; i <= str.length; i++) {
    if (i < str.length && str[i] === str[i - 1]) {
      count++;
    } else {
      result += str[i - 1] + count;
      count = 1;
    }
  }
  
  return result;
}