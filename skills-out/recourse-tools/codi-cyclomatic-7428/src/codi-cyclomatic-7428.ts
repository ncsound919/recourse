export function cyclomaticPressureScorer(input) {
  const { branches, loops, nesting } = input;
  const raw = 1.4256758 * branches + 1.0188636 * loops + 0.5 * nesting;
  const capped = Math.min(71.773151, raw);
  return Number(capped.toFixed(4));
}