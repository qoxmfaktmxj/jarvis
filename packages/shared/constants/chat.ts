export const CHAT_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "🎉",
  "😂",
  "🙏"
] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export const CHAT_MESSAGE_MAX_CHARS = 2000;
export const CHAT_INITIAL_LOAD = 50;
export const CHAT_ONLINE_WINDOW_MINUTES = 5;
