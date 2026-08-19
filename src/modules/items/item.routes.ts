import { Router } from "express";
import {
  getItem,
  importItemsController,
  searchItemsController,
} from "./item.controller.js";
import { importRateLimiter } from "../../middlewares/import-rate-limit.js";

const router = Router();

router.get("/", searchItemsController);
router.post("/import", importRateLimiter, importItemsController);
router.get("/:id", getItem);

export default router;
