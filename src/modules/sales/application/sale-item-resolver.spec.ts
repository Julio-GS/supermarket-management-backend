import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
import { PromotionResolverService, ResolvedPromotion } from "../../promotions/application/promotion-resolver.service";
import { NormalizedSaleRequest } from "./create-sale.types";
import { SaleItemResolver } from "./sale-item-resolver";

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    detalle: "Test Product",
    costo_neto: "100.00",
    costo_final: "121.00",
    iva: "21.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-01",
    etiqueta: "test",
    facturable: true,
    maneja_stock: true,
    codigos: ["123456"],
    pricing_mode: "fixed",
    is_protected: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildNormalizedRequest(overrides: Partial<NormalizedSaleRequest> = {}): NormalizedSaleRequest {
  return {
    userId: "user-1",
    items: [],
    paymentMethods: [{ method: "cash", amount: "121.00" }],
    splitTicketGroups: null,
    invoiceRequested: false,
    manualDiscount: null,
    ...overrides,
  };
}

describe("SaleItemResolver", () => {
  let resolver: SaleItemResolver;
  let productRepo: jest.Mocked<Pick<ProductRepositoryPort, "findByIdsForSale">>;
  let promotionResolver: jest.Mocked<Pick<PromotionResolverService, "resolveForSaleItems">>;

  beforeEach(() => {
    productRepo = {
      findByIdsForSale: jest.fn().mockResolvedValue([]),
    };
    promotionResolver = {
      resolveForSaleItems: jest.fn().mockResolvedValue([]),
    };
    resolver = new SaleItemResolver(
      productRepo as unknown as ProductRepositoryPort,
      promotionResolver as unknown as PromotionResolverService,
    );
  });

  describe("product lookup", () => {
    it("skips product repository call when there are no catalog items", async () => {
      const request = buildNormalizedRequest({
        items: [
          {
            kind: "ad-hoc",
            originalIndex: 0,
            syntheticProductId: "synth-1",
            name: "Ad-hoc item",
            description: null,
            unitPrice: "50.00",
            quantity: 2,
          },
        ],
      });

      const result = await resolver.resolve(request);

      expect(productRepo.findByIdsForSale).not.toHaveBeenCalled();
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({
        kind: "ad-hoc",
        lineId: "synth-1",
        quantity: 2,
        unitPrice: "50.00",
        promotionEligible: true,
        stockManaged: false,
        facturable: true,
        ivaForPersistence: "21.00",
      });
    });

    it("calls findByIdsForSale with deduplicated catalog product IDs", async () => {
      const prodA = buildProduct({ id: "prod-a", detalle: "Product A" });
      productRepo.findByIdsForSale.mockResolvedValue([prodA]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-a",
            quantity: 1,
            splitTicket: { group_1_quantity: 1, group_2_quantity: 0 },
          },
          {
            kind: "catalog-reference",
            originalIndex: 1,
            productId: "prod-a",
            quantity: 3,
          },
        ],
      });

      const result = await resolver.resolve(request);

      expect(productRepo.findByIdsForSale).toHaveBeenCalledTimes(1);
      expect(productRepo.findByIdsForSale).toHaveBeenCalledWith(["prod-a"]);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].splitTicket).toEqual({ group_1_quantity: 1, group_2_quantity: 0 });
      expect(result.lines[1].splitTicket).toBeUndefined();
    });

    it("handles empty items array gracefully", async () => {
      const request = buildNormalizedRequest({ items: [] });
      const result = await resolver.resolve(request);

      expect(productRepo.findByIdsForSale).not.toHaveBeenCalled();
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith([]);
      expect(result.lines).toEqual([]);
      expect(result.promotionsByLineId.size).toBe(0);
    });

    it("throws NotFoundError when a catalog product is missing", async () => {
      productRepo.findByIdsForSale.mockResolvedValue([]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "missing-id",
            quantity: 1,
          },
        ],
      });

      await expect(resolver.resolve(request)).rejects.toThrow(NotFoundError);
      await expect(resolver.resolve(request)).rejects.toThrow("Product missing-id not found");
    });
  });

  describe("fixed-price catalog items", () => {
    it("resolves fixed-price catalog items with product catalog price and markers", async () => {
      const prod = buildProduct({
        id: "prod-fixed",
        detalle: "Fixed Product",
        costo_final: "150.50",
        pricing_mode: "fixed",
        maneja_stock: true,
        facturable: true,
        iva: "21.00",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-fixed",
            quantity: 2,
            lineTotal: null,
          },
        ],
        invoiceRequested: false,
      });

      const result = await resolver.resolve(request);

      expect(result.lines[0]).toEqual({
        kind: "catalog-fixed",
        lineId: "prod-fixed",
        originalIndex: 0,
        product: prod,
        quantity: 2,
        unitPrice: "150.50",
        promotionEligible: true,
        stockManaged: true,
        facturable: true,
        ivaForPersistence: null,
      });
    });

    it("throws ValidationError when fixed-price product provides line_total", async () => {
      const prod = buildProduct({
        id: "prod-fixed",
        detalle: "Fixed Product",
        pricing_mode: "fixed",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-fixed",
            quantity: 1,
            lineTotal: "100.00",
          },
        ],
      });

      await expect(resolver.resolve(request)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(request)).rejects.toThrow(
        "Product Fixed Product has a fixed price; line_total is not allowed",
      );
    });

    it("throws ValidationError when fixed-price product has null costo_final", async () => {
      const prod = buildProduct({
        id: "prod-fixed",
        detalle: "Fixed Product",
        costo_final: null,
        pricing_mode: "fixed",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-fixed",
            quantity: 1,
          },
        ],
      });

      await expect(resolver.resolve(request)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(request)).rejects.toThrow(
        "Product Fixed Product has no catalog price defined",
      );
    });
  });

  describe("manual-price catalog items", () => {
    it("resolves manual-price catalog items with validated lineTotal and quantity 1", async () => {
      const prod = buildProduct({
        id: "prod-manual",
        detalle: "Manual Product",
        pricing_mode: "manual",
        costo_final: null,
        maneja_stock: false,
        facturable: true,
        iva: "10.50",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual",
            quantity: 1,
            lineTotal: "89.99",
          },
        ],
        invoiceRequested: true,
      });

      const result = await resolver.resolve(request);

      expect(result.lines[0]).toEqual({
        kind: "catalog-manual",
        lineId: "prod-manual",
        originalIndex: 0,
        product: prod,
        quantity: 1,
        unitPrice: "89.99",
        lineTotal: "89.99",
        promotionEligible: false,
        stockManaged: false,
        facturable: true,
        ivaForPersistence: "10.50",
      });
    });

    it("throws ValidationError when manual product quantity !== 1", async () => {
      const prod = buildProduct({
        id: "prod-manual",
        detalle: "Manual Product",
        pricing_mode: "manual",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual",
            quantity: 2,
            lineTotal: "50.00",
          },
        ],
      });

      await expect(resolver.resolve(request)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(request)).rejects.toThrow(
        "Special product Manual Product only allows quantity 1",
      );
    });

    it("throws ValidationError when manual product is missing lineTotal or has empty string", async () => {
      const prod = buildProduct({
        id: "prod-manual",
        detalle: "Manual Product",
        pricing_mode: "manual",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const requestMissing = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual",
            quantity: 1,
          },
        ],
      });

      await expect(resolver.resolve(requestMissing)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(requestMissing)).rejects.toThrow(
        "Special product Manual Product requires a line_total amount",
      );

      const requestEmpty = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual",
            quantity: 1,
            lineTotal: "",
          },
        ],
      });

      await expect(resolver.resolve(requestEmpty)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(requestEmpty)).rejects.toThrow(
        "Special product Manual Product requires a line_total amount",
      );
    });

    it("throws ValidationError when manual product has non-positive lineTotal", async () => {
      const prod = buildProduct({
        id: "prod-manual",
        detalle: "Manual Product",
        pricing_mode: "manual",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual",
            quantity: 1,
            lineTotal: "0.00",
          },
        ],
      });

      await expect(resolver.resolve(request)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(request)).rejects.toThrow(
        "Special product Manual Product requires a positive line_total",
      );
    });
  });

  describe("facturable and invoice checks", () => {
    it("throws ValidationError when invoiceRequested is true and product is not facturable", async () => {
      const prod = buildProduct({
        id: "prod-non-facturable",
        detalle: "Non Facturable Item",
        facturable: false,
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-non-facturable",
            quantity: 1,
          },
        ],
        invoiceRequested: true,
      });

      await expect(resolver.resolve(request)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(request)).rejects.toThrow(
        "Product Non Facturable Item (prod-non-facturable) is not facturable and cannot be invoiced",
      );

      const manualProd = buildProduct({
        id: "prod-manual-non-facturable",
        detalle: "Manual Non Facturable Item",
        pricing_mode: "manual",
        facturable: false,
      });
      productRepo.findByIdsForSale.mockResolvedValue([manualProd]);

      const requestManual = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-manual-non-facturable",
            quantity: 1,
            lineTotal: "50.00",
          },
        ],
        invoiceRequested: true,
      });

      await expect(resolver.resolve(requestManual)).rejects.toThrow(ValidationError);
      await expect(resolver.resolve(requestManual)).rejects.toThrow(
        "Product Manual Non Facturable Item (prod-manual-non-facturable) is not facturable and cannot be invoiced",
      );
    });

    it("does not throw when product is not facturable but invoiceRequested is false", async () => {
      const prod = buildProduct({
        id: "prod-non-facturable",
        detalle: "Non Facturable Item",
        facturable: false,
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-non-facturable",
            quantity: 1,
          },
        ],
        invoiceRequested: false,
      });

      const result = await resolver.resolve(request);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].facturable).toBe(false);
      expect(result.lines[0].ivaForPersistence).toBeNull();
    });

    it("sets product iva on catalog items when invoiceRequested is true", async () => {
      const prod = buildProduct({
        id: "prod-facturable",
        detalle: "Facturable Item",
        facturable: true,
        iva: "10.50",
      });
      productRepo.findByIdsForSale.mockResolvedValue([prod]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-facturable",
            quantity: 1,
          },
        ],
        invoiceRequested: true,
      });

      const result = await resolver.resolve(request);
      expect(result.lines[0].ivaForPersistence).toBe("10.50");
    });
  });

  describe("promotion resolution eligibility and mapping", () => {
    it("calls promotion resolver only for promotion-eligible lines and maps results by lineId/originalIndex", async () => {
      const fixedProd = buildProduct({
        id: "prod-fixed",
        costo_final: "100.00",
        pricing_mode: "fixed",
      });
      const manualProd = buildProduct({
        id: "prod-manual",
        pricing_mode: "manual",
      });
      productRepo.findByIdsForSale.mockResolvedValue([fixedProd, manualProd]);

      const mockPromoFixed: ResolvedPromotion = {
        promotionId: "promo-1",
        type: "percentage",
        discountAmount: "10.00",
        applied_promotions: [
          {
            promotion_id: "promo-1",
            promotion_scope: "product",
            promotion_type: "percentage",
            discount_amount: "10.00",
          },
        ],
      };
      const mockPromoAdHoc: ResolvedPromotion = {
        promotionId: "promo-store",
        type: "percentage",
        discountAmount: "5.00",
        applied_promotions: [
          {
            promotion_id: "promo-store",
            promotion_scope: "store",
            promotion_type: "percentage",
            discount_amount: "5.00",
          },
        ],
      };

      promotionResolver.resolveForSaleItems.mockResolvedValue([
        mockPromoFixed,
        mockPromoAdHoc,
      ]);

      const request = buildNormalizedRequest({
        items: [
          {
            kind: "catalog-reference",
            originalIndex: 0,
            productId: "prod-fixed",
            quantity: 2,
          },
          {
            kind: "catalog-reference",
            originalIndex: 1,
            productId: "prod-manual",
            quantity: 1,
            lineTotal: "50.00",
          },
          {
            kind: "ad-hoc",
            originalIndex: 2,
            syntheticProductId: "synth-adhoc",
            name: "Ad-hoc item",
            description: null,
            unitPrice: "40.00",
            quantity: 1,
          },
        ],
      });

      const result = await resolver.resolve(request);

      // Manual item (index 1) must be excluded from promotion resolver input
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledTimes(1);
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith([
        { productId: "prod-fixed", unitPrice: "100.00", quantity: 2 },
        { productId: "synth-adhoc", unitPrice: "40.00", quantity: 1 },
      ]);

      expect(result.promotionsByLineId.get("prod-fixed")).toEqual(mockPromoFixed);
      expect(result.promotionsByLineId.get("prod-manual")).toBeNull();
      expect(result.promotionsByLineId.get("synth-adhoc")).toEqual(mockPromoAdHoc);

      expect(result.promotionsByOriginalIndex?.get(0)).toEqual(mockPromoFixed);
      expect(result.promotionsByOriginalIndex?.get(1)).toBeNull();
      expect(result.promotionsByOriginalIndex?.get(2)).toEqual(mockPromoAdHoc);
    });
  });
});
