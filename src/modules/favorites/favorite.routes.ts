import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  addFavoriteController,
  listFavoritesController,
  removeFavoriteController,
} from "./favorite.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listFavoritesController);
router.post("/", addFavoriteController);
router.delete("/:itemId", removeFavoriteController);

export default router;
