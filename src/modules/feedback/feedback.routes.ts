import { Router } from "express";
import {
  createFeedbackController,
  listFeedbackController,
} from "./feedback.controller.js";

const router = Router();

router.get("/", listFeedbackController);
router.post("/", createFeedbackController);

export default router;
