import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import runeRoutes from "./modules/runes/rune.routes.js";
import itemRoutes from "./modules/items/item.routes.js";
import coefficientRoutes from "./modules/coefficients/coefficient.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import favoriteRoutes from "./modules/favorites/favorite.routes.js";
import brisageEntryRoutes from "./modules/brisage-entries/brisage-entry.routes.js";
import tradeRoutes from "./modules/trades/trade.routes.js";
import userRunePriceRoutes from "./modules/user-rune-prices/user-rune-price.routes.js";
import scanSeriesRoutes from "./modules/scan-series/scan-series.routes.js";
import supportRoutes from "./modules/support/support.routes.js";
import prisma from "./db/prisma.js";
import { startRuneImportScheduler } from "./modules/runes/rune.scheduler.js";
import {
  startCoefficientImportScheduler,
  startCraftPriceRefreshScheduler,
  startPriceHistoryRefreshScheduler,
} from "./modules/coefficients/coefficient.scheduler.js";

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "DOFOCUS_API_URL",
  "DOFUSDB_API_URL",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvVars.join(", ")}`,
  );

  process.exit(1);
}

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3001";

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/runes", runeRoutes);
app.use("/items", itemRoutes);
app.use("/coefficients", coefficientRoutes);
app.use("/admin", adminRoutes);
app.use("/favorites", clerkMiddleware(), favoriteRoutes);
app.use("/brisage-entries", clerkMiddleware(), brisageEntryRoutes);
app.use("/trades", clerkMiddleware(), tradeRoutes);
app.use("/rune-prices", clerkMiddleware(), userRunePriceRoutes);
app.use("/scan-series", clerkMiddleware(), scanSeriesRoutes);
app.use("/support/tickets", clerkMiddleware(), supportRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not found",
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);

  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const runeImportInterval = startRuneImportScheduler();
const coefficientImportInterval = startCoefficientImportScheduler();
const craftPriceRefreshInterval = startCraftPriceRefreshScheduler();
const priceHistoryRefreshInterval = startPriceHistoryRefreshScheduler();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);

  clearInterval(runeImportInterval);
  clearInterval(coefficientImportInterval);
  clearInterval(craftPriceRefreshInterval);
  clearInterval(priceHistoryRefreshInterval);

  server.close(() => {
    console.log("HTTP server closed");
  });

  await prisma.$disconnect();

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
