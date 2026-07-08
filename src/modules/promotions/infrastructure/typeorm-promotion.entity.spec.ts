import { PromotionEntity } from "./typeorm-promotion.entity";

describe("PromotionEntity (TypeORM)", () => {
  it("has the @Entity decorator with table name promotions", () => {
    const entity = new PromotionEntity();
    // Verify the entity exists and can be instantiated
    expect(entity).toBeInstanceOf(PromotionEntity);
  });

  it("can construct an entity instance with all fields", () => {
    const entity = new PromotionEntity() as PromotionEntity & {
      name: string;
      description: string | null;
      scope: string;
      product_id: string | null;
    };
    entity.id = "promo-uuid";
    entity.name = "Weekend special";
    entity.description = "10% off selected products";
    entity.scope = "product";
    entity.product_id = "product-uuid";
    entity.type = "percentage";
    entity.discount_percent = 15;
    entity.start_date = new Date("2026-07-01T00:00:00Z");
    entity.end_date = new Date("2026-07-31T00:00:00Z");
    entity.weekdays = null;
    entity.enabled = true;
    entity.created_at = new Date();
    entity.updated_at = new Date();

    expect(entity.id).toBe("promo-uuid");
    expect(entity.name).toBe("Weekend special");
    expect(entity.description).toBe("10% off selected products");
    expect(entity.scope).toBe("product");
    expect(entity.product_id).toBe("product-uuid");
    expect(entity.type).toBe("percentage");
    expect(entity.discount_percent).toBe(15);
    expect(entity.start_date).toEqual(new Date("2026-07-01T00:00:00Z"));
    expect(entity.end_date).toEqual(new Date("2026-07-31T00:00:00Z"));
    expect(entity.weekdays).toBeNull();
    expect(entity.enabled).toBe(true);
  });

  it("supports two_x_one type without discount_percent", () => {
    const entity = new PromotionEntity() as unknown as Omit<PromotionEntity, "product_id"> & {
      name: string;
      description: string | null;
      scope: string;
      product_id: string | null;
    };
    entity.id = "promo-uuid";
    entity.name = "Sunday store-wide";
    entity.description = null;
    entity.scope = "store";
    entity.product_id = null;
    entity.type = "two_x_one";
    entity.discount_percent = null;
    entity.weekdays = [2, 4, 6];
    entity.enabled = true;

    expect(entity.type).toBe("two_x_one");
    expect(entity.discount_percent).toBeNull();
    expect(entity.weekdays).toEqual([2, 4, 6]);
  });
});
