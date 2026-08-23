import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { createBrisageEntriesController } from "../brisage-entries/brisage-entry.controller.js";
import {
  addFavoriteController,
  getFavoriteHistoryController,
  importFavoriteHistoryController,
  listFavoritesController,
  removeFavoriteController,
  updateFavoriteController,
} from "./favorite.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listFavoritesController);
router.post("/", addFavoriteController);
router.patch("/:itemId", updateFavoriteController);
router.delete("/:itemId", removeFavoriteController);
router.get("/:itemId/history", getFavoriteHistoryController);
router.post("/:itemId/history/import", importFavoriteHistoryController);
router.post("/:itemId/brisage-entries", createBrisageEntriesController);

export default router;
