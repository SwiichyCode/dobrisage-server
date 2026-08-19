import { Request, Response } from "express";
import { getItemById, searchItems, syncItems } from "./item.service.js";

export async function searchItemsController(req: Request, res: Response) {
  const { q } = req.query;

  if (typeof q !== "string" || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid search query 'q'",
    });
  }

  const limitParam = req.query.limit;
  const limit = limitParam !== undefined ? Number(limitParam) : 20;

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({
      success: false,
      error: "Invalid limit",
    });
  }

  const { serverName } = req.query;

  if (serverName !== undefined && typeof serverName !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const items = await searchItems(q.trim(), limit, serverName);

    return res.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to search items",
    });
  }
}

export async function getItem(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid item id",
    });
  }

  const item = await getItemById(id);

  if (!item) {
    return res.status(404).json({
      success: false,
      error: "Item not found",
    });
  }

  return res.json({
    success: true,
    data: item,
  });
}

export async function importItemsController(_req: Request, res: Response) {
  try {
    await syncItems();

    return res.json({
      success: true,
      message: "Items import completed",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to import items",
    });
  }
}
