import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getCaseSensitivityPolicy } from './case-context.js';

describe('case retrieval sensitivity policy', () => {
  it('excludes restricted cases for plain knowledge readers', () => {
    expect(getCaseSensitivityPolicy([PERMISSIONS.KNOWLEDGE_READ])).toBe('public-internal');
  });

  it('allows restricted cases for privileged knowledge users', () => {
    expect(getCaseSensitivityPolicy([PERMISSIONS.KNOWLEDGE_REVIEW])).toBe('all');
    expect(getCaseSensitivityPolicy([PERMISSIONS.ADMIN_ALL])).toBe('all');
  });

  it('returns no cases when the caller lacks knowledge read permissions', () => {
    expect(getCaseSensitivityPolicy([])).toBe('none');
  });
});
