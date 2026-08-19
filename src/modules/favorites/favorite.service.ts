import prisma from "../../db/prisma.js";

export async function listFavorites(clerkUserId: string) {
  const favorites = await prisma.favoriteItem.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    include: { item: true },
  });

  if (favorites.length === 0) {
    return [];
  }

  const marketData = await prisma.itemMarketData.findMany({
    where: {
      OR: favorites.map(({ itemId, serverName }) => ({ itemId, serverName })),
    },
  });

  const marketDataByKey = new Map(
    marketData.map((entry) => [`${entry.itemId}:${entry.serverName}`, entry]),
  );

  return favorites.map(({ item, itemId, serverName, createdAt }) => {
    const market = marketDataByKey.get(`${itemId}:${serverName}`);

    return {
      item,
      serverName,
      createdAt,
      coefficient: market?.coefficient ?? null,
      craftPrice: market?.craftPrice ?? null,
    };
  });
}

export async function addFavorite(
  clerkUserId: string,
  itemId: number,
  serverName: string,
) {
  return prisma.favoriteItem.upsert({
    where: {
      clerkUserId_itemId_serverName: { clerkUserId, itemId, serverName },
    },
    create: { clerkUserId, itemId, serverName },
    update: {},
  });
}

export async function removeFavorite(
  clerkUserId: string,
  itemId: number,
  serverName: string,
) {
  const { count } = await prisma.favoriteItem.deleteMany({
    where: { clerkUserId, itemId, serverName },
  });

  return count > 0;
}
