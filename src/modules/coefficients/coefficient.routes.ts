import { Router } from "express";
import {
  getInterestingItemsController,
  getItemMarketDataController,
  importCoefficientsController,
  refreshCraftPricesController,
  submitItemMarketDataController,
} from "./coefficient.controller.js";
import { importRateLimiter } from "../../middlewares/import-rate-limit.js";

const router = Router();

router.get("/interesting/:serverName", getInterestingItemsController);
router.get("/import", importRateLimiter, importCoefficientsController);
router.get("/craft-prices/refresh", importRateLimiter, refreshCraftPricesController);
router.get("/:itemId/:serverName", getItemMarketDataController);
router.put("/:itemId/:serverName", submitItemMarketDataController);

export default router;
