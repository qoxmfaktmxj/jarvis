// scripts/migrate/__tests__/id-map.test.ts
import { describe, it, expect } from 'vitest';
import { IdMap } from '../id-map';

describe('IdMap', () => {
  it('sets and gets a mapping', () => {
    const map = new IdMap();
    map.set('user', 'EMP001', 'uuid-1');
    expect(map.get('user', 'EMP001')).toBe('uuid-1');
  });

  it('returns undefined for unknown key', () => {
    const map = new IdMap();
    expect(map.get('user', 'MISSING')).toBeUndefined();
  });

  it('returns undefined for unknown table', () => {
    const map = new IdMap();
    expect(map.get('unknown_table', 'EMP001')).toBeUndefined();
  });

  it('require returns value when mapping exists', () => {
    const map = new IdMap();
    map.set('project', '42', 'uuid-proj-1');
    expect(map.require('project', '42')).toBe('uuid-proj-1');
  });

  it('require throws when mapping is missing', () => {
    const map = new IdMap();
    expect(() => map.require('project', '999')).toThrow(
      /no mapping for table="project" legacyId="999"/
    );
  });

  it('count returns correct size per table', () => {
    const map = new IdMap();
    map.set('user', 'A', '1');
    map.set('user', 'B', '2');
    map.set('project', 'X', '3');
    expect(map.count('user')).toBe(2);
    expect(map.count('project')).toBe(1);
    expect(map.count('absent')).toBe(0);
  });

  it('overwrites existing mapping on duplicate set', () => {
    const map = new IdMap();
    map.set('user', 'A', 'uuid-old');
    map.set('user', 'A', 'uuid-new');
    expect(map.get('user', 'A')).toBe('uuid-new');
  });
});
