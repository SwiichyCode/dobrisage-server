import prisma from "../../db/prisma.js";

export async function createBrisageEntries(
  clerkUserId: string,
  itemId: number,
  serverName: string,
  batchId: string,
  entries: {
    coefficient: number;
    craftPrice: number;
    runeSlug: string | null;
    focusEnabled: boolean;
    revenue: number;
    profit: number;
  }[],
) {
  const favorite = await prisma.favoriteItem.findUnique({
    where: {
      clerkUserId_itemId_serverName: { clerkUserId, itemId, serverName },
    },
  });

  if (!favorite) {
    return null;
  }

  return prisma.brisageEntry.createManyAndReturn({
    data: entries.map((entry) => ({
      clerkUserId,
      itemId,
      serverName,
      batchId,
      ...entry,
    })),
  });
}

export async function listBrisageEntries(clerkUserId: string) {
  return prisma.brisageEntry.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteBrisageEntry(clerkUserId: string, id: number) {
  const { count } = await prisma.brisageEntry.deleteMany({
    where: { id, clerkUserId },
  });

  return count > 0;
}

export async function updateBrisageEntry(
  clerkUserId: string,
  id: number,
  data: {
    coefficient?: number;
    craftPrice?: number;
    revenue?: number;
    profit?: number;
  },
) {
  const { count } = await prisma.brisageEntry.updateMany({
    where: { id, clerkUserId },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.brisageEntry.findUnique({ where: { id } });
}
