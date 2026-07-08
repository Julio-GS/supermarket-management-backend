import { Promotion, PromotionType } from "./promotion.entity";

describe("Promotion (domain entity)", () => {
  describe("Promotion entity", () => {
    it("can be constructed with all fields for a product promotion", () => {
      const now = new Date();
      const promotion = new Promotion() as Promotion & {
        name: string;
        description: string | null;
        scope: string;
        product_id: string | null;
      };
      promotion.id = "promo-1";
      promotion.name = "Weekend special";
      promotion.description = "10% off on selected products";
      promotion.scope = "product";
      promotion.product_id = "prod-1";
      promotion.type = PromotionType.PERCENTAGE;
      promotion.discount_percent = 10;
      promotion.start_date = new Date("2026-07-01");
      promotion.end_date = new Date("2026-07-31");
      promotion.weekdays = null;
      promotion.enabled = true;
      promotion.created_at = now;
      promotion.updated_at = now;

      expect(promotion.id).toBe("promo-1");
      expect(promotion.name).toBe("Weekend special");
      expect(promotion.description).toBe("10% off on selected products");
      expect(promotion.scope).toBe("product");
      expect(promotion.product_id).toBe("prod-1");
      expect(promotion.type).toBe("percentage");
      expect(promotion.discount_percent).toBe(10);
      expect(promotion.start_date).toEqual(new Date("2026-07-01"));
      expect(promotion.end_date).toEqual(new Date("2026-07-31"));
      expect(promotion.weekdays).toBeNull();
      expect(promotion.enabled).toBe(true);
      expect(promotion.created_at).toBe(now);
      expect(promotion.updated_at).toBe(now);
    });

    it("supports store-wide promotions with null product_id", () => {
      const promotion = new Promotion() as unknown as Omit<Promotion, "product_id"> & {
        name: string;
        description: string | null;
        scope: string;
        product_id: string | null;
      };
      promotion.id = "promo-2";
      promotion.name = "Sunday store-wide";
      promotion.description = null;
      promotion.scope = "store";
      promotion.product_id = null;
      promotion.type = PromotionType.TWO_X_ONE;
      promotion.discount_percent = null;
      promotion.start_date = null;
      promotion.end_date = null;
      promotion.weekdays = [7];
      promotion.enabled = true;

      expect(promotion.scope).toBe("store");
      expect(promotion.product_id).toBeNull();
      expect(promotion.name).toBe("Sunday store-wide");
      expect(promotion.description).toBeNull();
    });

    it("supports weekday-only schedule with null date range", () => {
      const promotion = new Promotion() as Promotion & {
        name: string;
        description: string | null;
        scope: string;
        product_id: string | null;
      };
      promotion.id = "promo-2";
      promotion.name = "Weekday deal";
      promotion.description = null;
      promotion.scope = "product";
      promotion.product_id = "prod-2";
      promotion.type = PromotionType.TWO_X_ONE;
      promotion.discount_percent = null;
      promotion.start_date = null;
      promotion.end_date = null;
      promotion.weekdays = [1, 3, 5]; // Mon, Wed, Fri
      promotion.enabled = true;

      expect(promotion.type).toBe("two_x_one");
      expect(promotion.discount_percent).toBeNull();
      expect(promotion.weekdays).toEqual([1, 3, 5]);
    });

    it("supports disabled state for soft-delete", () => {
      const promotion = new Promotion() as Promotion & {
        name: string;
        description: string | null;
        scope: string;
        product_id: string | null;
      };
      promotion.id = "promo-3";
      promotion.name = "Disabled deal";
      promotion.description = "No longer active";
      promotion.scope = "product";
      promotion.product_id = "prod-3";
      promotion.type = PromotionType.PERCENTAGE;
      promotion.discount_percent = 15;
      promotion.enabled = false;

      expect(promotion.enabled).toBe(false);
    });
  });
});
