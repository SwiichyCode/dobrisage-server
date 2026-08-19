import { dofocusApiClient } from "../../http/dofocus-client.js";
import type { Rune } from "./rune.types.js";

const DOFOCUS_RUNE_REFERER = process.env.DOFOCUS_RUNE_REFERER;

export async function getRunes(): Promise<Rune[]> {
  const response = await dofocusApiClient.get<Rune[]>("/runes", {
    headers: {
      Referer: DOFOCUS_RUNE_REFERER,
    },
  });

  return response.data;
}
