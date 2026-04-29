// packages/ai/agent/prompt-nonce.ts
//
// Prompt injection nonce helper — Task 4 (P2 hardening).
//
// 사용자 입력(질문, 위키 페이지 본문 등)을 고유 요청 단위 nonce 로 감싸
// 모델이 해당 구간을 지시문이 아닌 데이터로 취급하도록 강제한다.

import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random 32-char hex nonce (16 bytes).
 * One nonce per LLM call — not per session, not per workspace.
 */
export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Wrap untrusted content in unique-per-request delimiters so the model
 * treats it as data only, never as instructions.
 *
 * Example output:
 *   <USER_INPUT_a3f9...>\n{content}\n</USER_INPUT_a3f9...>
 */
export function wrapUserContent(content: string, nonce: string): string {
  return `<USER_INPUT_${nonce}>\n${content}\n</USER_INPUT_${nonce}>`;
}
