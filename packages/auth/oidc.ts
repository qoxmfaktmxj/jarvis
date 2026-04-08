import * as oidc from "openid-client";

let _config: oidc.Configuration | null = null;

export function shouldAllowInsecureDiscovery(issuer: URL): boolean {
  if (process.env["NODE_ENV"] === "production") {
    return false;
  }

  if (issuer.protocol !== "http:") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(issuer.hostname);
}

/**
 * Returns a cached openid-client Configuration.
 * Performs discovery on first call (fetches /.well-known/openid-configuration).
 * Subsequent calls return the cached result — safe for concurrent requests.
 */
export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (_config) return _config;

  const issuer = process.env["OIDC_ISSUER"];
  const clientId = process.env["OIDC_CLIENT_ID"];
  const clientSecret = process.env["OIDC_CLIENT_SECRET"];

  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      "Missing required OIDC env vars: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET"
    );
  }

  const issuerUrl = new URL(issuer);
  const discoveryOptions = shouldAllowInsecureDiscovery(issuerUrl)
    ? { execute: [oidc.allowInsecureRequests] }
    : undefined;

  _config = await oidc.discovery(
    issuerUrl,
    clientId,
    clientSecret,
    undefined,
    discoveryOptions
  );
  return _config;
}

/**
 * Resets the cached config. Used in tests.
 */
export function resetOidcConfig(): void {
  _config = null;
}

export {
  oidc as oidcClient,
};
