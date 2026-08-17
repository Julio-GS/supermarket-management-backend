import { Decimal } from "decimal.js";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import { Product } from "../../products/domain/product.entity";
import {
  PromotionResolutionResult,
  ResolvedAdHocLine,
  ResolvedCatalogFixedLine,
  ResolvedCatalogManualLine,
  ResolvedSaleLines,
} from "./create-sale.types";
import { SalePricingCalculator } from "./sale-pricing-calculator";

describe("SalePricingCalculator", () => {
  const calculator = new SalePricingCalculator();

  function makeCatalogFixedLine(
    overrides?: Partial<ResolvedCatalogFixedLine>,
  ): ResolvedCatalogFixedLine {
    const product = {
      id: "prod-fixed-1",
      detalle: "Fixed Product",
      costo_final: "100.00",
      iva: "21.00",
      pricing_mode: "standard",
      maneja_stock: true,
      facturable: true,
    } as unknown as Product;

    return {
      kind: "catalog-fixed",
      lineId: product.id,
      originalIndex: 0,
      product,
      quantity: 2,
      unitPrice: "100.00",
      promotionEligible: true,
      stockManaged: true,
      facturable: true,
      ivaForPersistence: "21.00",
      ...overrides,
    };
  }

  function makeCatalogManualLine(
    overrides?: Partial<ResolvedCatalogManualLine>,
  ): ResolvedCatalogManualLine {
    const product = {
      id: "prod-manual-1",
      detalle: "Manual Product",
      costo_final: null,
      iva: "10.50",
      pricing_mode: "manual",
      maneja_stock: false,
      facturable: true,
    } as unknown as Product;

    return {
      kind: "catalog-manual",
      lineId: product.id,
      originalIndex: 0,
      product,
      quantity: 1,
      unitPrice: "75.00",
      lineTotal: "75.00",
      promotionEligible: false,
      stockManaged: false,
      facturable: true,
      ivaForPersistence: "10.50",
      ...overrides,
    };
  }

  function makeAdHocLine(
    overrides?: Partial<ResolvedAdHocLine>,
  ): ResolvedAdHocLine {
    return {
      kind: "ad-hoc",
      lineId: "adhoc-uuid-1",
      originalIndex: 0,
      adHoc: {
        name: "Custom AdHoc Item",
        description: "AdHoc description",
      },
      quantity: 3,
      unitPrice: "50.00",
      promotionEligible: true,
      stockManaged: false,
      facturable: true,
      ivaForPersistence: "21.00",
      ...overrides,
    };
  }

  describe("Fixed-price catalog lines", () => {
    it("calculates gross subtotal and sets sale item fields without promotions", () => {
      const line = makeCatalogFixedLine({
        quantity: 3,
        unitPrice: "25.00",
        ivaForPersistence: "21.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: true,
      });

      expect(result.postPromotionSubtotal.toString()).toBe("75");
      expect(result.finalTotal.toString()).toBe("75");
      expect(result.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
      expect(result.saleItems).toHaveLength(1);
      expect(result.saleItems[0]).toEqual({
        product_id: line.lineId,
        quantity: 3,
        unit_price: "25.00",
        subtotal: "75.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
        iva: "21.00",
      });
    });

    it("applies promotions from promotionsByLineId to fixed catalog lines", () => {
      const line = makeCatalogFixedLine({
        lineId: "prod-fixed-1",
        quantity: 2,
        unitPrice: "100.00",
        ivaForPersistence: null,
      });
      const promo: PromotionResolutionResult = {
        discountAmount: "30.00",
        promotionId: "promo-1",
        type: "percentage",
        applied_promotions: [
          {
            promotion_id: "promo-1",
            promotion_type: "percentage",
            promotion_scope: "product",
            discount_amount: "30.00",
          },
        ],
      };
      const promotionsByLineId = new Map<string, PromotionResolutionResult | null>([
        ["prod-fixed-1", promo],
      ]);
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId,
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.postPromotionSubtotal.toString()).toBe("170");
      expect(result.finalTotal.toString()).toBe("170");
      expect(result.saleItems[0]).toEqual({
        product_id: "prod-fixed-1",
        quantity: 2,
        unit_price: "100.00",
        subtotal: "170.00",
        discount_amount: "30.00",
        applied_promotions: [
          {
            promotion_id: "promo-1",
            promotion_type: "percentage",
            promotion_scope: "product",
            discount_amount: "30.00",
          },
        ],
        applied_promotion_id: "promo-1",
        applied_promotion_type: "percentage",
      });
    });

    it("prioritizes promotionsByOriginalIndex over promotionsByLineId when available", () => {
      const line = makeCatalogFixedLine({
        lineId: "prod-fixed-1",
        originalIndex: 0,
        quantity: 1,
        unitPrice: "100.00",
      });
      const promoIndex: PromotionResolutionResult = {
        discountAmount: "10.00",
        promotionId: "promo-idx",
        type: "percentage",
        applied_promotions: [],
      };
      const promoLineId: PromotionResolutionResult = {
        discountAmount: "50.00",
        promotionId: "promo-line",
        type: "percentage",
        applied_promotions: [],
      };
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map([["prod-fixed-1", promoLineId]]),
        promotionsByOriginalIndex: new Map([[0, promoIndex]]),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.saleItems[0].discount_amount).toBe("10.00");
      expect(result.saleItems[0].subtotal).toBe("90.00");
      expect(result.saleItems[0].applied_promotion_id).toBe("promo-idx");
    });

    it("omits iva field on saleItem when ivaForPersistence is null", () => {
      const line = makeCatalogFixedLine({
        ivaForPersistence: null,
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.saleItems[0].iva).toBeUndefined();
      expect("iva" in result.saleItems[0]).toBe(false);
    });
  });

  describe("Manual-price catalog lines", () => {
    it("forces promotion fields to null/empty/zero and uses lineTotal as subtotal", () => {
      const line = makeCatalogManualLine({
        lineId: "prod-manual-1",
        unitPrice: "150.00",
        lineTotal: "150.00",
        ivaForPersistence: "10.50",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: true,
      });

      expect(result.postPromotionSubtotal.toString()).toBe("150");
      expect(result.finalTotal.toString()).toBe("150");
      expect(result.saleItems[0]).toEqual({
        product_id: "prod-manual-1",
        quantity: 1,
        unit_price: "150.00",
        subtotal: "150.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
        iva: "10.50",
      });
    });
  });

  describe("Ad-hoc lines", () => {
    it("populates ad-hoc name, description, 21.00 iva, and calculates subtotal", () => {
      const line = makeAdHocLine({
        lineId: "adhoc-1",
        quantity: 2,
        unitPrice: "40.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.postPromotionSubtotal.toString()).toBe("80");
      expect(result.finalTotal.toString()).toBe("80");
      expect(result.saleItems[0]).toEqual({
        product_id: "adhoc-1",
        name: "Custom AdHoc Item",
        description: "AdHoc description",
        iva: "21.00",
        quantity: 2,
        unit_price: "40.00",
        subtotal: "80.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
      });
    });

    it("filters out product-scoped promotions for ad-hoc lines, applying only store-scoped promotions", () => {
      const line = makeAdHocLine({
        lineId: "adhoc-1",
        quantity: 1,
        unitPrice: "100.00",
      });
      const promo: PromotionResolutionResult = {
        discountAmount: "35.00",
        promotionId: "promo-mixed",
        type: "percentage",
        applied_promotions: [
          {
            promotion_id: "promo-prod",
            promotion_type: "percentage",
            promotion_scope: "product",
            discount_amount: "25.00",
          },
          {
            promotion_id: "promo-store",
            promotion_type: "percentage",
            promotion_scope: "store",
            discount_amount: "10.00",
          },
        ],
      };
      const promotionsByLineId = new Map<string, PromotionResolutionResult | null>([
        ["adhoc-1", promo],
      ]);
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId,
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.saleItems[0].discount_amount).toBe("10.00");
      expect(result.saleItems[0].subtotal).toBe("90.00");
      expect(result.saleItems[0].applied_promotions).toEqual([
        {
          promotion_id: "promo-store",
          promotion_type: "percentage",
          promotion_scope: "store",
          discount_amount: "10.00",
        },
      ]);
      expect(result.postPromotionSubtotal.toString()).toBe("90");
      expect(result.finalTotal.toString()).toBe("90");
    });
  });

  describe("Multi-line and mixed line combinations", () => {
    it("handles empty items array gracefully", () => {
      const resolved: ResolvedSaleLines = {
        lines: [],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });

      expect(result.pricedLines).toEqual([]);
      expect(result.saleItems).toEqual([]);
      expect(result.postPromotionSubtotal.toString()).toBe("0");
      expect(result.finalTotal.toString()).toBe("0");
      expect(result.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
    });

    it("prices mixed fixed, manual, and ad-hoc lines into unified totals and pricedLines", () => {
      const lineFixed = makeCatalogFixedLine({
        originalIndex: 0,
        quantity: 2,
        unitPrice: "50.00",
      });
      const lineManual = makeCatalogManualLine({
        originalIndex: 1,
        unitPrice: "80.00",
        lineTotal: "80.00",
      });
      const lineAdHoc = makeAdHocLine({
        originalIndex: 2,
        quantity: 1,
        unitPrice: "30.00",
      });

      const resolved: ResolvedSaleLines = {
        lines: [lineFixed, lineManual, lineAdHoc],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "fixed",
          amount: "10.00",
        },
        invoiceRequested: true,
      });

      // 100.00 + 80.00 + 30.00 = 210.00 - 10.00 = 200.00
      expect(result.postPromotionSubtotal.toString()).toBe("210");
      expect(result.finalTotal.toString()).toBe("200");
      expect(result.pricedLines).toHaveLength(3);
      expect(result.saleItems).toHaveLength(3);
      expect(result.pricedLines[0].kind).toBe("catalog-fixed");
      expect(result.pricedLines[1].kind).toBe("catalog-manual");
      expect(result.pricedLines[2].kind).toBe("ad-hoc");
    });
  });

  describe("Manual discount resolution", () => {
    it("handles absent, undefined, and null manual discount as zero discount", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const resUndefined = calculator.price({
        resolved,
        manualDiscount: undefined,
        invoiceRequested: false,
      });
      expect(resUndefined.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
      expect(resUndefined.finalTotal.toString()).toBe("100");

      const resNull = calculator.price({
        resolved,
        manualDiscount: null,
        invoiceRequested: false,
      });
      expect(resNull.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
      expect(resNull.finalTotal.toString()).toBe("100");
    });

    it("resolves fixed manual discount correctly", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "fixed",
          amount: "15.50",
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount.amount.toString()).toBe("15.5");
      expect(result.manualDiscount.modality).toBe("fixed");
      expect(result.manualDiscount.percentage).toBeNull();
      expect(result.finalTotal.toString()).toBe("84.5");
    });

    it("treats fixed manual discount with amount 0.00 as zero discount with null modality", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "fixed",
          amount: "0.00",
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
      expect(result.finalTotal.toString()).toBe("100");
    });

    it("throws ValidationError when fixed discount exceeds subtotal", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "50.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "fixed",
            amount: "60.00",
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("discount exceeds subtotal"));
    });

    it("throws ValidationError when discount amount is missing or empty", () => {
      const line = makeCatalogFixedLine();
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "fixed",
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("manual discount amount is required"));
    });

    it("throws ValidationError when discount amount is negative", () => {
      const line = makeCatalogFixedLine();
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "fixed",
            amount: "-10.00",
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("discount must be non-negative"));
    });

    it("resolves percentage manual discount with ROUND_HALF_UP and tolerance", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "percentage",
          percentage: "15.00",
          amount: "15.00",
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount.amount.toString()).toBe("15");
      expect(result.manualDiscount.modality).toBe("percentage");
      expect(result.manualDiscount.percentage).toBe("15.00");
      expect(result.finalTotal.toString()).toBe("85");
    });

    it("handles percentage manual discount of 0.00% as zero discount with null modality", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "percentage",
          percentage: "0.00",
          amount: "0.00",
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount).toEqual({
        amount: Money.zero(),
        modality: null,
        percentage: null,
      });
      expect(result.finalTotal.toString()).toBe("100");
    });

    it("handles percentage manual discount of 100.00% resulting in 0 total", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "percentage",
          percentage: "100.00",
          amount: "100.00",
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount.amount.toString()).toBe("100");
      expect(result.manualDiscount.modality).toBe("percentage");
      expect(result.manualDiscount.percentage).toBe("100.00");
      expect(result.finalTotal.toString()).toBe("0");
    });

    it("rounds percentage manual discount with Decimal.ROUND_HALF_UP (e.g. 50.05 * 10% = 5.005 -> 5.01)", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "50.05",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      const result = calculator.price({
        resolved,
        manualDiscount: {
          modality: "percentage",
          percentage: "10.00",
          amount: "5.01", // expected 5.01 after ROUND_HALF_UP on 5.005
        },
        invoiceRequested: false,
      });

      expect(result.manualDiscount.amount.toString()).toBe("5.01");
      expect(result.finalTotal.toString()).toBe("45.04");
    });

    it("throws ValidationError when percentage is out of range 0..100", () => {
      const line = makeCatalogFixedLine();
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "percentage",
            percentage: "105.00",
            amount: "10.00",
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("percentage must be between 0 and 100"));
    });

    it("throws ValidationError when percentage is missing or empty", () => {
      const line = makeCatalogFixedLine();
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "percentage",
            amount: "10.00",
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("manual discount percentage is required"));
    });

    it("throws ValidationError when percentage amount mismatch exceeds 0.01 tolerance", () => {
      const line = makeCatalogFixedLine({
        quantity: 1,
        unitPrice: "100.00",
      });
      const resolved: ResolvedSaleLines = {
        lines: [line],
        promotionsByLineId: new Map(),
      };

      expect(() =>
        calculator.price({
          resolved,
          manualDiscount: {
            modality: "percentage",
            percentage: "10.00",
            amount: "15.00", // expected 10.00
          },
          invoiceRequested: false,
        }),
      ).toThrow(new ValidationError("percentage amount mismatch"));
    });
  });
});
