import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { Prisma } from "../../generated/prisma/client.js";
import { addFavorite, listFavorites, removeFavorite } from "./favorite.service.js";

export async function listFavoritesController(req: Request, res: Response) {
  const { userId } = getAuth(req);

  try {
    const favorites = await listFavorites(userId!);

    return res.json({
      success: true,
      count: favorites.length,
      data: favorites,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch favorites",
    });
  }
}

export async function addFavoriteController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const { itemId, serverName } = req.body;

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

  try {
    const favorite = await addFavorite(userId!, parsedItemId, serverName);

    return res.status(201).json({
      success: true,
      data: favorite,
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
      error: "Failed to add favorite",
    });
  }
}

export async function removeFavoriteController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const itemId = Number(req.params.itemId);
  const { serverName } = req.query;

  if (Number.isNaN(itemId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid item id",
    });
  }

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid serverName",
    });
  }

  try {
    const removed = await removeFavorite(userId!, itemId, serverName);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Favorite not found",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to remove favorite",
    });
  }
}
