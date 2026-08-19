import { dofocusApiClient } from "../../http/dofocus-client.js";
import type { Coefficient, DofocusItemDetail } from "./coefficient.types.js";

export async function getItemDetailFromDofocus(
  itemId: number,
): Promise<DofocusItemDetail> {
  const response = await dofocusApiClient.get<DofocusItemDetail>(
    `/items/${itemId}`,
    {
      params: {
        lang: "fr",
      },
      headers: {
        Referer: `https://dofocus.fr/items/${itemId}`,
      },
    },
  );

  return response.data;
}

/**
 * Durée de vie du cache :
 * 5 minutes
 */
const COEFFICIENT_CACHE_TTL = 5 * 60 * 1000;

type CoefficientCacheEntry = {
  data: Coefficient[];
  expiresAt: number;
};

/**
 * Cache des coefficients par serveur.
 *
 * Exemple :
 *
 * Tylezia -> [...]
 * Rafal   -> [...]
 */
const coefficientCache = new Map<string, CoefficientCacheEntry>();

export async function getCoefficientsByServer(
  serverName: string,
): Promise<Coefficient[]> {
  const cacheKey = serverName.toLowerCase();

  /*
   * Vérification du cache
   */
  const cached = coefficientCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    console.log(`Coefficient cache HIT: ${serverName}`);

    return cached.data;
  }

  /*
   * Cache absent ou expiré
   */
  console.log(`Coefficient cache MISS: ${serverName}`);

  const response = await dofocusApiClient.get<Coefficient[]>(
    `/coefficients/by-server/${serverName}`,
    {
      headers: {
        Referer: `https://dofocus.fr/${serverName}`,
      },
    },
  );

  /*
   * Mise en cache
   */
  coefficientCache.set(cacheKey, {
    data: response.data,
    expiresAt: Date.now() + COEFFICIENT_CACHE_TTL,
  });

  console.log(`Coefficient cache UPDATED: ${serverName}`);

  return response.data;
}
