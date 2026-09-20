export function isBalanced(str) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (openers.has(ch)) {
      stack.push(ch);
    } else if (pairs[ch]) {
      if (stack.length === 0 || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}