import { importCoefficients, refreshKnownCraftPrices } from "./coefficient.service.js";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

async function runCoefficientImport() {
  try {
    console.log("Scheduled coefficient import starting...");

    const result = await importCoefficients();

    console.log("Scheduled coefficient import completed", result);
  } catch (error) {
    console.error("Scheduled coefficient import failed:", error);
  }
}

export function startCoefficientImportScheduler(): NodeJS.Timeout {
  console.log(
    `Coefficient import scheduler started (every ${REFRESH_INTERVAL_MS / 3_600_000}h)`,
  );

  return setInterval(runCoefficientImport, REFRESH_INTERVAL_MS);
}

async function runCraftPriceRefresh() {
  try {
    console.log("Scheduled craft price refresh starting...");

    const result = await refreshKnownCraftPrices();

    console.log("Scheduled craft price refresh completed", result);
  } catch (error) {
    console.error("Scheduled craft price refresh failed:", error);
  }
}

export function startCraftPriceRefreshScheduler(): NodeJS.Timeout {
  console.log(
    `Craft price refresh scheduler started (every ${REFRESH_INTERVAL_MS / 3_600_000}h)`,
  );

  return setInterval(runCraftPriceRefresh, REFRESH_INTERVAL_MS);
}
