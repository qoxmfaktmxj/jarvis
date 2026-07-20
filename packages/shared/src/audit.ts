const SENSITIVE = /(password|hash|secret|token|credential|api[-_]?key|private[-_]?key)/i;

export interface AuditInput {
  workspaceId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: unknown;
  success?: boolean;
  errorMessage?: string | null;
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(mask);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
      key,
      SENSITIVE.test(key) ? "[REDACTED]" : mask(inner),
    ]),
  );
}

export function buildAuditRow(input: AuditInput) {
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    details: (mask(input.details ?? {}) ?? {}) as Record<string, unknown>,
    success: input.success ?? true,
    errorMessage: input.errorMessage ?? null,
  };
}
