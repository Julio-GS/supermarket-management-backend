import {
  ALLOWED_IVA_RATES,
  normalizeIvaRate,
  isAllowedIvaRate,
  validateIvaRate,
  validateProductIvaInvariants,
} from "./iva-rate";
import { ValidationError } from "../errors/domain.error";

describe("IVA rate policy", () => {
  describe("ALLOWED_IVA_RATES", () => {
    it("defines exactly 10.50 and 21.00 as allowed rates", () => {
      expect(ALLOWED_IVA_RATES).toEqual(["10.50", "21.00"]);
    });
  });

  describe("normalizeIvaRate", () => {
    it("normalizes accepted 10.5 forms to '10.50'", () => {
      expect(normalizeIvaRate("10.5")).toBe("10.50");
      expect(normalizeIvaRate("10.50")).toBe("10.50");
      expect(normalizeIvaRate(" 10.50 ")).toBe("10.50");
      expect(normalizeIvaRate(10.5)).toBe("10.50");
    });

    it("normalizes accepted 21 forms to '21.00'", () => {
      expect(normalizeIvaRate("21")).toBe("21.00");
      expect(normalizeIvaRate("21.0")).toBe("21.00");
      expect(normalizeIvaRate("21.00")).toBe("21.00");
      expect(normalizeIvaRate(" 21.00 ")).toBe("21.00");
      expect(normalizeIvaRate(21)).toBe("21.00");
    });

    it("returns null for zero rates", () => {
      expect(normalizeIvaRate("0")).toBeNull();
      expect(normalizeIvaRate("0.0")).toBeNull();
      expect(normalizeIvaRate("0.00")).toBeNull();
      expect(normalizeIvaRate(0)).toBeNull();
    });

    it("returns null for unsupported rates", () => {
      expect(normalizeIvaRate("27")).toBeNull();
      expect(normalizeIvaRate("27.00")).toBeNull();
      expect(normalizeIvaRate("5")).toBeNull();
      expect(normalizeIvaRate("5.00")).toBeNull();
      expect(normalizeIvaRate("2.5")).toBeNull();
      expect(normalizeIvaRate("2.50")).toBeNull();
      expect(normalizeIvaRate("-10.50")).toBeNull();
      expect(normalizeIvaRate("-21.00")).toBeNull();
    });

    it("returns null for non-numeric or missing inputs", () => {
      expect(normalizeIvaRate(null)).toBeNull();
      expect(normalizeIvaRate(undefined)).toBeNull();
      expect(normalizeIvaRate("")).toBeNull();
      expect(normalizeIvaRate("   ")).toBeNull();
      expect(normalizeIvaRate("abc")).toBeNull();
      expect(normalizeIvaRate({})).toBeNull();
      expect(normalizeIvaRate([])).toBeNull();
    });
  });

  describe("isAllowedIvaRate", () => {
    it("returns true for valid rates and false for invalid rates", () => {
      expect(isAllowedIvaRate("10.5")).toBe(true);
      expect(isAllowedIvaRate("10.50")).toBe(true);
      expect(isAllowedIvaRate("21")).toBe(true);
      expect(isAllowedIvaRate("21.00")).toBe(true);
      expect(isAllowedIvaRate("0")).toBe(false);
      expect(isAllowedIvaRate("0.00")).toBe(false);
      expect(isAllowedIvaRate("27.00")).toBe(false);
      expect(isAllowedIvaRate(null)).toBe(false);
      expect(isAllowedIvaRate(undefined)).toBe(false);
    });
  });

  describe("validateIvaRate", () => {
    it("returns normalized rate when valid", () => {
      expect(validateIvaRate("10.5")).toBe("10.50");
      expect(validateIvaRate(10.5)).toBe("10.50");
      expect(validateIvaRate("21")).toBe("21.00");
      expect(validateIvaRate(21)).toBe("21.00");
    });

    it("throws ValidationError for 0, missing, or unsupported rates", () => {
      expect(() => validateIvaRate("0")).toThrow(ValidationError);
      expect(() => validateIvaRate("0.00")).toThrow(ValidationError);
      expect(() => validateIvaRate(0)).toThrow(ValidationError);
      expect(() => validateIvaRate("27.00")).toThrow(ValidationError);
      expect(() => validateIvaRate("5.00")).toThrow(ValidationError);
      expect(() => validateIvaRate("2.50")).toThrow(ValidationError);
      expect(() => validateIvaRate(null)).toThrow(ValidationError);
      expect(() => validateIvaRate(undefined)).toThrow(ValidationError);
      expect(() => validateIvaRate("")).toThrow(ValidationError);
    });
  });

  describe("validateProductIvaInvariants", () => {
    describe("facturable = true", () => {
      it("accepts valid rates and returns normalized rate", () => {
        expect(
          validateProductIvaInvariants({ facturable: true, iva: "10.5" }),
        ).toBe("10.50");
        expect(
          validateProductIvaInvariants({ facturable: true, iva: "10.50" }),
        ).toBe("10.50");
        expect(
          validateProductIvaInvariants({ facturable: true, iva: "21" }),
        ).toBe("21.00");
        expect(
          validateProductIvaInvariants({ facturable: true, iva: "21.00" }),
        ).toBe("21.00");
      });

      it("rejects missing or null IVA for facturable products", () => {
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: null }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: undefined }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: "" }),
        ).toThrow(ValidationError);
      });

      it("rejects 0 and unsupported rates for facturable products", () => {
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: "0" }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: "0.00" }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: 0 }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: true, iva: "27.00" }),
        ).toThrow(ValidationError);
      });
    });

    describe("facturable = false", () => {
      it("allows null, undefined, or empty IVA", () => {
        expect(
          validateProductIvaInvariants({ facturable: false, iva: null }),
        ).toBeNull();
        expect(
          validateProductIvaInvariants({ facturable: false, iva: undefined }),
        ).toBeNull();
        expect(
          validateProductIvaInvariants({ facturable: false, iva: "" }),
        ).toBeNull();
      });

      it("accepts valid rates and returns normalized rate", () => {
        expect(
          validateProductIvaInvariants({ facturable: false, iva: "21.00" }),
        ).toBe("21.00");
        expect(
          validateProductIvaInvariants({ facturable: false, iva: "10.5" }),
        ).toBe("10.50");
      });

      it("rejects 0 and unsupported rates when provided on non-facturable products", () => {
        expect(() =>
          validateProductIvaInvariants({ facturable: false, iva: "0" }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: false, iva: "0.00" }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: false, iva: 0 }),
        ).toThrow(ValidationError);
        expect(() =>
          validateProductIvaInvariants({ facturable: false, iva: "27.00" }),
        ).toThrow(ValidationError);
      });
    });
  });
});
