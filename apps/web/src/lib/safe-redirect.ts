/** Accept a local route only. Backslashes and encoded URL separators can change its origin. */
export function safeRedirectTarget(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20|7f)/i.test(pathname)) return fallback;
  try {
    const resolved = new URL(value, "https://zhivago.invalid");
    if (resolved.origin !== "https://zhivago.invalid" || resolved.pathname.startsWith("//")) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch { return fallback; }
}
