/**
 * Altère légèrement un prix d'item, sans jamais descendre sous 0. L'écart
 * est proportionnel au prix (maxDeltaRatio) plutôt que fixe en kamas, pour
 * rester cohérent que l'item vaille 1 000 ou plusieurs millions de kamas.
 */
export function jitterItemPrice(price: number, maxDeltaRatio: number = 0.01): number {
  const maxDelta = Math.max(1, Math.round(price * maxDeltaRatio));
  const delta = Math.floor(Math.random() * (maxDelta * 2 + 1)) - maxDelta;
  return Math.max(0, price + delta);
}
