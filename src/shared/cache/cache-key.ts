import { createHash } from "crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function buildCacheKey(
  prefix: string,
  scope: string,
  params: object,
): string {
  const hash = createHash("sha1").update(stableStringify(params)).digest("hex");
  return `${prefix}:${scope}:${hash}`;
}
