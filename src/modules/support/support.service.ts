import prisma from "../../db/prisma.js";
import {
  FeedbackType,
  SupportTicketStatus,
} from "../../generated/prisma/client.js";

const TICKET_SUMMARY_SELECT = {
  id: true,
  clerkUserId: true,
  type: true,
  subject: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

export async function createTicket(
  clerkUserId: string,
  type: FeedbackType,
  subject: string,
  message: string,
) {
  return prisma.supportTicket.create({
    data: {
      clerkUserId,
      type,
      subject,
      messages: { create: { clerkUserId, message, isAdmin: false } },
    },
    include: { messages: true },
  });
}

export async function listMyTickets(clerkUserId: string) {
  return prisma.supportTicket.findMany({
    where: { clerkUserId },
    orderBy: { updatedAt: "desc" },
    select: TICKET_SUMMARY_SELECT,
  });
}

export async function getMyTicket(clerkUserId: string, id: number) {
  return prisma.supportTicket.findFirst({
    where: { id, clerkUserId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function addMyMessage(
  clerkUserId: string,
  ticketId: number,
  message: string,
) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, clerkUserId },
  });

  if (!ticket) {
    return null;
  }

  const [created] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId, clerkUserId, message, isAdmin: false },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return created;
}

export async function listAllTicketsAdmin() {
  return prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    select: TICKET_SUMMARY_SELECT,
  });
}

export async function getTicketAdmin(id: number) {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function addAdminMessage(
  ticketId: number,
  clerkUserId: string,
  message: string,
) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    return null;
  }

  const [created] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId, clerkUserId, message, isAdmin: true },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return created;
}

export async function deleteTicketAdmin(id: number) {
  const { count } = await prisma.supportTicket.deleteMany({ where: { id } });

  return count > 0;
}

export async function updateTicketStatus(
  id: number,
  status: SupportTicketStatus,
) {
  const existing = await prisma.supportTicket.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.supportTicket.update({ where: { id }, data: { status } });
}
