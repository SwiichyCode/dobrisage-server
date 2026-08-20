import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  addFavoriteController,
  getFavoriteHistoryController,
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

export default router;
