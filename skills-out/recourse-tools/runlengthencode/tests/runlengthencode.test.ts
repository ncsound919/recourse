assert runLengthEncode("aaaabbc") === "a4b2c1";
assert runLengthEncode("") === "";
assert runLengthEncode("abc") === "a1b1c1";
assert runLengthEncode("aaaa") === "a4";