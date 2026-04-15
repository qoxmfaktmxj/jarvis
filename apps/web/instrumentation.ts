export async function register() {
  // Sentry uses Node-only APIs (worker_threads, module, require hooks via
  // import-in-the-middle). Only initialize in the Node runtime — skip on
  // Edge and during static optimization so webpack doesn't try to bundle
  // Node built-ins for the browser/edge worker.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('@jarvis/shared/sentry');
    initSentry();
  }
}
