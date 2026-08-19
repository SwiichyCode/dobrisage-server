import prisma from "../../db/prisma.js";

export async function listTrades(clerkUserId: string) {
  return prisma.trade.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    include: { item: true },
  });
}

export async function createTrade(
  clerkUserId: string,
  itemId: number,
  serverName: string,
  craftPrice?: number,
  sellPrice?: number,
) {
  return prisma.trade.create({
    data: { clerkUserId, itemId, serverName, craftPrice, sellPrice },
  });
}

export async function updateTrade(
  clerkUserId: string,
  id: number,
  data: { craftPrice?: number; sellPrice?: number; sold?: boolean },
) {
  const existing = await prisma.trade.findFirst({
    where: { id, clerkUserId },
  });

  if (!existing) {
    return null;
  }

  return prisma.trade.update({
    where: { id },
    data,
  });
}

export async function deleteTrade(clerkUserId: string, id: number) {
  const { count } = await prisma.trade.deleteMany({
    where: { id, clerkUserId },
  });

  return count > 0;
}
