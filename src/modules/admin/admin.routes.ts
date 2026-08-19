import { Router } from "express";
import { seedAllController } from "./admin.controller.js";
import { importRateLimiter } from "../../middlewares/import-rate-limit.js";

const router = Router();

router.get("/seed", importRateLimiter, seedAllController);

export default router;
