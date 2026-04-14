import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return; // no-op
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? 0),
  });
  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function captureMessage(msg: string, context?: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureMessage(msg, context ? { extra: context } : undefined);
}
