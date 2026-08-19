import { Request, Response } from "express";
import { importRunes, listRunes, submitRunePrice } from "./rune.service.js";

export async function listRunesController(req: Request, res: Response) {
  const { serverName } = req.query;

  if (serverName !== undefined && typeof serverName !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const runes = await listRunes(serverName);

    return res.json({
      success: true,
      count: runes.length,
      data: runes,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch runes",
    });
  }
}

export async function submitRunePriceController(req: Request, res: Response) {
  const runeId = Number(req.params.id);

  if (Number.isNaN(runeId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid rune id",
    });
  }

  const { serverName, price } = req.body;

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  const priceValue = Number(price);

  if (!Number.isFinite(priceValue) || !Number.isInteger(priceValue) || priceValue <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid price",
    });
  }

  try {
    const result = await submitRunePrice(runeId, serverName, priceValue);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Rune not found",
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to submit rune price",
    });
  }
}

export async function importRunesController(_req: Request, res: Response) {
  try {
    const result = await importRunes();

    res.json({
      success: true,
      imported: result,
    });
  } catch (error) {
    console.error("Rune import failed:", error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
