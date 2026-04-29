// packages/ai/__tests__/ask.log.test.ts
// logLlmCall is exercised via askAI() through askAgentStream (Phase B3+).
// Legacy generateAnswer() log test removed with _legacyAskAI_unused (2026-04-29).

import { describe, it } from 'vitest';

describe('ask log (legacy removed)', () => {
  it.skip('logLlmCall is covered in agent integration tests', () => {
    // See packages/ai/agent/__tests__/ for agent-path logLlmCall coverage.
  });
});
