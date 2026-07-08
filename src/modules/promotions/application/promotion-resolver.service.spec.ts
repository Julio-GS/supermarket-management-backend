import { Test, TestingModule } from "@nestjs/testing";
import { PromotionResolverService } from "./promotion-resolver.service";
import {
  PromotionRepositoryPort,
} from "./promotion.repository.port";
import { Promotion } from "../domain/promotion.entity";

function buildPromotion(overrides: Partial<Promotion> = {}): Promotion {
  const p = new Promotion() as Promotion & {
    name: string;
    description: string | null;
    scope: string;
    product_id: string | null;
  };
  p.id = "promo-id";
  p.name = "Promotion";
  p.description = null;
  p.scope = "product";
  p.product_id = "prod-1";
  p.type = "percentage";
  p.discount_percent = 10;
  p.start_date = null;
  p.end_date = null;
  p.weekdays = null;
  p.enabled = true;
  p.created_at = new Date("2026-07-01T00:00:00Z");
  p.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(p, overrides);
}

describe("PromotionResolverService", () => {
  let service: PromotionResolverService;
  let promoRepo: jest.Mocked<Pick<PromotionRepositoryPort, "findActiveByProductIds">>;

  beforeEach(async () => {
    promoRepo = {
      findActiveByProductIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionResolverService,
        { provide: PromotionRepositoryPort, useValue: promoRepo },
      ],
    }).compile();

    service = module.get(PromotionResolverService);
  });

  describe("resolveForSaleItems", () => {
    it("returns empty array when no promotions exist", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await service.resolveForSaleItems([
        { productId: "prod-1", unitPrice: "100.00", quantity: 2 },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeNull();
    });

    it("applies percentage discount correctly", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-10pct",
          name: "Product percentage",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-07-01"),
          end_date: new Date("2026-07-31"),
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 2 }],
        new Date("2026-07-15T12:00:00-03:00"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        promotionId: "promo-10pct",
        type: "percentage",
        discountAmount: "20.00", // 100 * 2 * 10% = 20.00
        applied_promotions: [
          {
            promotion_id: "promo-10pct",
            promotion_scope: "product",
            promotion_type: "percentage",
            discount_amount: "20.00",
          },
        ],
      });
    });

    it("applies 2x1 discount correctly for odd quantity", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-2x1",
          name: "Product 2x1",
          scope: "product",
          product_id: "prod-1",
          type: "two_x_one",
          start_date: new Date("2026-07-01"),
          end_date: new Date("2026-07-31"),
          discount_percent: null,
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "50.00", quantity: 3 }],
        new Date("2026-07-15T00:00:00Z"),
      );

      expect(result[0]).toEqual({
        promotionId: "promo-2x1",
        type: "two_x_one",
        discountAmount: "50.00", // floor(3/2) * 50 = 1 * 50
        applied_promotions: [
          {
            promotion_id: "promo-2x1",
            promotion_scope: "product",
            promotion_type: "two_x_one",
            discount_amount: "50.00",
          },
        ],
      });
    });

    it("applies 2x1 discount correctly for even quantity", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-2x1",
          product_id: "prod-1",
          type: "two_x_one",
          discount_percent: null,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "40.00", quantity: 4 }],
        new Date("2026-07-15T00:00:00Z"),
      );

      expect(result[0]?.discountAmount).toBe("80.00"); // floor(4/2) * 40 = 2 * 40
    });

    it("does not apply 2x1 when quantity is 1", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-2x1",
          product_id: "prod-1",
          type: "two_x_one",
          discount_percent: null,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 1 }],
        new Date("2026-07-15T00:00:00Z"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBeNull(); // floor(1/2) = 0 discount
    });

    it("picks max discount winner when multiple promotions overlap", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-10pct",
          name: "Product percentage",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-2x1",
          name: "Product 2x1",
          scope: "product",
          product_id: "prod-1",
          type: "two_x_one",
          discount_percent: null,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      // For qty=3 at price=100:
      // 10%: 100 * 3 * 0.10 = 30.00
      // 2x1: floor(3/2) * 100 = 100.00
      // Winner: 2x1 (100 > 30)
      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 3 }],
      );

      expect(result[0]).toEqual({
        promotionId: "promo-2x1",
        type: "two_x_one",
        discountAmount: "100.00",
        applied_promotions: [
          {
            promotion_id: "promo-2x1",
            promotion_scope: "product",
            promotion_type: "two_x_one",
            discount_amount: "100.00",
          },
        ],
      });
    });

    it("percentage wins tie-break when discount is equal", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-pct",
          name: "Product percentage",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 50,
          updated_at: new Date("2026-07-01T00:00:00Z"),
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-2x1",
          name: "Product 2x1",
          scope: "product",
          product_id: "prod-1",
          type: "two_x_one",
          discount_percent: null,
          updated_at: new Date("2026-07-01T00:00:00Z"),
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      // For qty=2 at price=100:
      // 50%: 100 * 2 * 0.50 = 100.00
      // 2x1: floor(2/2) * 100 = 100.00
      // Tie: percentage wins
      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 2 }],
      );

      expect(result[0]?.promotionId).toBe("promo-pct");
    });

    it("handles per-product resolution with multiple products", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-a",
          name: "Product A",
          scope: "product",
          product_id: "prod-a",
          type: "percentage",
          discount_percent: 5,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-b",
          name: "Product B",
          scope: "product",
          product_id: "prod-b",
          type: "two_x_one",
          discount_percent: null,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      const result = await service.resolveForSaleItems([
        { productId: "prod-a", unitPrice: "200.00", quantity: 1 },
        { productId: "prod-b", unitPrice: "50.00", quantity: 3 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]?.discountAmount).toBe("10.00"); // 5% of 200
      expect(result[1]?.discountAmount).toBe("50.00"); // floor(3/2)*50
    });

    it("stacks store-wide promotions with a product-specific promotion", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-store-10",
          name: "Store wide 10%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-product-20",
          name: "Product 20%",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 20,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
          updated_at: new Date("2026-07-02T00:00:00Z"),
        }),
      ]);

      const result = await service.resolveForSaleItems([
        { productId: "prod-1", unitPrice: "100.00", quantity: 2 },
      ], new Date("2026-07-15T12:00:00-03:00"));

      expect(result[0]).toEqual({
        promotionId: "promo-product-20",
        type: "percentage",
        discountAmount: "60.00",
        applied_promotions: [
          {
            promotion_id: "promo-product-20",
            promotion_scope: "product",
            promotion_type: "percentage",
            discount_amount: "40.00",
          },
          {
            promotion_id: "promo-store-10",
            promotion_scope: "store",
            promotion_type: "percentage",
            discount_amount: "20.00",
          },
        ],
      });
    });

    it("stacks multiple store-wide promotions for every product", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-store-15",
          name: "Store wide 15%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 15,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-store-5",
          name: "Store wide 5%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 5,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
          updated_at: new Date("2026-07-03T00:00:00Z"),
        }),
      ]);

      const result = await service.resolveForSaleItems([
        { productId: "prod-1", unitPrice: "100.00", quantity: 2 },
      ], new Date("2026-07-15T12:00:00-03:00"));

      expect(result[0]).toEqual({
        promotionId: "promo-store-15",
        type: "percentage",
        discountAmount: "40.00",
        applied_promotions: [
          {
            promotion_id: "promo-store-15",
            promotion_scope: "store",
            promotion_type: "percentage",
            discount_amount: "30.00",
          },
          {
            promotion_id: "promo-store-5",
            promotion_scope: "store",
            promotion_type: "percentage",
            discount_amount: "10.00",
          },
        ],
      });
    });

    it("evaluates date-range schedule by Buenos Aires timezone", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-tz",
          name: "Timezone promotion",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-07-06T00:00:00-03:00"), // ARG midnight
          end_date: new Date("2026-07-06T23:59:59-03:00"),
        }),
      ]);

      // 12:00 UTC-3 on July 6 = within range
      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 1 }],
        new Date("2026-07-06T15:00:00Z"), // UTC = 12:00 ARG
      );

      expect(result).toHaveLength(1);
      expect(result[0]).not.toBeNull();
    });

    it("excludes promotions outside date range", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-expired",
          name: "Expired promotion",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-06-01"),
          end_date: new Date("2026-06-30"),
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 1 }],
        new Date("2026-07-15T00:00:00Z"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBeNull();
    });

    it("matches weekday recurrence by Buenos Aires day", async () => {
      // July 1 2026 is a Wednesday in ARG (TZ offset: -03:00)
      // Wednesday = day 3 in our system (1=Mon, 7=Sun)
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-wed",
          name: "Wednesday promotion",
          scope: "product",
          product_id: "prod-1",
          type: "two_x_one",
          discount_percent: null,
          weekdays: [3], // Wednesday
        }),
      ]);

      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "50.00", quantity: 2 }],
        new Date("2026-07-01T15:00:00Z"), // UTC Wed 15:00 = ARG Wed 12:00
      );

      expect(result).toHaveLength(1);
      expect(result[0]).not.toBeNull();
    });

    it("excludes promotion when weekday does not match", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-mon",
          name: "Monday promotion",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          weekdays: [1], // Monday only
        }),
      ]);

      // July 1 2026 is a Wednesday
      const result = await service.resolveForSaleItems(
        [{ productId: "prod-1", unitPrice: "100.00", quantity: 1 }],
        new Date("2026-07-01T15:00:00Z"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBeNull();
    });

    it("defaults now to current Buenos Aires time when not provided", async () => {
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-now",
          name: "Everyday promotion",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          weekdays: [1, 2, 3, 4, 5, 6, 7], // Every day
        }),
      ]);

      const result = await service.resolveForSaleItems([
        { productId: "prod-1", unitPrice: "100.00", quantity: 1 },
      ]);

      // Should resolve since today should match one of the 7 days
      expect(result).toHaveLength(1);
      expect(result[0]).not.toBeNull();
    });

    it("regression: two lines of the same product get independent resolved promotions", async () => {
      // Product-specific 10% promo + store-wide 5% promo
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-product-10",
          name: "Product 10%",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
        buildPromotion({
          id: "promo-store-5",
          name: "Store 5%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 5,
          start_date: new Date("2026-01-01"),
          end_date: new Date("2026-12-31"),
        }),
      ]);

      // Two lines of the same product with different quantities and prices
      const result = await service.resolveForSaleItems(
        [
          { productId: "prod-1", unitPrice: "100.00", quantity: 2 },
          { productId: "prod-1", unitPrice: "100.00", quantity: 4 },
        ],
        new Date("2026-07-15T12:00:00-03:00"),
      );

      // Result is a parallel array: result[0] matches item[0], result[1] matches item[1]
      expect(result).toHaveLength(2);

      // Line 0: qty=2 → product 10% = 100*2*0.10 = 20.00, store 5% = 100*2*0.05 = 10.00
      expect(result[0]).not.toBeNull();
      const line0 = result[0]!;
      const line0StorePromo = line0.applied_promotions.find(
        (p) => p.promotion_id === "promo-store-5",
      );
      const line0ProductPromo = line0.applied_promotions.find(
        (p) => p.promotion_id === "promo-product-10",
      );
      expect(line0StorePromo?.discount_amount).toBe("10.00");
      expect(line0ProductPromo?.discount_amount).toBe("20.00");
      expect(line0.discountAmount).toBe("30.00");

      // Line 1: qty=4 → product 10% = 100*4*0.10 = 40.00, store 5% = 100*4*0.05 = 20.00
      expect(result[1]).not.toBeNull();
      const line1 = result[1]!;
      const line1StorePromo = line1.applied_promotions.find(
        (p) => p.promotion_id === "promo-store-5",
      );
      const line1ProductPromo = line1.applied_promotions.find(
        (p) => p.promotion_id === "promo-product-10",
      );
      expect(line1StorePromo?.discount_amount).toBe("20.00");
      expect(line1ProductPromo?.discount_amount).toBe("40.00");
      expect(line1.discountAmount).toBe("60.00");

      // Verify no metadata bleed: each line has its own independent applied_promotions array
      expect(line0.applied_promotions).not.toBe(line1.applied_promotions);
      expect(line0.discountAmount).not.toBe(line1.discountAmount);
    });
  });
});
