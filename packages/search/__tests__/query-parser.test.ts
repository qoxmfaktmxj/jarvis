// packages/search/__tests__/query-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseQuery, extractTerm, detectMode } from '../query-parser.js';

describe('detectMode', () => {
  it('returns phrase for quoted string', () => {
    expect(detectMode('"exact phrase"')).toBe('phrase');
  });

  it('returns prefix for trailing asterisk', () => {
    expect(detectMode('foo*')).toBe('prefix');
  });

  it('returns web for plain text', () => {
    expect(detectMode('search term')).toBe('web');
  });

  it('returns web for single quote (not double)', () => {
    expect(detectMode("'foo'")).toBe('web');
  });

  it('returns web for unclosed double quote', () => {
    expect(detectMode('"unclosed')).toBe('web');
  });
});

describe('parseQuery', () => {
  it('phrase mode produces phraseto_tsquery call', () => {
    const result = parseQuery('"exact phrase"');
    expect(result.mode).toBe('phrase');
    expect(result.tsquery).toContain('phraseto_tsquery');
    expect(result.tsquery).toContain('exact phrase');
    expect(result.sanitized).toBe('"exact phrase"');
  });

  it('prefix mode produces to_tsquery with :* operator', () => {
    const result = parseQuery('foo*');
    expect(result.mode).toBe('prefix');
    expect(result.tsquery).toContain('to_tsquery');
    expect(result.tsquery).toContain('foo:*');
    expect(result.sanitized).toBe('foo*');
  });

  it('web mode produces websearch_to_tsquery call', () => {
    const result = parseQuery('hello world');
    expect(result.mode).toBe('web');
    expect(result.tsquery).toContain('websearch_to_tsquery');
    expect(result.tsquery).toContain('hello world');
  });

  it('sanitizes SQL injection attempts', () => {
    const result = parseQuery("foo'; DROP TABLE users;--");
    // Semicolons are stripped so the embedded string cannot break out of the SQL function call
    expect(result.sanitized).not.toContain(';');
    // The tsquery embeds the sanitized text with apostrophes doubled — safe for sql.raw() usage
    expect(result.tsquery).toContain("foo''");
  });

  it('sanitizes extra whitespace', () => {
    const result = parseQuery('  foo   bar  ');
    expect(result.sanitized).toBe('foo bar');
  });

  it('handles single-word prefix query', () => {
    const result = parseQuery('prog*');
    expect(result.mode).toBe('prefix');
    expect(result.tsquery).toContain('prog:*');
  });
});

describe('extractTerm', () => {
  it('strips quotes from phrase query', () => {
    expect(extractTerm('"exact phrase"')).toBe('exact phrase');
  });

  it('strips asterisk from prefix query', () => {
    expect(extractTerm('foo*')).toBe('foo');
  });

  it('returns sanitized term for web query', () => {
    expect(extractTerm('hello world')).toBe('hello world');
  });
});
