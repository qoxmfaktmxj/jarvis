import * as oidc from "openid-client";

let _config: oidc.Configuration | null = null;

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

  _config = await oidc.discovery(new URL(issuer), clientId, clientSecret);
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
