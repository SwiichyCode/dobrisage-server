import prisma from "../../db/prisma.js";
import type { ItemName } from "./item.types.js";

export type CachedItem = {
  id: number;
  name: ItemName;
  level: number;
  img: string;
  typeId: number | null;
};

let itemsCache: Map<number, CachedItem> | null = null;

let cacheUpdatedAt = 0;

const CACHE_TTL = 60 * 60 * 1000; // 1 heure

let loadingPromise: Promise<Map<number, CachedItem>> | null = null;

async function loadItems(): Promise<Map<number, CachedItem>> {
  console.time("item-cache-load");

  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      img: true,
      typeId: true,
    },
  });

  const cache = new Map<number, CachedItem>();

  for (const item of items) {
    cache.set(item.id, { ...item, name: item.name as unknown as ItemName });
  }

  console.timeEnd("item-cache-load");

  console.log(`Item cache UPDATED: ${cache.size} items`);

  return cache;
}

export async function getItemsCache(): Promise<Map<number, CachedItem>> {
  const now = Date.now();

  // Cache valide
  if (itemsCache && now - cacheUpdatedAt < CACHE_TTL) {
    return itemsCache;
  }

  // Évite plusieurs chargements simultanés
  if (!loadingPromise) {
    loadingPromise = loadItems();
  }

  try {
    const cache = await loadingPromise;

    itemsCache = cache;
    cacheUpdatedAt = Date.now();

    return cache;
  } finally {
    loadingPromise = null;
  }
}

export function invalidateItemsCache() {
  itemsCache = null;
  cacheUpdatedAt = 0;

  console.log("Item cache INVALIDATED");
}
