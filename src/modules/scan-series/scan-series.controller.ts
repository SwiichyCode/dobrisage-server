import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { Prisma } from "../../generated/prisma/client.js";
import {
  addScanEntry,
  createScanSeries,
  deleteScanSeries,
  listScanSeries,
} from "./scan-series.service.js";

function parseTotalSpent(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseItems(value: unknown): Prisma.InputJsonValue | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const valid = value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).itemName === "string" &&
      (item as Record<string, unknown>).itemName !== "",
  );

  return valid ? (value as Prisma.InputJsonValue) : null;
}

export async function listScanSeriesController(req: Request, res: Response) {
  const { userId } = getAuth(req);

  try {
    const series = await listScanSeries(userId!);

    return res.json({
      success: true,
      count: series.length,
      data: series,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch scan series",
    });
  }
}

export async function createScanSeriesController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);
  const { title, totalSpent, items } = req.body;

  if (typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid title",
    });
  }

  const parsedTotalSpent = parseTotalSpent(totalSpent);

  if (parsedTotalSpent === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid totalSpent",
    });
  }

  const parsedItems = parseItems(items);

  if (parsedItems === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid items",
    });
  }

  try {
    const series = await createScanSeries(
      userId!,
      title,
      parsedTotalSpent,
      parsedItems,
    );

    return res.status(201).json({
      success: true,
      data: series,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to create scan series",
    });
  }
}

export async function addScanEntryController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const seriesId = Number(req.params.id);
  const { totalSpent, items } = req.body;

  if (!Number.isInteger(seriesId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid scan series id",
    });
  }

  const parsedTotalSpent = parseTotalSpent(totalSpent);

  if (parsedTotalSpent === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid totalSpent",
    });
  }

  const parsedItems = parseItems(items);

  if (parsedItems === null) {
    return res.status(400).json({
      success: false,
      error: "Invalid items",
    });
  }

  try {
    const entry = await addScanEntry(
      userId!,
      seriesId,
      parsedTotalSpent,
      parsedItems,
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: "Scan series not found",
      });
    }

    return res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to add scan entry",
    });
  }
}

export async function deleteScanSeriesController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid scan series id",
    });
  }

  try {
    const removed = await deleteScanSeries(userId!, id);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Scan series not found",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete scan series",
    });
  }
}
