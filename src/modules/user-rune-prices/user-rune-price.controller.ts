import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import {
  deleteUserRunePrice,
  listUserRunePrices,
  listUserRuneServers,
  upsertUserRunePrice,
} from "./user-rune-price.service.js";

function parseServerName(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

export async function listUserRunePricesController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const serverName = parseServerName(req.query.serverName);

  if (serverName === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const runes = await listUserRunePrices(userId!, serverName);

    return res.json({
      success: true,
      count: runes.length,
      data: runes,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch rune prices",
    });
  }
}

export async function listUserRuneServersController(req: Request, res: Response) {
  const { userId } = getAuth(req);

  try {
    const servers = await listUserRuneServers(userId!);

    return res.json({
      success: true,
      count: servers.length,
      data: servers,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch servers",
    });
  }
}

export async function upsertUserRunePriceController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const runeId = Number(req.params.id);

  if (!Number.isInteger(runeId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid rune id",
    });
  }

  const serverName = parseServerName(req.body.serverName);

  if (!serverName) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  const price = Number(req.body.price);

  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid price",
    });
  }

  try {
    const result = await upsertUserRunePrice(userId!, runeId, serverName, price);

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
      error: "Failed to save rune price",
    });
  }
}

export async function deleteUserRunePriceController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const runeId = Number(req.params.id);

  if (!Number.isInteger(runeId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid rune id",
    });
  }

  const serverName = parseServerName(req.query.serverName);

  if (!serverName) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const removed = await deleteUserRunePrice(userId!, runeId, serverName);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Rune price not found",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete rune price",
    });
  }
}
