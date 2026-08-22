import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  deleteUserRunePriceController,
  listUserRunePricesController,
  listUserRuneServersController,
  upsertUserRunePriceController,
} from "./user-rune-price.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listUserRunePricesController);
router.get("/servers", listUserRuneServersController);
router.put("/:id", upsertUserRunePriceController);
router.delete("/:id", deleteUserRunePriceController);

export default router;
