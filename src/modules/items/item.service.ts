import prisma from "../../db/prisma.js";
import { getItemsPage } from "./item.api.js";

export async function importItems() {
  const limit = 100;
  let skip = 0;

  while (true) {
    const response = await getItemsPage(skip, limit);

    const items = response.data;

    console.log("FIRST ITEM FROM DOFUSDB", items[0]);

    console.log(
      `Fetched ${items.length} items (${response.skip}/${response.total})`,
    );

    if (items.length === 0) {
      break;
    }

    const itemData = items.map((item) => ({
      id: item.id,
      iconId: item.iconId,
      typeId: item.typeId,
      level: item.level,
      name: item.name.fr,
      description: item.description.fr,
      slug: item.slug.fr,
      img: item.img,
      effects: item.effects ?? [],
    }));

    console.time(`DB skip=${skip}`);

    await prisma.item.createMany({
      data: itemData,
      skipDuplicates: true,
    });

    skip = response.skip + items.length;
    console.log(`Progress: ${skip}/${response.total}`);
    if (skip >= response.total) {
      break;
    }
  }

  console.log(`Items import completed: ${skip} items`);
}

export async function syncItems() {
  const limit = 50;
  let skip = 0;

  while (true) {
    const response = await getItemsPage(skip, limit);
    const items = response.data;

    if (items.length === 0) {
      break;
    }

    const values = items.map((item) => ({
      id: item.id,
      iconId: item.iconId,
      typeId: item.typeId ?? null,
      level: item.level,
      name: item.name.fr,
      description: item.description.fr,
      slug: item.slug.fr,
      img: item.img,
      effects: JSON.stringify(item.effects ?? []),
    }));

    const placeholders = values
      .map((_, index) => {
        const base = index * 9;

        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::jsonb)`;
      })
      .join(",");

    const params = values.flatMap((item) => [
      item.id,
      item.iconId,
      item.typeId,
      item.level,
      item.name,
      item.description,
      item.slug,
      item.img,
      item.effects,
    ]);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Item" (
        "id",
        "iconId",
        "typeId",
        "level",
        "name",
        "description",
        "slug",
        "img",
        "effects"
      )
      VALUES ${placeholders}
      ON CONFLICT ("id")
      DO UPDATE SET
        "iconId" = EXCLUDED."iconId",
        "typeId" = EXCLUDED."typeId",
        "level" = EXCLUDED."level",
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "slug" = EXCLUDED."slug",
        "img" = EXCLUDED."img",
        "effects" = EXCLUDED."effects"
      `,
      ...params,
    );

    skip = response.skip + items.length;

    console.log(`Items synchronized: ${skip}/${response.total}`);

    if (skip >= response.total) {
      break;
    }
  }

  console.log("Items synchronization completed");

  return {
    items: skip,
  };
}

export async function getItemById(id: number) {
  return prisma.item.findUnique({
    where: {
      id,
    },
  });
}

export async function searchItems(
  query: string,
  limit: number = 20,
  serverName?: string,
) {
  const items = await prisma.item.findMany({
    where: {
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      level: true,
      img: true,
      typeId: true,
      marketData: {
        // Un serverName vide ne correspond jamais à un vrai serveur :
        // évite un `if` séparé quand serverName n'est pas fourni.
        where: {
          serverName: serverName ?? "",
        },
        select: {
          coefficient: true,
        },
        take: 1,
      },
    },
    orderBy: {
      level: "asc",
    },
    take: limit,
  });

  return items.map(({ marketData, ...item }) => ({
    ...item,
    coefficient: marketData[0]?.coefficient ?? null,
  }));
}
