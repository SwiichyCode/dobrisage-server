import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
  createTicketController,
  deleteTicketAdminController,
  getMyTicketController,
  getTicketAdminController,
  listAllTicketsAdminController,
  listMyTicketsController,
  postAdminMessageController,
  postMyMessageController,
  updateTicketStatusAdminController,
} from "./support.controller.js";

const router = Router();

// Admin: no backend auth of its own — protected only by Next.js /admin role
// gate (see docs/BACKEND_SUPPORT_TICKETS.md). Registered before the user
// routes below so "/admin..." never falls through to "/:id".
router.get("/admin", listAllTicketsAdminController);
router.get("/admin/:id", getTicketAdminController);
router.post("/admin/:id/messages", postAdminMessageController);
router.patch("/admin/:id", updateTicketStatusAdminController);
router.delete("/admin/:id", deleteTicketAdminController);

router.use(requireAuth);

router.post("/", createTicketController);
router.get("/", listMyTicketsController);
router.get("/:id", getMyTicketController);
router.post("/:id/messages", postMyMessageController);

export default router;
