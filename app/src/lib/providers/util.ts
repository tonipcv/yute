import "server-only";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Walk an arbitrary JSON response and return the first plausible work email. */
export function firstEmail(obj: unknown, depth = 0): string | null {
  if (depth > 6 || obj == null) return null;
  if (typeof obj === "string") {
    const v = obj.trim().toLowerCase();
    return EMAIL_RE.test(v) ? v : null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = firstEmail(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of ["email", "work_email", "email_address", "value", "address"]) {
      if (key in rec) {
        const found = firstEmail(rec[key], depth + 1);
        if (found) return found;
      }
    }
    for (const value of Object.values(rec)) {
      const found = firstEmail(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Return the first non-empty string found under any of the given keys (recursive, shallow first). */
export function firstString(obj: unknown, keys: string[], depth = 0): string | null {
  if (depth > 6 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = firstString(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const value of Object.values(rec)) {
    const found = firstString(value, keys, depth + 1);
    if (found) return found;
  }
  return null;
}
