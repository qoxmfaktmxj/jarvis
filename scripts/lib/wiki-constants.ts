/**
 * scripts/lib/wiki-constants.ts
 *
 * Shared constants for Karpathy LLM Wiki scripts (build-wiki-index,
 * weave-wikilinks, …). One place for string literals that span multiple
 * tools so contributors don't need to hunt for "index" string matches when
 * the convention changes.
 */

/**
 * Value of the `type:` frontmatter key used for auto-generated catalog
 * (aka "index") pages — e.g. `wiki/<ws>/auto/infra/index.md`.
 *
 * - `build-wiki-index.ts` writes this as the `type:` of every generated
 *   catalog file.
 * - `weave-wikilinks.ts` skips any page whose `type` is this value so it
 *   never mutates auto-generated catalogs.
 */
export const CATALOG_PAGE_TYPE = "index" as const;
