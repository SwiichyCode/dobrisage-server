import { dofusDbApiClient } from "../../http/dofusdb-client.js";
import { DofusDbPaginatedResponse, Item } from "./item.types.js";

export const ITEM_TYPE_IDS = [
  22, 19, 8, 7, 6, 5, 4, 3, 2, 9, 1, 11, 82, 17, 10, 16, 271,
];

export async function getItemsPage(
  skip: number,
  limit: number,
): Promise<DofusDbPaginatedResponse<Item>> {
  const response = await dofusDbApiClient.get<DofusDbPaginatedResponse<Item>>(
    "/items",
    {
      params: {
        $sort: "-id",
        $limit: limit,
        $skip: skip,

        "typeId[$ne]": 203,
        "typeId[$in][]": ITEM_TYPE_IDS,

        "level[$gte]": 0,
        "level[$lte]": 200,

        lang: "fr",
      },
    },
  );

  return response.data;
}
