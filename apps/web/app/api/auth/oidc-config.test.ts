import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAllowInsecureDiscovery } from "@jarvis/auth/oidc";

describe("shouldAllowInsecureDiscovery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows localhost http issuer discovery in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(shouldAllowInsecureDiscovery(new URL("http://localhost:18080/realms/jarvis"))).toBe(
      true
    );
    expect(shouldAllowInsecureDiscovery(new URL("http://127.0.0.1:18080/realms/jarvis"))).toBe(
      true
    );
  });

  it("blocks insecure discovery outside local development", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldAllowInsecureDiscovery(new URL("http://localhost:18080/realms/jarvis"))).toBe(
      false
    );
    expect(shouldAllowInsecureDiscovery(new URL("https://localhost:18080/realms/jarvis"))).toBe(
      false
    );
    expect(shouldAllowInsecureDiscovery(new URL("http://keycloak.internal/realms/jarvis"))).toBe(
      false
    );
  });
});
