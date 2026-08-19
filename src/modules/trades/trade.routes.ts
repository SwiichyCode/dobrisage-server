import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  createTradeController,
  deleteTradeController,
  listTradesController,
  updateTradeController,
} from "./trade.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listTradesController);
router.post("/", createTradeController);
router.patch("/:id", updateTradeController);
router.delete("/:id", deleteTradeController);

export default router;
