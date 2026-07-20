import { fakeProvider } from "./fake.js";
import type { ProviderAdapter } from "./types.js";

const PROVIDERS = new Map<string, ProviderAdapter>([[fakeProvider.id, fakeProvider]]);

export function getProvider(providerId: string): ProviderAdapter {
  const provider = PROVIDERS.get(providerId);
  if (!provider) throw new Error(`provider not enabled: ${providerId}`);
  return provider;
}

export function listEnabledProviderIds(): string[] {
  return [...PROVIDERS.keys()].sort();
}
