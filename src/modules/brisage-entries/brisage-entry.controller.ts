import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import {
  createBrisageEntries,
  deleteBrisageEntry,
  listBrisageEntries,
  updateBrisageEntry,
} from "./brisage-entry.service.js";

type ParsedEntry = {
  coefficient: number;
  craftPrice: number;
  runeSlug: string | null;
  focusEnabled: boolean;
  revenue: number;
  profit: number;
};

function parseEntries(entries: unknown): ParsedEntry[] | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const parsed: ParsedEntry[] = [];

  for (const entry of entries) {
    const { coefficient, craftPrice, runeSlug, focusEnabled, revenue, profit } =
      entry ?? {};

    if (
      typeof coefficient !== "number" ||
      typeof craftPrice !== "number" ||
      typeof revenue !== "number" ||
      typeof profit !== "number"
    ) {
      return null;
    }

    if (runeSlug !== null && runeSlug !== undefined && typeof runeSlug !== "string") {
      return null;
    }

    if (focusEnabled !== undefined && typeof focusEnabled !== "boolean") {
      return null;
    }

    parsed.push({
      coefficient,
      craftPrice,
      runeSlug: runeSlug ?? null,
      focusEnabled: focusEnabled ?? true,
      revenue,
      profit,
    });
  }

  return parsed;
}

export async function createBrisageEntriesController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);
  const itemId = Number(req.params.itemId);
  const { serverName } = req.query;
  const { batchId, entries } = req.body;

  if (!Number.isInteger(itemId)) {
    return res.status(400).json({ success: false, error: "Invalid itemId" });
  }

  if (typeof serverName !== "string" || serverName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid serverName",
    });
  }

  if (typeof batchId !== "string" || batchId.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid batchId",
    });
  }

  const parsedEntries = parseEntries(entries);

  if (parsedEntries === null) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid entries",
    });
  }

  try {
    const created = await createBrisageEntries(
      userId!,
      itemId,
      serverName,
      batchId,
      parsedEntries,
    );

    if (created === null) {
      return res.status(404).json({
        success: false,
        error: "Favorite not found",
      });
    }

    return res.status(201).json({
      success: true,
      created: created.length,
      data: created,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to create brisage entries",
    });
  }
}

export async function listBrisageEntriesController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);

  try {
    const entries = await listBrisageEntries(userId!);

    return res.json({
      success: true,
      count: entries.length,
      data: entries,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch brisage entries",
    });
  }
}

export async function deleteBrisageEntryController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, error: "Invalid id" });
  }

  try {
    const removed = await deleteBrisageEntry(userId!, id);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Brisage entry not found",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete brisage entry",
    });
  }
}

export async function updateBrisageEntryController(
  req: Request,
  res: Response,
) {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, error: "Invalid id" });
  }

  const { coefficient, craftPrice, revenue, profit } = req.body ?? {};
  const data: {
    coefficient?: number;
    craftPrice?: number;
    revenue?: number;
    profit?: number;
  } = {};

  for (const [key, value] of Object.entries({
    coefficient,
    craftPrice,
    revenue,
    profit,
  })) {
    if (value === undefined) continue;
    if (typeof value !== "number") {
      return res.status(400).json({
        success: false,
        error: `Invalid ${key}`,
      });
    }
    (data as Record<string, number>)[key] = value;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid fields to update",
    });
  }

  try {
    const updated = await updateBrisageEntry(userId!, id, data);

    if (updated === null) {
      return res.status(404).json({
        success: false,
        error: "Brisage entry not found",
      });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to update brisage entry",
    });
  }
}
