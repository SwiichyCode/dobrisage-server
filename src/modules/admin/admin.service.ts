import { importRunes } from "../runes/rune.service.js";
import { syncItems } from "../items/item.service.js";
import {
  importCoefficients,
  refreshKnownCraftPrices,
} from "../coefficients/coefficient.service.js";

/**
 * Reconstruit la base de données depuis zéro (ex: changement de région/instance
 * de la DB). Les items DOIVENT être importés avant les coefficients (contrainte
 * de clé étrangère + les coefficients d'items inconnus sont ignorés), et les
 * runes AVANT les coefficients aussi (la liste des serveurs à balayer est
 * déduite de RunePrice). Runes et items sont indépendants entre eux, donc
 * lancés en parallèle pour gagner du temps.
 */
export async function seedAll() {
  console.log("[seed-all] Step 1/3: importing runes and syncing items (parallel)...");

  const [runes, items] = await Promise.all([importRunes(), syncItems()]);

  console.log("[seed-all] Step 2/3: importing coefficients...");

  const coefficients = await importCoefficients();

  console.log("[seed-all] Step 3/3: refreshing known craft prices...");

  const craftPrices = await refreshKnownCraftPrices();

  console.log("[seed-all] Done.");

  return {
    runes,
    items,
    coefficients,
    craftPrices,
  };
}
