export type PricingMode = "fixed" | "manual";

export interface SpecialCodeMapping {
  code: string;
  name: string;
}

/**
 * Reserved special codes 1–9 and their mapped product names.
 * These represent barcode-less, variable-price goods.
 */
export const SPECIAL_PRODUCT_CODES: ReadonlyArray<SpecialCodeMapping> = [
  { code: "1", name: "Fiambre" },
  { code: "2", name: "Pan" },
  { code: "3", name: "Kiosco" },
  { code: "4", name: "Perfumeria" },
  { code: "5", name: "Carne" },
  { code: "6", name: "Verdura" },
  { code: "7", name: "Huevos" },
  { code: "8", name: "Limpieza" },
  { code: "9", name: "Bolsas" },
] as const;

/** Set of reserved codes — used for guards and validation. */
export const RESERVED_CODES = new Set<string>(
  SPECIAL_PRODUCT_CODES.map((m) => m.code),
);

/** Map from code string to product name. */
export const CODE_TO_NAME = new Map<string, string>(
  SPECIAL_PRODUCT_CODES.map((m) => [m.code, m.name]),
);

/** Check whether a barcode string is a reserved special code (1–9). */
export function isReservedCode(value: string): boolean {
  return RESERVED_CODES.has(value);
}

/** Check whether any barcode in a list is a reserved code. */
export function containsReservedCode(codigos: string[]): boolean {
  return codigos.some((c) => isReservedCode(c));
}
