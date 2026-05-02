import type { TabKey } from "./tab-types";

/**
 * Strip search params, hash, and trailing slash from a URL or pathname,
 * returning the canonical tab key.
 *
 *   /admin/companies        -> /admin/companies
 *   /admin/companies?q=foo  -> /admin/companies
 *   /admin/companies/       -> /admin/companies
 *   /knowledge/123/edit     -> /knowledge/123/edit
 *   /                       -> /
 */
export function pathnameToTabKey(urlOrPathname: string): TabKey {
  const queryIndex = urlOrPathname.indexOf("?");
  const hashIndex = urlOrPathname.indexOf("#");
  let endIndex = urlOrPathname.length;
  if (queryIndex !== -1) endIndex = Math.min(endIndex, queryIndex);
  if (hashIndex !== -1) endIndex = Math.min(endIndex, hashIndex);

  let key = urlOrPathname.slice(0, endIndex);
  if (key.length > 1 && key.endsWith("/")) key = key.slice(0, -1);
  return key;
}
