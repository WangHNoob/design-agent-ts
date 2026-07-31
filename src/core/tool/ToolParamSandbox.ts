export interface ToolSandboxConfig {
  readonly denyKeywords: readonly string[];
  readonly blockPathTraversal: boolean;
}

export interface SandboxViolation {
  readonly reason: string;
  readonly field?: string;
}

/**
 * Validates tool argument values against sandbox policy.
 * Semantics align with WorkspaceManager.sanitize / sanitizeRelativePath.
 */
export function validateToolArgsSandbox(
  args: Record<string, unknown>,
  config: ToolSandboxConfig,
): SandboxViolation | null {
  for (const [key, value] of Object.entries(args)) {
    const violation = scanValue(String(key), value, config, key);
    if (violation) return violation;
  }
  return null;
}

function scanValue(
  path: string,
  value: unknown,
  config: ToolSandboxConfig,
  field?: string,
): SandboxViolation | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return scanString(value, config, field ?? path);
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = scanValue(`${path}[${i}]`, value[i], config, field);
      if (v) return v;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const [k, nested] of Object.entries(value as Record<string, unknown>)) {
      const v = scanValue(`${path}.${k}`, nested, config, field ?? k);
      if (v) return v;
    }
  }

  return null;
}

function scanString(value: string, config: ToolSandboxConfig, field?: string): SandboxViolation | null {
  const lower = value.toLowerCase();

  for (const keyword of config.denyKeywords) {
    if (keyword && lower.includes(keyword.toLowerCase())) {
      return { reason: `Dangerous keyword "${keyword}" in argument`, field };
    }
  }

  if (config.blockPathTraversal) {
    if (value.includes("..")) {
      return { reason: "Path traversal (..) is not allowed", field };
    }
    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\")) {
      return { reason: "Absolute paths are not allowed", field };
    }
    if ((value.includes("/") || value.includes("\\")) && /[\\/:*?"<>|]/.test(value)) {
      const segments = value.split(/[\\/]/).filter(Boolean);
      for (const segment of segments) {
        if (/^\.+$/.test(segment)) {
          return { reason: "Path segment with only dots is not allowed", field };
        }
      }
    }
  }

  return null;
}

/** Mirrors WorkspaceManager.sanitize for a single path segment. */
export function sanitizePathSegment(segment: string): string {
  return segment
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+/, "_")
    .trim() || "_";
}
