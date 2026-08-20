import prisma from "../../db/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

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

  return favorites.map(
    ({
      item,
      itemId,
      serverName,
      createdAt,
      updatedAt,
      personalCoefficient,
      personalCoefficientUpdatedAt,
      personalCraftPrice,
    }) => {
      const market = marketDataByKey.get(`${itemId}:${serverName}`);

      return {
        item,
        serverName,
        createdAt,
        updatedAt,
        coefficient: market?.coefficient ?? null,
        craftPrice: market?.craftPrice ?? null,
        personalCoefficient,
        personalCoefficientUpdatedAt,
        personalCraftPrice,
      };
    },
  );
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

export async function updateFavorite(
  clerkUserId: string,
  itemId: number,
  serverName: string,
  data: { personalCoefficient?: number | null; personalCraftPrice?: number | null },
) {
  const { personalCoefficient, ...rest } = data;

  try {
    const existing = await prisma.favoriteItem.findUnique({
      where: {
        clerkUserId_itemId_serverName: { clerkUserId, itemId, serverName },
      },
    });

    if (!existing) {
      return null;
    }

    const now = new Date();
    const historyCoefficient =
      personalCoefficient !== undefined &&
      personalCoefficient !== null &&
      personalCoefficient !== existing.personalCoefficient
        ? personalCoefficient
        : null;

    const updated = await prisma.favoriteItem.update({
      where: {
        clerkUserId_itemId_serverName: { clerkUserId, itemId, serverName },
      },
      data: {
        ...rest,
        ...(personalCoefficient !== undefined && {
          personalCoefficient,
          personalCoefficientUpdatedAt:
            personalCoefficient === null ? null : now,
        }),
      },
    });

    if (historyCoefficient !== null) {
      await prisma.personalCoefficientHistory.create({
        data: {
          clerkUserId,
          itemId,
          serverName,
          coefficient: historyCoefficient,
          dateUpdated: now,
        },
      });
    }

    return updated;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }

    throw error;
  }
}

export async function removeFavorite(
  clerkUserId: string,
  itemId: number,
  serverName: string,
) {
  const [{ count }] = await prisma.$transaction([
    prisma.favoriteItem.deleteMany({ where: { clerkUserId, itemId, serverName } }),
    prisma.personalCoefficientHistory.deleteMany({
      where: { clerkUserId, itemId, serverName },
    }),
  ]);

  return count > 0;
}

export async function getPersonalCoefficientHistory(
  clerkUserId: string,
  itemId: number,
  serverName: string,
) {
  const favorite = await prisma.favoriteItem.findUnique({
    where: {
      clerkUserId_itemId_serverName: { clerkUserId, itemId, serverName },
    },
  });

  if (!favorite) {
    return null;
  }

  return prisma.personalCoefficientHistory.findMany({
    where: { clerkUserId, itemId, serverName },
    orderBy: { dateUpdated: "asc" },
    select: { coefficient: true, dateUpdated: true },
  });
}
