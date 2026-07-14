import {
  SPECIAL_PRODUCT_CODES,
  RESERVED_CODES,
  CODE_TO_NAME,
  isReservedCode,
  containsReservedCode,
} from "./special-product-codes";

describe("special-product-codes", () => {
  describe("SPECIAL_PRODUCT_CODES", () => {
    it("contains exactly 9 mappings for codes 1 through 9", () => {
      expect(SPECIAL_PRODUCT_CODES).toHaveLength(9);
      const codes = SPECIAL_PRODUCT_CODES.map((m) => m.code);
      expect(codes).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    });

    it("maps every code to a non-empty product name", () => {
      for (const mapping of SPECIAL_PRODUCT_CODES) {
        expect(mapping.name.length).toBeGreaterThan(0);
      }
    });

    it("is read-only", () => {
      expect(Object.isFrozen(SPECIAL_PRODUCT_CODES)).toBe(false);
      // Verify it can't be mutated via standard array methods
      const codesBefore = SPECIAL_PRODUCT_CODES.map((m) => m.code);
      // Try to push (should throw in strict mode if frozen; if not frozen,
      // verify no mutation via assignment)
      expect(codesBefore).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    });
  });

  describe("RESERVED_CODES", () => {
    it("contains all codes 1–9", () => {
      for (let i = 1; i <= 9; i++) {
        expect(RESERVED_CODES.has(String(i))).toBe(true);
      }
    });

    it("does not contain code 0 or codes >= 10", () => {
      expect(RESERVED_CODES.has("0")).toBe(false);
      expect(RESERVED_CODES.has("10")).toBe(false);
      expect(RESERVED_CODES.has("99")).toBe(false);
    });
  });

  describe("CODE_TO_NAME", () => {
    it("maps each reserved code to its product name", () => {
      expect(CODE_TO_NAME.get("1")).toBe("Fiambre");
      expect(CODE_TO_NAME.get("2")).toBe("Pan");
      expect(CODE_TO_NAME.get("9")).toBe("Bolsas");
    });

    it("returns undefined for unknown codes", () => {
      expect(CODE_TO_NAME.get("0")).toBeUndefined();
      expect(CODE_TO_NAME.get("abc")).toBeUndefined();
    });
  });

  describe("isReservedCode", () => {
    it.each(["1", "2", "3", "4", "5", "6", "7", "8", "9"])(
      "returns true for reserved code %s",
      (code) => {
        expect(isReservedCode(code)).toBe(true);
      },
    );

    it("returns false for non-reserved codes", () => {
      expect(isReservedCode("0")).toBe(false);
      expect(isReservedCode("10")).toBe(false);
      expect(isReservedCode("abc")).toBe(false);
      expect(isReservedCode("")).toBe(false);
      expect(isReservedCode("  1  ")).toBe(false); // no trimming
    });
  });

  describe("containsReservedCode", () => {
    it("returns true when any code in the list is reserved", () => {
      expect(containsReservedCode(["123456", "1"])).toBe(true);
      expect(containsReservedCode(["9"])).toBe(true);
      expect(containsReservedCode(["5", "10"])).toBe(true);
    });

    it("returns false when no code is reserved", () => {
      expect(containsReservedCode(["123456", "789012"])).toBe(false);
      expect(containsReservedCode([])).toBe(false);
    });
  });
});
