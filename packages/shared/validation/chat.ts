import { z } from "zod";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_REACTION_EMOJIS
} from "../constants/chat.js";

export const sendMessageInputSchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, "empty")
        .max(CHAT_MESSAGE_MAX_CHARS, "too-long")
    )
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const toggleReactionInputSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.enum(CHAT_REACTION_EMOJIS)
});

export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;

export const deleteMessageInputSchema = z.object({
  messageId: z.string().uuid()
});

export type DeleteMessageInput = z.infer<typeof deleteMessageInputSchema>;
