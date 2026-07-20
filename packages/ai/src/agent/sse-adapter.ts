import type { AskEvent } from "../types.js";

export interface SseEvent {
  event: string;
  data: string;
}

export function createSseEvent(event: AskEvent): SseEvent {
  return {
    event: event.type,
    data: JSON.stringify(event),
  };
}
