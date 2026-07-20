export interface AllowedFetchPolicy {
  hostnames: ReadonlySet<string>;
  pathPrefixes: readonly string[];
  contentTypes: ReadonlySet<string>;
  maxBytes: number;
  timeoutMs: number;
}

function pathAllowed(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix ||
    pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function validatePolicy(policy: AllowedFetchPolicy): void {
  if (policy.hostnames.size === 0 || policy.pathPrefixes.length === 0 || policy.contentTypes.size === 0) {
    throw new Error("invalid provider fetch policy");
  }
  if (!Number.isInteger(policy.maxBytes) || policy.maxBytes < 1 ||
      !Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1) {
    throw new Error("invalid provider fetch policy");
  }
}

export async function fetchAllowed(
  url: URL,
  policy: AllowedFetchPolicy,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  validatePolicy(policy);
  if (url.protocol !== "https:" || url.username || url.password ||
      !policy.hostnames.has(url.hostname.toLowerCase()) ||
      !pathAllowed(url.pathname, policy.pathPrefixes)) {
    throw new Error("provider URL denied");
  }

  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(policy.timeoutMs),
    headers: { accept: [...policy.contentTypes].join(", ") },
  });
  if (!response.ok) throw new Error(`provider HTTP ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !policy.contentTypes.has(contentType)) {
    throw new Error(`provider content type denied: ${contentType ?? "missing"}`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > policy.maxBytes) {
    throw new Error("provider response too large");
  }
  if (!response.body) throw new Error("provider response body missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > policy.maxBytes) {
        await reader.cancel();
        throw new Error("provider response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return { bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total), contentType };
}
