import {
  sendMessageInputSchema,
  toggleReactionInputSchema,
  deleteMessageInputSchema
} from "@jarvis/shared/validation/chat";

export function validateSend(input: unknown) {
  return sendMessageInputSchema.parse(input);
}

export function validateToggle(input: unknown) {
  return toggleReactionInputSchema.parse(input);
}

export function validateDelete(input: unknown) {
  return deleteMessageInputSchema.parse(input);
}
