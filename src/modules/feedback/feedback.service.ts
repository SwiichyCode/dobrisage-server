import prisma from "../../db/prisma.js";
import { FeedbackType } from "../../generated/prisma/client.js";

export async function createFeedback(
  type: FeedbackType,
  message: string,
  locale: string,
  pseudo: string | null,
) {
  return prisma.feedback.create({
    data: { type, message, locale, pseudo },
  });
}

export async function listFeedback() {
  return prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
  });
}
