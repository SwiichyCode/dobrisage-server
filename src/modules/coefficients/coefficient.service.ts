import {
  getCoefficientsByServer,
  getItemDetailFromDofocus,
  getItemPriceHistoryFromDofocus,
} from "./coefficient.api.js";
import type { DofocusItemDetail } from "./coefficient.types.js";
import { getItemsCache, type CachedItem } from "../items/item.cache.js";
import prisma from "../../db/prisma.js";
import { jitterCoefficient } from "../../helpers/coefficientJitter.js";
import type { ItemName } from "../items/item.types.js";

export type ItemMarketDataView = {
  id: number;
  name: ItemName;
  level: number;
  img: string;
  effects: unknown;
  serverName: string;
  coefficient: number | null;
  coefficientUpdatedAt: Date | null;
  craftPrice: number | null;
  craftPriceUpdatedAt: Date | null;
};

/**
 * Une saisie utilisateur reste prioritaire sur le rafraîchissement Dofocus
 * pendant cette durée : le cron ne l'écrase pas tant qu'elle est "récente".
 * Même logique et même durée que la protection des prix de runes.
 */
const USER_PROTECTION_DAYS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Coefficient — balayage complet toutes les heures
//
// /coefficients/by-server/:serverName renvoie en un seul appel
// le coefficient de TOUT le catalogue pour un serveur donné.
// Avec une douzaine de serveurs, couvrir l'intégralité des items
// coûte donc une douzaine d'appels par heure, pas un par item.
// ============================================================

type CoefficientRow = {
  itemId: number;
  serverName: string;
  coefficient: number;
  dateUpdated: Date;
};

async function upsertCoefficients(rows: CoefficientRow[]) {
  if (rows.length === 0) {
    return;
  }

  const placeholders = rows
    .map((_, index) => {
      const base = index * 4;

      return `($${base + 1}, $${base + 2}, $${base + 3}, 'DOFOCUS'::"PriceSource", $${base + 4})`;
    })
    .join(",");

  const params = rows.flatMap((row) => [
    row.itemId,
    row.serverName,
    row.coefficient,
    row.dateUpdated,
  ]);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "ItemMarketData" AS imd (
      "itemId",
      "serverName",
      "coefficient",
      "coefficientSource",
      "coefficientUpdatedAt"
    )
    VALUES ${placeholders}
    ON CONFLICT ("itemId", "serverName")
    DO UPDATE SET
      "coefficient" = EXCLUDED."coefficient",
      "coefficientSource" = EXCLUDED."coefficientSource",
      "coefficientUpdatedAt" = EXCLUDED."coefficientUpdatedAt"
    WHERE NOT (
      imd."coefficientSource" = 'USER'
      AND imd."coefficientUpdatedAt" > now() - interval '${USER_PROTECTION_DAYS} days'
    )
    `,
    ...params,
  );
}

/**
 * La liste des serveurs n'est déclarée nulle part : on la déduit des
 * RunePrice déjà importés plutôt que de la dupliquer en dur.
 */
async function getKnownServerNames(): Promise<string[]> {
  const rows = await prisma.runePrice.findMany({
    distinct: ["serverName"],
    select: {
      serverName: true,
    },
  });

  return rows.map((row) => row.serverName);
}

async function getExistingItemIds(): Promise<Set<number>> {
  const items = await prisma.item.findMany({
    select: {
      id: true,
    },
  });

  return new Set(items.map((item) => item.id));
}

export async function importCoefficients() {
  const serverNames = await getKnownServerNames();

  /*
   * Dofocus peut renvoyer des coefficients pour des items qu'on n'a pas
   * encore synchronisés (voir POST /items/import) — ItemMarketData a une
   * contrainte de clé étrangère vers Item, donc un seul itemId inconnu
   * ferait échouer tout le lot d'un serveur si on ne filtre pas en amont.
   */
  const existingItemIds = await getExistingItemIds();

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const serverName of serverNames) {
    try {
      const coefficients = await getCoefficientsByServer(serverName);

      const rows: CoefficientRow[] = [];

      for (const entry of coefficients) {
        if (!existingItemIds.has(entry.itemId)) {
          totalSkipped++;

          continue;
        }

        rows.push({
          itemId: entry.itemId,
          serverName,
          coefficient: jitterCoefficient(entry.coefficient),
          dateUpdated: new Date(entry.dateUpdated),
        });
      }

      await upsertCoefficients(rows);

      totalUpserted += rows.length;

      console.log(`Coefficients upserted for ${serverName}: ${rows.length}`);
    } catch (error) {
      console.error(`Failed to import coefficients for ${serverName}:`, error);
    }
  }

  if (totalSkipped > 0) {
    console.log(
      `Coefficients skipped (item not in our catalog yet): ${totalSkipped}`,
    );
  }

  return {
    servers: serverNames.length,
    coefficients: totalUpserted,
    skipped: totalSkipped,
  };
}

// ============================================================
// Prix de craft — pas de source bulk chez Dofocus, reste en
// fetch à la demande par item (/items/:id renvoie tous les
// serveurs d'un coup, donc un seul appel suffit par item).
// ============================================================

type CraftPriceRow = {
  itemId: number;
  serverName: string;
  craftPrice: number;
};

async function upsertCraftPrices(rows: CraftPriceRow[]) {
  if (rows.length === 0) {
    return;
  }

  const placeholders = rows
    .map((_, index) => {
      const base = index * 3;

      return `($${base + 1}, $${base + 2}, $${base + 3}, 'DOFOCUS'::"PriceSource", now())`;
    })
    .join(",");

  const params = rows.flatMap((row) => [
    row.itemId,
    row.serverName,
    row.craftPrice,
  ]);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "ItemMarketData" AS imd (
      "itemId",
      "serverName",
      "craftPrice",
      "craftPriceSource",
      "craftPriceUpdatedAt"
    )
    VALUES ${placeholders}
    ON CONFLICT ("itemId", "serverName")
    DO UPDATE SET
      "craftPrice" = EXCLUDED."craftPrice",
      "craftPriceSource" = EXCLUDED."craftPriceSource",
      "craftPriceUpdatedAt" = EXCLUDED."craftPriceUpdatedAt"
    WHERE NOT (
      imd."craftPriceSource" = 'USER'
      AND imd."craftPriceUpdatedAt" > now() - interval '${USER_PROTECTION_DAYS} days'
    )
    `,
    ...params,
  );
}

async function fetchAndStoreCraftPrice(itemId: number, serverName: string) {
  let detail: DofocusItemDetail;

  try {
    detail = await getItemDetailFromDofocus(itemId);
  } catch (error) {
    console.error(`Failed to fetch item ${itemId} detail from Dofocus:`, error);

    return null;
  }

  const rows: CraftPriceRow[] = detail.prices.map((entry) => ({
    itemId,
    serverName: entry.serverName,
    craftPrice: entry.price,
  }));

  if (rows.length === 0) {
    return null;
  }

  await upsertCraftPrices(rows);

  return prisma.itemMarketData.findUnique({
    where: {
      itemId_serverName: {
        itemId,
        serverName,
      },
    },
  });
}

const CRON_FETCH_DELAY_MS = 300;

/**
 * Rafraîchit uniquement les items déjà consultés au moins une fois
 * (ceux qui ont déjà un craftPrice renseigné en base), pas tout le
 * catalogue : il n'y a pas de source bulk pour le prix de craft, donc
 * un balayage complet coûterait un appel par item du catalogue.
 */
export async function refreshKnownCraftPrices() {
  const knownItems = await prisma.itemMarketData.findMany({
    where: {
      craftPrice: {
        not: null,
      },
    },
    distinct: ["itemId"],
    select: {
      itemId: true,
    },
  });

  console.log(
    `Refreshing craft prices for ${knownItems.length} known item(s)...`,
  );

  let refreshed = 0;
  let failed = 0;

  for (const { itemId } of knownItems) {
    try {
      const detail = await getItemDetailFromDofocus(itemId);

      const rows: CraftPriceRow[] = detail.prices.map((entry) => ({
        itemId,
        serverName: entry.serverName,
        craftPrice: entry.price,
      }));

      await upsertCraftPrices(rows);

      refreshed++;
    } catch (error) {
      failed++;
      console.error(`Failed to refresh craft price for item ${itemId}:`, error);
    }

    await sleep(CRON_FETCH_DELAY_MS);
  }

  console.log(
    `Craft price refresh completed: ${refreshed} refreshed, ${failed} failed`,
  );

  return { refreshed, failed };
}

// ============================================================
// Historique des prix — miroir en lecture seule de
// /items/:id/prices/history?serverName=X chez Dofocus, un
// appel par couple (item, serveur), pas de source bulk.
// ============================================================

type PriceHistoryRow = {
  itemId: number;
  serverName: string;
  price: number;
  dateUpdated: Date;
};

async function insertPriceHistory(rows: PriceHistoryRow[]) {
  if (rows.length === 0) {
    return;
  }

  /*
   * Un point d'historique Dofocus est immuable une fois relevé : pas de
   * logique "user wins", un simple insert idempotent (skipDuplicates)
   * suffit, contrairement à upsertCoefficients/upsertCraftPrices.
   */
  await prisma.itemPriceHistory.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

async function fetchAndStorePriceHistory(itemId: number, serverName: string) {
  const entries = await getItemPriceHistoryFromDofocus(itemId, serverName);

  const rows: PriceHistoryRow[] = entries.map((entry) => ({
    itemId,
    serverName,
    price: entry.price,
    dateUpdated: new Date(entry.dateUpdated),
  }));

  await insertPriceHistory(rows);

  return prisma.itemPriceHistory.findMany({
    where: {
      itemId,
      serverName,
    },
    orderBy: {
      dateUpdated: "asc",
    },
  });
}

export async function getItemPriceHistory(itemId: number, serverName: string) {
  const item = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    return null;
  }

  const existing = await prisma.itemPriceHistory.findMany({
    where: {
      itemId,
      serverName,
    },
    orderBy: {
      dateUpdated: "asc",
    },
  });

  if (existing.length > 0) {
    return existing;
  }

  try {
    return await fetchAndStorePriceHistory(itemId, serverName);
  } catch (error) {
    console.error(
      `Failed to fetch price history for item ${itemId} on ${serverName}:`,
      error,
    );

    return existing;
  }
}

/**
 * Rafraîchit uniquement les couples (item, serveur) déjà consultés au
 * moins une fois — même logique que refreshKnownCraftPrices : pas de
 * source bulk chez Dofocus, donc pas de balayage du catalogue entier.
 */
export async function refreshKnownPriceHistories() {
  const known = await prisma.itemPriceHistory.findMany({
    distinct: ["itemId", "serverName"],
    select: {
      itemId: true,
      serverName: true,
    },
  });

  console.log(
    `Refreshing price history for ${known.length} known item/server pair(s)...`,
  );

  let refreshed = 0;
  let failed = 0;

  for (const { itemId, serverName } of known) {
    try {
      await fetchAndStorePriceHistory(itemId, serverName);

      refreshed++;
    } catch (error) {
      failed++;
      console.error(
        `Failed to refresh price history for item ${itemId} on ${serverName}:`,
        error,
      );
    }

    await sleep(CRON_FETCH_DELAY_MS);
  }

  console.log(
    `Price history refresh completed: ${refreshed} refreshed, ${failed} failed`,
  );

  return { refreshed, failed };
}

// ============================================================
// Vue combinée pour la page coefficient du front
// ============================================================

export async function getItemMarketData(
  itemId: number,
  serverName: string,
): Promise<ItemMarketDataView | null> {
  const item = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    return null;
  }

  let marketData = await prisma.itemMarketData.findUnique({
    where: {
      itemId_serverName: {
        itemId,
        serverName,
      },
    },
  });

  if (!marketData || marketData.craftPrice === null) {
    const refreshed = await fetchAndStoreCraftPrice(itemId, serverName);

    marketData = refreshed ?? marketData;
  }

  return {
    id: item.id,
    name: item.name as unknown as ItemName,
    level: item.level,
    img: item.img,
    effects: item.effects,
    serverName,
    coefficient: marketData?.coefficient ?? null,
    coefficientUpdatedAt: marketData?.coefficientUpdatedAt ?? null,
    craftPrice: marketData?.craftPrice ?? null,
    craftPriceUpdatedAt: marketData?.craftPriceUpdatedAt ?? null,
  };
}

export async function submitItemMarketData(
  itemId: number,
  serverName: string,
  coefficient: number,
  craftPrice: number,
) {
  const item = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    return null;
  }

  const now = new Date();

  return prisma.itemMarketData.upsert({
    where: {
      itemId_serverName: {
        itemId,
        serverName,
      },
    },
    create: {
      itemId,
      serverName,
      coefficient,
      coefficientSource: "USER",
      coefficientUpdatedAt: now,
      craftPrice,
      craftPriceSource: "USER",
      craftPriceUpdatedAt: now,
    },
    update: {
      coefficient,
      coefficientSource: "USER",
      coefficientUpdatedAt: now,
      craftPrice,
      craftPriceSource: "USER",
      craftPriceUpdatedAt: now,
    },
  });
}

export type InterestingPagination = {
  page: number;
  limit: number;
};

export type InterestingResult = {
  coefficient: {
    coefficient: number;
    dateUpdated: string;
    itemId: number;
  };

  item: CachedItem;
};

export async function getInterestingItems(
  serverName: string,
  minCoefficient?: number,
  minLevel?: number,
  maxLevel?: number,
  typeIds?: number[],
  maxAgeDays: number = 7,
  pagination: InterestingPagination = {
    page: 1,
    limit: 30,
  },
) {
  console.time("interesting-total");

  const page = Math.max(1, pagination.page);

  const limit = Math.min(Math.max(1, pagination.limit), 100);

  /*
   * ============================
   * 1. Coefficients Dofocus
   * ============================
   */

  console.time("dofocus");

  const coefficients = await getCoefficientsByServer(serverName);

  console.timeEnd("dofocus");

  /*
   * ============================
   * 2. Filtrage coefficients
   * ============================
   */

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const now = Date.now();

  const outdatedCoefficients = coefficients.filter((coefficient) => {
    const updatedAt = new Date(coefficient.dateUpdated).getTime();

    const isOutdated = now - updatedAt >= maxAgeMs;

    const hasMinimumCoefficient =
      minCoefficient === undefined || coefficient.coefficient >= minCoefficient;

    return isOutdated && hasMinimumCoefficient;
  });

  /*
   * ============================
   * 3. Cache Items
   * ============================
   */

  const itemsCache = await getItemsCache();

  /*
   * ============================
   * 4. Association + filtres
   * ============================
   */

  const results: InterestingResult[] = outdatedCoefficients
    .map((coefficient) => {
      const item = itemsCache.get(coefficient.itemId);

      if (!item) {
        return null;
      }

      if (minLevel !== undefined && item.level < minLevel) {
        return null;
      }

      if (maxLevel !== undefined && item.level > maxLevel) {
        return null;
      }

      if (
        typeIds !== undefined &&
        typeIds.length > 0 &&
        !typeIds.includes(item.typeId ?? -1)
      ) {
        return null;
      }

      return {
        coefficient,
        item,
      };
    })
    .filter((result): result is InterestingResult => result !== null);

  /*
   * ============================
   * 5. Tri
   * ============================
   */

  results.sort((a, b) => b.coefficient.coefficient - a.coefficient.coefficient);

  /*
   * ============================
   * 6. Pagination
   * ============================
   */

  const total = results.length;

  const totalPages = Math.ceil(total / limit);

  const start = (page - 1) * limit;

  const paginatedResults = results.slice(start, start + limit);

  console.log("PAGINATION", {
    page,
    limit,
    total,
    totalPages,
    returned: paginatedResults.length,
  });

  console.timeEnd("interesting-total");

  return {
    data: paginatedResults,

    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}
