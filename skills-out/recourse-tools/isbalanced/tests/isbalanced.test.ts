assert isBalanced("(a[b]{c})") === true;
assert isBalanced("") === true;
assert isBalanced("([)]") === false;
assert isBalanced("(") === false;
assert isBalanced("{[]}") === true;