import "server-only";

/** Minimal Sentry reporter over the Store API (no SDK, keeps the bundle small). */
export async function reportError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    const error = err instanceof Error ? err : new Error(String(err));
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}` },
      body: JSON.stringify({
        message: error.message,
        level: "error",
        platform: "node",
        environment: process.env.NODE_ENV,
        extra: context ?? {},
        exception: { values: [{ type: error.name, value: error.message }] },
      }),
    });
  } catch {
    // never throw from a reporter
  }
}
