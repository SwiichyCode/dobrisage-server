import { importRunes } from "./rune.service.js";

const IMPORT_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

async function runScheduledImport() {
  try {
    console.log("Scheduled rune import starting...");

    const result = await importRunes();

    console.log("Scheduled rune import completed", result);
  } catch (error) {
    console.error("Scheduled rune import failed:", error);
  }
}

export function startRuneImportScheduler(): NodeJS.Timeout {
  console.log(
    `Rune import scheduler started (every ${IMPORT_INTERVAL_MS / 3_600_000}h)`,
  );

  return setInterval(runScheduledImport, IMPORT_INTERVAL_MS);
}
