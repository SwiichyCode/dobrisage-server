import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  addScanEntryController,
  createScanSeriesController,
  deleteScanSeriesController,
  listScanSeriesController,
} from "./scan-series.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listScanSeriesController);
router.post("/", createScanSeriesController);
router.post("/:id/entries", addScanEntryController);
router.delete("/:id", deleteScanSeriesController);

export default router;
