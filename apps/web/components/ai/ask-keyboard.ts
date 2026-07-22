export interface AskKeyboardEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}

export function shouldSubmitQuestion(event: AskKeyboardEvent): boolean {
  return event.key === "Enter"
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.isComposing;
}
