/**
 * Altère légèrement un prix de rune de quelques unités (kamas), sans jamais
 * descendre sous 0.
 */
export function jitterRunePrice(price: number, maxDelta: number = 3): number {
  const delta = Math.floor(Math.random() * (maxDelta * 2 + 1)) - maxDelta;
  return Math.max(0, price + delta);
}
