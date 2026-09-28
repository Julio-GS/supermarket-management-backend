import { Decimal } from "decimal.js";
import { ValidationError } from "../errors/domain.error";

export const ALLOWED_IVA_RATES = ["10.50", "21.00"] as const;
export type AllowedIvaRate = (typeof ALLOWED_IVA_RATES)[number];

const ALLOWED_IVA_SET = new Set<string>(ALLOWED_IVA_RATES);

/**
 * Normalizes an input value into an accepted IVA rate ("10.50" or "21.00").
 * Returns null if the rate is invalid or not in the allowed set.
 */
export function normalizeIvaRate(value: unknown): AllowedIvaRate | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) {
    return null;
  }

  // Reject non-numeric strings or obvious invalid patterns before Decimal parsing
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return null;
  }

  try {
    const d = new Decimal(raw);
    const formatted = d.toFixed(2);
    if (ALLOWED_IVA_SET.has(formatted)) {
      return formatted as AllowedIvaRate;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the given value can be normalized to an allowed IVA rate (10.50 or 21.00).
 */
export function isAllowedIvaRate(value: unknown): boolean {
  return normalizeIvaRate(value) !== null;
}

/**
 * Validates that an IVA rate is allowed and returns its normalized form ("10.50" or "21.00").
 * Throws a ValidationError if the rate is missing, 0, or unsupported.
 */
export function validateIvaRate(value: unknown): AllowedIvaRate {
  const normalized = normalizeIvaRate(value);
  if (normalized === null) {
    throw new ValidationError(
      `Invalid IVA rate: ${String(value)}. Only 10.50% and 21.00% are allowed.`,
    );
  }
  return normalized;
}

export interface ValidateProductIvaOptions {
  facturable: boolean;
  iva?: string | number | null;
}

/**
 * Validates product IVA invariants across create, update, and sync writes:
 * - A facturable product must have an allowed IVA (10.50% or 21.00%).
 * - Provided IVA values must never be zero or unsupported (even for non-facturable products).
 * - Non-facturable products may have null/undefined IVA.
 */
export function validateProductIvaInvariants(
  options: ValidateProductIvaOptions,
): AllowedIvaRate | null {
  const { facturable, iva } = options;

  if (facturable) {
    if (iva === null || iva === undefined || iva === "") {
      throw new ValidationError(
        "Facturable products must have an allowed IVA rate (10.50% or 21.00%)",
      );
    }
    return validateIvaRate(iva);
  }

  // Non-facturable product: null or undefined is allowed
  if (iva === null || iva === undefined || iva === "") {
    return null;
  }

  // Provided IVA value on non-facturable product must still be valid (never 0 or unsupported)
  return validateIvaRate(iva);
}
