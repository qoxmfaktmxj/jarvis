export type SecretRef = string;

export interface SecretResolver {
  resolve(ref: SecretRef, workspaceId?: string): Promise<string>;
}

export interface ResolvedSecret {
  ref: SecretRef;
  value: string;
  resolvedAt: Date;
}

export function isSecretRef(value: string | null | undefined): value is SecretRef {
  return typeof value === "string" && value.startsWith("vault://");
}

export function createEnvSecretResolver(): SecretResolver {
  return {
    async resolve(ref: SecretRef): Promise<string> {
      const key = ref
        .replace("vault://jarvis/", "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toUpperCase();
      const value = process.env[key];
      if (!value) {
        throw new Error(`Secret not found: ${ref} (env key: ${key})`);
      }
      return value;
    }
  };
}
