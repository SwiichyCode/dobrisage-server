import { Request, Response } from "express";
import {
  getInterestingItems,
  getItemMarketData,
  getItemPriceHistory,
  importCoefficients,
  refreshKnownCraftPrices,
  refreshKnownPriceHistories,
  submitItemMarketData,
} from "./coefficient.service.js";

export async function importCoefficientsController(_req: Request, res: Response) {
  try {
    const result = await importCoefficients();

    return res.json({
      success: true,
      imported: result,
    });
  } catch (error) {
    console.error("Coefficient import failed:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshCraftPricesController(_req: Request, res: Response) {
  try {
    const result = await refreshKnownCraftPrices();

    return res.json({
      success: true,
      refreshed: result,
    });
  } catch (error) {
    console.error("Craft price refresh failed:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshPriceHistoryController(_req: Request, res: Response) {
  try {
    const result = await refreshKnownPriceHistories();

    return res.json({
      success: true,
      refreshed: result,
    });
  } catch (error) {
    console.error("Price history refresh failed:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getItemPriceHistoryController(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);

  if (Number.isNaN(itemId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid item id",
    });
  }

  const { serverName } = req.params;

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const data = await getItemPriceHistory(itemId, serverName);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch item price history",
    });
  }
}

export async function getItemMarketDataController(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);

  if (Number.isNaN(itemId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid item id",
    });
  }

  const { serverName } = req.params;

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  try {
    const data = await getItemMarketData(itemId, serverName);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch item market data",
    });
  }
}

export async function submitItemMarketDataController(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);

  if (Number.isNaN(itemId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid item id",
    });
  }

  const { serverName } = req.params;

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid serverName",
    });
  }

  const coefficient = Number(req.body.coefficient);
  const craftPrice = Number(req.body.craftPrice);

  if (!Number.isFinite(coefficient) || coefficient < 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid coefficient",
    });
  }

  if (!Number.isFinite(craftPrice) || !Number.isInteger(craftPrice) || craftPrice < 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid craftPrice",
    });
  }

  try {
    const result = await submitItemMarketData(
      itemId,
      serverName,
      coefficient,
      craftPrice,
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
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
      error: "Failed to submit item market data",
    });
  }
}

export async function getInterestingItemsController(
  req: Request,
  res: Response,
) {
  try {
    const { serverName } = req.params;

    const {
      minCoefficient,
      minLevel,
      maxLevel,
      typeId,
      maxAgeDays,
      page,
      limit,
    } = req.query;

    console.log("QUERY", req.query);

    if (typeof serverName !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid server name",
      });
    }

    // -------------------------
    // Coefficient minimum
    // -------------------------

    const coefficient =
      minCoefficient !== undefined ? Number(minCoefficient) : undefined;

    if (coefficient !== undefined && Number.isNaN(coefficient)) {
      return res.status(400).json({
        success: false,
        error: "Invalid minCoefficient",
      });
    }

    // -------------------------
    // Niveau minimum
    // -------------------------

    const minimumLevel = minLevel !== undefined ? Number(minLevel) : undefined;

    if (minimumLevel !== undefined && Number.isNaN(minimumLevel)) {
      return res.status(400).json({
        success: false,
        error: "Invalid minLevel",
      });
    }

    // -------------------------
    // Niveau maximum
    // -------------------------

    const maximumLevel = maxLevel !== undefined ? Number(maxLevel) : undefined;

    if (maximumLevel !== undefined && Number.isNaN(maximumLevel)) {
      return res.status(400).json({
        success: false,
        error: "Invalid maxLevel",
      });
    }

    // -------------------------
    // Age du coefficient
    // -------------------------

    const maximumAgeDays = maxAgeDays !== undefined ? Number(maxAgeDays) : 7;

    if (Number.isNaN(maximumAgeDays) || maximumAgeDays <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid maxAgeDays",
      });
    }

    // -------------------------
    // Types d'équipement
    // -------------------------

    let typeIds: number[] | undefined;

    if (typeId !== undefined) {
      const values = Array.isArray(typeId) ? typeId : String(typeId).split(",");

      typeIds = values.map(Number);

      if (typeIds.some(Number.isNaN)) {
        return res.status(400).json({
          success: false,
          error: "Invalid typeId",
        });
      }
    }

    // -------------------------
    // Pagination
    // -------------------------

    const pageNumber = page !== undefined ? Number(page) : 1;

    const limitNumber = limit !== undefined ? Number(limit) : 30;

    if (
      Number.isNaN(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(pageNumber)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid page",
      });
    }

    if (
      Number.isNaN(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 100 ||
      !Number.isInteger(limitNumber)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid limit",
      });
    }

    console.log({
      serverName,
      coefficient,
      minimumLevel,
      maximumLevel,
      typeIds,
      maximumAgeDays,
      page: pageNumber,
      limit: limitNumber,
    });

    // -------------------------
    // Recherche
    // -------------------------

    const result = await getInterestingItems(
      serverName,
      coefficient,
      minimumLevel,
      maximumLevel,
      typeIds,
      maximumAgeDays,
      {
        page: pageNumber,
        limit: limitNumber,
      },
    );

    // -------------------------
    // Réponse
    // -------------------------

    return res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch interesting items",
    });
  }
}
