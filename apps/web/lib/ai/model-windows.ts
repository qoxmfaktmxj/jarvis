/**
 * 모델별 컨텍스트 윈도우(입력+출력 최대 토큰).
 *
 * Ask AI UI의 컨텍스트 게이지에 사용된다. 모델이 바뀌면 즉시 분모가 바뀌므로
 * `Record<AskModel, number>` 단일 소스. 새 모델을 추가할 때 이 표만 늘리면 된다.
 *
 * 참고: OpenAI GPT-5.x 계열은 400k context window.
 */

export const MODEL_CONTEXT_WINDOW = {
  "gpt-5.5": 400_000,
  "gpt-5.4-mini": 400_000,
} as const satisfies Record<string, number>;

export const DEFAULT_CONTEXT_WINDOW = 128_000;

export function getModelContextWindow(model: string): number {
  if (model in MODEL_CONTEXT_WINDOW) {
    return MODEL_CONTEXT_WINDOW[model as keyof typeof MODEL_CONTEXT_WINDOW];
  }
  return DEFAULT_CONTEXT_WINDOW;
}
