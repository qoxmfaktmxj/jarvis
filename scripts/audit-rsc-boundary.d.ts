declare module "./audit-rsc-boundary.mjs" {
  export function auditRscBoundary(root?: string): Promise<{ violations: string[] }>;
  export function main(): Promise<void>;
}

export {};
