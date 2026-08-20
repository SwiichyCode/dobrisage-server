export function jitterCoefficient(
  coefficient: number,
  maxDelta: number = 3,
): number {
  const delta = Math.floor(Math.random() * (maxDelta * 2 + 1)) - maxDelta;
  return Math.max(0, coefficient + delta);
}
