// packages/search/__tests__/types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  SearchQuery,
  SearchResult,
  SearchHit,
  SearchFacets,
  ScoreExplain,
  ParsedQuery,
  SearchSortBy,
  ResourceType,
  QueryMode,
} from '../types.js';

describe('Search types', () => {
  it('SearchQuery has required fields', () => {
    expectTypeOf<SearchQuery>().toHaveProperty('q');
    expectTypeOf<SearchQuery>().toHaveProperty('workspaceId');
    expectTypeOf<SearchQuery>().toHaveProperty('userId');
    expectTypeOf<SearchQuery>().toHaveProperty('userRoles');
  });

  it('SearchHit has score fields', () => {
    expectTypeOf<SearchHit>().toHaveProperty('ftsRank');
    expectTypeOf<SearchHit>().toHaveProperty('trgmSim');
    expectTypeOf<SearchHit>().toHaveProperty('hybridScore');
    expectTypeOf<SearchHit>().toHaveProperty('headline');
  });

  it('SearchResult has facets and suggestions', () => {
    expectTypeOf<SearchResult>().toHaveProperty('facets');
    expectTypeOf<SearchResult>().toHaveProperty('suggestions');
    expectTypeOf<SearchResult>().toHaveProperty('durationMs');
  });

  it('SearchSortBy is union of valid values', () => {
    const valid: SearchSortBy[] = ['relevance', 'date', 'popularity'];
    expectTypeOf(valid).toEqualTypeOf<SearchSortBy[]>();
  });

  it('ResourceType is union of valid values', () => {
    const valid: ResourceType[] = ['knowledge', 'project', 'system'];
    expectTypeOf(valid).toEqualTypeOf<ResourceType[]>();
  });

  it('QueryMode is union of valid values', () => {
    const valid: QueryMode[] = ['phrase', 'web', 'prefix'];
    expectTypeOf(valid).toEqualTypeOf<QueryMode[]>();
  });

  it('ParsedQuery has tsquery, mode, sanitized', () => {
    expectTypeOf<ParsedQuery>().toHaveProperty('tsquery');
    expectTypeOf<ParsedQuery>().toHaveProperty('mode');
    expectTypeOf<ParsedQuery>().toHaveProperty('sanitized');
  });

  it('ScoreExplain has all score breakdowns', () => {
    expectTypeOf<ScoreExplain>().toHaveProperty('id');
    expectTypeOf<ScoreExplain>().toHaveProperty('ftsRank');
    expectTypeOf<ScoreExplain>().toHaveProperty('trgmSim');
    expectTypeOf<ScoreExplain>().toHaveProperty('freshness');
    expectTypeOf<ScoreExplain>().toHaveProperty('hybridScore');
  });
});
