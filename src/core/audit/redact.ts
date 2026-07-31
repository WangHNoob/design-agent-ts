const SENSITIVE_KEYS = new Set([
  "modelApiKey",
  "tavilyApiKey",
  "apiKey",
  "secret",
  "password",
  "token",
]);

/** Redact sensitive fields before persisting config-change audit detail. */
export function redactSensitiveSettings(
  body: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(key) || key.toLowerCase().includes("apikey")) {
      out[key] = value ? "[REDACTED]" : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
