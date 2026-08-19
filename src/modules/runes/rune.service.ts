import { getRunes } from "./rune.api.js";
import prisma from "../../db/prisma.js";

type RuneRecord = {
  id: number;
  externalId: string;
  name: string;
  characteristicId: number | null;
  characteristic: string;
  imageUrl: string;
  value: number;
  weight: number;
};

type RunePriceRecord = {
  runeId: number;
  serverName: string;
  price: number;
  dateUpdated: Date;
};

/**
 * Un prix saisi par un utilisateur reste prioritaire sur l'import Dofocus
 * pendant cette durée : le cron ne l'écrase pas tant qu'il est "récent".
 */
const USER_PRICE_PROTECTION_DAYS = 3;

async function upsertRunes(runes: RuneRecord[]) {
  if (runes.length === 0) {
    return;
  }

  const placeholders = runes
    .map((_, index) => {
      const base = index * 8;

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(",");

  const params = runes.flatMap((rune) => [
    rune.id,
    rune.externalId,
    rune.name,
    rune.characteristicId,
    rune.characteristic,
    rune.imageUrl,
    rune.value,
    rune.weight,
  ]);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Rune" (
      "id",
      "externalId",
      "name",
      "characteristicId",
      "characteristic",
      "imageUrl",
      "value",
      "weight"
    )
    VALUES ${placeholders}
    ON CONFLICT ("id")
    DO UPDATE SET
      "externalId" = EXCLUDED."externalId",
      "name" = EXCLUDED."name",
      "characteristicId" = EXCLUDED."characteristicId",
      "characteristic" = EXCLUDED."characteristic",
      "imageUrl" = EXCLUDED."imageUrl",
      "value" = EXCLUDED."value",
      "weight" = EXCLUDED."weight"
    `,
    ...params,
  );
}

async function upsertRunePrices(prices: RunePriceRecord[]) {
  if (prices.length === 0) {
    return;
  }

  const placeholders = prices
    .map((_, index) => {
      const base = index * 4;

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'DOFOCUS'::"PriceSource")`;
    })
    .join(",");

  const params = prices.flatMap((price) => [
    price.runeId,
    price.serverName,
    price.price,
    price.dateUpdated,
  ]);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "RunePrice" AS rp (
      "runeId",
      "serverName",
      "price",
      "dateUpdated",
      "source"
    )
    VALUES ${placeholders}
    ON CONFLICT ("runeId", "serverName")
    DO UPDATE SET
      "price" = EXCLUDED."price",
      "dateUpdated" = EXCLUDED."dateUpdated",
      "source" = EXCLUDED."source"
    WHERE NOT (
      rp."source" = 'USER'
      AND rp."dateUpdated" > now() - interval '${USER_PRICE_PROTECTION_DAYS} days'
    )
    `,
    ...params,
  );
}

export async function submitRunePrice(
  runeId: number,
  serverName: string,
  price: number,
) {
  const rune = await prisma.rune.findUnique({
    where: {
      id: runeId,
    },
  });

  if (!rune) {
    return null;
  }

  return prisma.runePrice.upsert({
    where: {
      runeId_serverName: {
        runeId,
        serverName,
      },
    },
    create: {
      runeId,
      serverName,
      price,
      dateUpdated: new Date(),
      source: "USER",
    },
    update: {
      price,
      dateUpdated: new Date(),
      source: "USER",
    },
  });
}

export async function listRunes(serverName?: string) {
  const runes = await prisma.rune.findMany({
    orderBy: {
      name: "asc",
    },
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
        select: {
          serverName: true,
          price: true,
          dateUpdated: true,
        },
        orderBy: {
          serverName: "asc",
        },
      },
    },
  });

  if (serverName) {
    return runes.filter((rune) => rune.prices.length > 0);
  }

  return runes;
}

export async function importRunes() {
  console.log("Fetching runes from Dofocus...");

  const runes = await getRunes();

  console.log(`${runes.length} runes received`);

  const runeData: RuneRecord[] = runes.map((rune) => ({
    id: rune.id,
    externalId: rune._id,

    name: rune.name.fr,

    characteristicId: rune.characteristicId,
    characteristic: rune.characteristicName.fr,

    imageUrl: rune.imageUrl,
    value: rune.value,
    weight: rune.weight,
  }));

  const priceData: RunePriceRecord[] = runes.flatMap((rune) =>
    rune.latestPrices.map((price) => ({
      runeId: rune.id,
      serverName: price.serverName,
      price: price.price,
      dateUpdated: new Date(price.dateUpdated),
    })),
  );

  console.log(`Upserting ${runeData.length} runes...`);

  await upsertRunes(runeData);

  console.log(`Upserting ${priceData.length} prices...`);

  await upsertRunePrices(priceData);

  console.log("Import completed");

  return {
    runes: runeData.length,
    prices: priceData.length,
  };
}
