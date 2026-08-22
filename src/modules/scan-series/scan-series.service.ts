import prisma from "../../db/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

export async function listScanSeries(clerkUserId: string) {
  return prisma.scanSeries.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createScanSeries(
  clerkUserId: string,
  title: string,
  totalSpent: number,
  items: Prisma.InputJsonValue,
) {
  return prisma.scanSeries.create({
    data: {
      clerkUserId,
      title,
      entries: { create: { totalSpent, items } },
    },
    include: { entries: true },
  });
}

export async function addScanEntry(
  clerkUserId: string,
  seriesId: number,
  totalSpent: number,
  items: Prisma.InputJsonValue,
) {
  const series = await prisma.scanSeries.findFirst({
    where: { id: seriesId, clerkUserId },
  });

  if (!series) {
    return null;
  }

  return prisma.scanEntry.create({
    data: { seriesId, totalSpent, items },
  });
}

export async function deleteScanSeries(clerkUserId: string, id: number) {
  const { count } = await prisma.scanSeries.deleteMany({
    where: { id, clerkUserId },
  });

  return count > 0;
}
