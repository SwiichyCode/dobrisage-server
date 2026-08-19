import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { Prisma } from "../../generated/prisma/client.js";
import {
  createTrade,
  deleteTrade,
  listTrades,
  updateTrade,
} from "./trade.service.js";

function parsePositiveInt(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export async function listTradesController(req: Request, res: Response) {
  const { userId } = getAuth(req);

  try {
    const trades = await listTrades(userId!);

    return res.json({
      success: true,
      count: trades.length,
      data: trades,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch trades",
    });
  }
}

export async function createTradeController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const { itemId, serverName, craftPrice, sellPrice } = req.body;

  const parsedItemId = Number(itemId);

  if (!Number.isInteger(parsedItemId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid itemId",
    });
  }

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid serverName",
    });
  }

  const parsedCraftPrice = parsePositiveInt(craftPrice);
  const parsedSellPrice = parsePositiveInt(sellPrice);

  if (parsedCraftPrice === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid craftPrice",
    });
  }

  if (parsedSellPrice === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid sellPrice",
    });
  }

  try {
    const trade = await createTrade(
      userId!,
      parsedItemId,
      serverName,
      parsedCraftPrice,
      parsedSellPrice,
    );

    return res.status(201).json({
      success: true,
      data: trade,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to create trade",
    });
  }
}

export async function updateTradeController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const { craftPrice, sellPrice, sold } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid trade id",
    });
  }

  const parsedCraftPrice = parsePositiveInt(craftPrice);
  const parsedSellPrice = parsePositiveInt(sellPrice);

  if (parsedCraftPrice === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid craftPrice",
    });
  }

  if (parsedSellPrice === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid sellPrice",
    });
  }

  if (sold !== undefined && typeof sold !== "boolean") {
    return res.status(400).json({
      success: false,
      error: "Invalid sold",
    });
  }

  if (
    parsedCraftPrice === undefined &&
    parsedSellPrice === undefined &&
    sold === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "No fields to update",
    });
  }

  try {
    const trade = await updateTrade(userId!, id, {
      craftPrice: parsedCraftPrice,
      sellPrice: parsedSellPrice,
      sold,
    });

    if (!trade) {
      return res.status(404).json({
        success: false,
        error: "Trade not found",
      });
    }

    return res.json({
      success: true,
      data: trade,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to update trade",
    });
  }
}

export async function deleteTradeController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid trade id",
    });
  }

  try {
    const removed = await deleteTrade(userId!, id);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Trade not found",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete trade",
    });
  }
}
