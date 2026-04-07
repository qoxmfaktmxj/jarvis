import type { SearchQuery, SearchResult } from "./types.js";

export interface SearchAdapter {
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(prefix: string, workspaceId: string): Promise<string[]>;
  indexPage(pageId: string): Promise<void>;
  deletePage(pageId: string): Promise<void>;
}

let adapter: SearchAdapter | null = null;

export function setSearchAdapter(value: SearchAdapter): void {
  adapter = value;
}

export function getSearchAdapter(): SearchAdapter {
  if (!adapter) {
    throw new Error(
      "Search adapter not initialized. Call setSearchAdapter() first."
    );
  }
  return adapter;
}
