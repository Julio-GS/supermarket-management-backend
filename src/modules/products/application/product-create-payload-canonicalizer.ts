import { createHash } from "crypto";
import { ProductCreateInput } from "./product.repository.port";

export interface CanonicalPayload {
  version: number;
  hash: string;
}

const CANONICAL_VERSION = 1;

const CANONICAL_FIELDS = [
  "detalle",
  "costo_neto",
  "costo_final",
  "iva",
  "cambio_costo",
  "cambio_precio",
  "etiqueta",
  "facturable",
  "maneja_stock",
  "codigos",
  "pricing_mode",
  "is_protected",
] as const;

/** Money fields that should be semantically normalized before hashing. */
const MONEY_FIELDS = new Set(["costo_neto", "costo_final", "iva"]);

/**
 * Normalize a money value to a consistent string representation.
 * - null/undefined stays null
 * - "1500", "1500.0", "1500.00" all normalize to "1500.00"
 * - meaningful differences (cents, value) are preserved
 */
function normalizeMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "") return null;
  const num = parseFloat(str);
  if (isNaN(num)) return str; // non-numeric, keep as-is
  return num.toFixed(2);
}

export class ProductCreatePayloadCanonicalizer {
  canonicalize(input: ProductCreateInput): CanonicalPayload {
    const canonical: Record<string, unknown> = { v: CANONICAL_VERSION };

    for (const field of CANONICAL_FIELDS) {
      const raw = (input as unknown as Record<string, unknown>)[field];
      // Normalize undefined to null for nullable fields
      const value = raw === undefined ? null : raw;
      // Normalize money fields for semantic equivalence
      canonical[field] = MONEY_FIELDS.has(field) ? normalizeMoney(value) : value;
    }

    // Deterministic sorted-key JSON
    const json = JSON.stringify(canonical, Object.keys(canonical).sort());
    const hash = createHash("sha256").update(json, "utf8").digest("hex");

    return { version: CANONICAL_VERSION, hash };
  }
}
