import { Router } from "express";
import {
  importRunesController,
  listRunesController,
  submitRunePriceController,
} from "./rune.controller.js";
import { importRateLimiter } from "../../middlewares/import-rate-limit.js";

const router = Router();

router.get("/", listRunesController);
router.get("/import", importRateLimiter, importRunesController);
router.put("/:id/price", submitRunePriceController);

export default router;
