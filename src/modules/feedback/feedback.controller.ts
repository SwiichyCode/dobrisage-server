import { Request, Response } from "express";
import { FeedbackType } from "../../generated/prisma/client.js";
import { createFeedback, listFeedback } from "./feedback.service.js";

const VALID_TYPES: Record<string, FeedbackType> = {
  bug: FeedbackType.BUG,
  suggestion: FeedbackType.SUGGESTION,
};
const VALID_LOCALES = ["fr", "en", "es"];
const MESSAGE_MAX_LENGTH = 2000;

function serializeFeedback(feedback: {
  id: number;
  type: FeedbackType;
  message: string;
  pseudo: string | null;
  locale: string;
  createdAt: Date;
}) {
  return { ...feedback, type: feedback.type.toLowerCase() };
}

export async function createFeedbackController(req: Request, res: Response) {
  const { type, message, locale, pseudo } = req.body;

  const feedbackType =
    typeof type === "string" ? VALID_TYPES[type] : undefined;

  if (!feedbackType) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing type",
    });
  }

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MESSAGE_MAX_LENGTH
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing message",
    });
  }

  if (typeof locale !== "string" || !VALID_LOCALES.includes(locale)) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing locale",
    });
  }

  if (pseudo !== undefined && pseudo !== null && typeof pseudo !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid pseudo",
    });
  }

  try {
    const feedback = await createFeedback(
      feedbackType,
      message,
      locale,
      pseudo || null,
    );

    return res.status(201).json({
      success: true,
      data: serializeFeedback(feedback),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to create feedback",
    });
  }
}

export async function listFeedbackController(_req: Request, res: Response) {
  try {
    const feedback = await listFeedback();

    return res.json({
      success: true,
      count: feedback.length,
      data: feedback.map(serializeFeedback),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch feedback",
    });
  }
}
