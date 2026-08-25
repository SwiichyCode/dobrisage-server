import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import {
  FeedbackType,
  SupportTicketStatus,
} from "../../generated/prisma/client.js";
import {
  addAdminMessage,
  addMyMessage,
  createTicket,
  deleteTicketAdmin,
  getMyTicket,
  getTicketAdmin,
  listAllTicketsAdmin,
  listMyTickets,
  updateTicketStatus,
} from "./support.service.js";

const VALID_TYPES: Record<string, FeedbackType> = {
  bug: FeedbackType.BUG,
  suggestion: FeedbackType.SUGGESTION,
};
const VALID_STATUSES: Record<string, SupportTicketStatus> = {
  open: SupportTicketStatus.OPEN,
  closed: SupportTicketStatus.CLOSED,
};
const SUBJECT_MAX_LENGTH = 200;
const MESSAGE_MAX_LENGTH = 2000;

function serializeTicket<T extends { type: FeedbackType; status: SupportTicketStatus }>(
  ticket: T,
) {
  return {
    ...ticket,
    type: ticket.type.toLowerCase(),
    status: ticket.status.toLowerCase(),
  };
}

function parseTicketId(raw: unknown) {
  const id = Number(raw);

  return Number.isInteger(id) ? id : null;
}

function parseMessage(raw: unknown) {
  if (
    typeof raw !== "string" ||
    raw.trim().length === 0 ||
    raw.length > MESSAGE_MAX_LENGTH
  ) {
    return null;
  }

  return raw;
}

export async function createTicketController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const { type, subject, message } = req.body;

  const ticketType = typeof type === "string" ? VALID_TYPES[type] : undefined;

  if (!ticketType) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing type" });
  }

  if (
    typeof subject !== "string" ||
    subject.trim().length === 0 ||
    subject.length > SUBJECT_MAX_LENGTH
  ) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing subject" });
  }

  const parsedMessage = parseMessage(message);

  if (parsedMessage === null) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing message" });
  }

  try {
    const ticket = await createTicket(
      userId!,
      ticketType,
      subject,
      parsedMessage,
    );

    return res.status(201).json({ success: true, data: serializeTicket(ticket) });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to create ticket" });
  }
}

export async function listMyTicketsController(req: Request, res: Response) {
  const { userId } = getAuth(req);

  try {
    const tickets = await listMyTickets(userId!);

    return res.json({
      success: true,
      count: tickets.length,
      data: tickets.map(serializeTicket),
    });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch tickets" });
  }
}

export async function getMyTicketController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  try {
    const ticket = await getMyTicket(userId!, id);

    if (!ticket) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.json({ success: true, data: serializeTicket(ticket) });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch ticket" });
  }
}

export async function postMyMessageController(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  const parsedMessage = parseMessage(req.body.message);

  if (parsedMessage === null) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing message" });
  }

  try {
    const message = await addMyMessage(userId!, id, parsedMessage);

    if (!message) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to post message" });
  }
}

export async function listAllTicketsAdminController(
  _req: Request,
  res: Response,
) {
  try {
    const tickets = await listAllTicketsAdmin();

    return res.json({
      success: true,
      count: tickets.length,
      data: tickets.map(serializeTicket),
    });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch tickets" });
  }
}

export async function getTicketAdminController(req: Request, res: Response) {
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  try {
    const ticket = await getTicketAdmin(id);

    if (!ticket) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.json({ success: true, data: serializeTicket(ticket) });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch ticket" });
  }
}

export async function postAdminMessageController(req: Request, res: Response) {
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  const { clerkUserId } = req.body;

  if (typeof clerkUserId !== "string" || clerkUserId.trim().length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing clerkUserId" });
  }

  const parsedMessage = parseMessage(req.body.message);

  if (parsedMessage === null) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing message" });
  }

  try {
    const message = await addAdminMessage(id, clerkUserId, parsedMessage);

    if (!message) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to post message" });
  }
}

export async function deleteTicketAdminController(req: Request, res: Response) {
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  try {
    const deleted = await deleteTicketAdmin(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to delete ticket" });
  }
}

export async function updateTicketStatusAdminController(
  req: Request,
  res: Response,
) {
  const id = parseTicketId(req.params.id);

  if (id === null) {
    return res.status(400).json({ success: false, error: "Invalid ticket id" });
  }

  const { status } = req.body;
  const ticketStatus =
    typeof status === "string" ? VALID_STATUSES[status] : undefined;

  if (!ticketStatus) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid or missing status" });
  }

  try {
    const ticket = await updateTicketStatus(id, ticketStatus);

    if (!ticket) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    return res.json({ success: true, data: serializeTicket(ticket) });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, error: "Failed to update ticket" });
  }
}
