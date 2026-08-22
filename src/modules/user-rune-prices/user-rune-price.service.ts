import prisma from "../../db/prisma.js";

export async function listUserRunePrices(clerkUserId: string, serverName?: string) {
  const runes = await prisma.rune.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      characteristicId: true,
      characteristic: true,
      imageUrl: true,
      value: true,
      weight: true,
      prices: {
        where: serverName ? { serverName } : undefined,
        select: { serverName: true, price: true, dateUpdated: true },
        orderBy: { serverName: "asc" },
      },
      userPrices: {
        where: serverName ? { clerkUserId, serverName } : { clerkUserId },
        select: { serverName: true, price: true, updatedAt: true },
        orderBy: { serverName: "asc" },
      },
    },
  });

  return runes.map(({ prices, userPrices, ...rune }) => ({
    ...rune,
    communityPrices: prices,
    personalPrices: userPrices,
  }));
}

export async function listUserRuneServers(clerkUserId: string) {
  const rows = await prisma.userRunePrice.findMany({
    where: { clerkUserId },
    distinct: ["serverName"],
    select: { serverName: true },
    orderBy: { serverName: "asc" },
  });

  return rows.map((row) => row.serverName);
}

export async function upsertUserRunePrice(
  clerkUserId: string,
  runeId: number,
  serverName: string,
  price: number,
) {
  const rune = await prisma.rune.findUnique({ where: { id: runeId } });

  if (!rune) {
    return null;
  }

  return prisma.userRunePrice.upsert({
    where: {
      clerkUserId_runeId_serverName: { clerkUserId, runeId, serverName },
    },
    create: { clerkUserId, runeId, serverName, price },
    update: { price },
  });
}

export async function deleteUserRunePrice(
  clerkUserId: string,
  runeId: number,
  serverName: string,
) {
  const { count } = await prisma.userRunePrice.deleteMany({
    where: { clerkUserId, runeId, serverName },
  });

  return count > 0;
}
