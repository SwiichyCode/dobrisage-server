import { Request, Response } from "express";
import { seedAll } from "./admin.service.js";

export async function seedAllController(_req: Request, res: Response) {
  try {
    const result = await seedAll();

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Seed-all failed:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
