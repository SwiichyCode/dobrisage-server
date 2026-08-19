import { getCoefficientsByServer as fetchCoefficientsFromDofocus } from "./coefficient.api.js";
import type { Coefficient } from "./coefficient.types.js";

type CoefficientCacheEntry = {
  data: Coefficient[];
  updatedAt: number;
};

const FRESH_TTL = 5 * 60 * 1000; // 5 minutes
const STALE_TTL = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, CoefficientCacheEntry>();

const refreshPromises = new Map<string, Promise<Coefficient[]>>();

async function refreshCoefficients(serverName: string): Promise<Coefficient[]> {
  console.log(`Coefficient cache REFRESH: ${serverName}`);

  const data = await fetchCoefficientsFromDofocus(serverName);

  cache.set(serverName, {
    data,
    updatedAt: Date.now(),
  });

  console.log(
    `Coefficient cache UPDATED: ${serverName} (${data.length} coefficients)`,
  );

  return data;
}

function refreshInBackground(serverName: string) {
  // Un refresh est déjà en cours
  if (refreshPromises.has(serverName)) {
    return;
  }

  const promise = refreshCoefficients(serverName);

  refreshPromises.set(serverName, promise);

  promise
    .catch((error) => {
      console.error(`Coefficient cache REFRESH FAILED: ${serverName}`, error);
    })
    .finally(() => {
      refreshPromises.delete(serverName);
    });
}

export async function getCoefficientsByServer(
  serverName: string,
): Promise<Coefficient[]> {
  const entry = cache.get(serverName);

  const now = Date.now();

  // ==================================
  // Cache inexistant
  // ==================================

  if (!entry) {
    console.log(`Coefficient cache MISS: ${serverName}`);

    // Plusieurs requêtes simultanées
    // doivent partager le même refresh.
    if (!refreshPromises.has(serverName)) {
      const promise = refreshCoefficients(serverName);

      refreshPromises.set(serverName, promise);

      promise
        .catch((error) => {
          console.error(
            `Coefficient cache REFRESH FAILED: ${serverName}`,
            error,
          );
        })
        .finally(() => {
          refreshPromises.delete(serverName);
        });
    }

    return refreshPromises.get(serverName)!;
  }

  const age = now - entry.updatedAt;

  // ==================================
  // Cache FRESH
  // ==================================

  if (age < FRESH_TTL) {
    return entry.data;
  }

  // ==================================
  // Cache STALE
  // ==================================

  if (age < STALE_TTL) {
    console.log(`Coefficient cache STALE: ${serverName}`);

    // On sert immédiatement
    // les anciennes données.
    refreshInBackground(serverName);

    return entry.data;
  }

  // ==================================
  // Cache trop vieux
  // ==================================

  console.log(`Coefficient cache EXPIRED: ${serverName}`);

  // Cette fois on attend le refresh.
  if (!refreshPromises.has(serverName)) {
    const promise = refreshCoefficients(serverName);

    refreshPromises.set(serverName, promise);

    promise
      .catch((error) => {
        console.error(`Coefficient cache REFRESH FAILED: ${serverName}`, error);
      })
      .finally(() => {
        refreshPromises.delete(serverName);
      });
  }

  return refreshPromises.get(serverName)!;
}

export function invalidateCoefficientCache(serverName?: string) {
  if (serverName) {
    cache.delete(serverName);

    console.log(`Coefficient cache INVALIDATED: ${serverName}`);

    return;
  }

  cache.clear();

  console.log("Coefficient cache INVALIDATED: ALL");
}
