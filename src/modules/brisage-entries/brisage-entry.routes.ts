import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  deleteBrisageEntryController,
  listBrisageEntriesController,
  updateBrisageEntryController,
} from "./brisage-entry.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listBrisageEntriesController);
router.delete("/:id", deleteBrisageEntryController);
router.patch("/:id", updateBrisageEntryController);

export default router;
