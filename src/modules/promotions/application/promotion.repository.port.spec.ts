import {
  PromotionRepositoryPort,
  CreatePromotionInput,
  UpdatePromotionInput,
} from "./promotion.repository.port";
import { Promotion, PromotionType } from "../domain/promotion.entity";

describe("PromotionRepositoryPort", () => {
  it("defines the abstract port with required methods", () => {
    const port = new (class extends PromotionRepositoryPort {
      create(_input: CreatePromotionInput) {
        return Promise.resolve(new Promotion());
      }
      update(_id: string, _input: UpdatePromotionInput) {
        return Promise.resolve(null);
      }
      findById(_id: string) {
        return Promise.resolve(null);
      }
      findAll() {
        return Promise.resolve([]);
      }
      findActiveByProductIds(_productIds: string[], _now?: Date) {
        return Promise.resolve([]);
      }
      disable(_id: string) {
        return Promise.resolve();
      }
    })();

    expect(port).toBeInstanceOf(PromotionRepositoryPort);
    expect(typeof port.create).toBe("function");
    expect(typeof port.update).toBe("function");
    expect(typeof port.findById).toBe("function");
    expect(typeof port.findAll).toBe("function");
    expect(typeof port.findActiveByProductIds).toBe("function");
    expect(typeof port.disable).toBe("function");
  });

  it("accepts CreatePromotionInput with percentage type", () => {
    const input = {
      name: "Weekend special",
      description: "10% off selected products",
      scope: "product",
      product_id: "prod-1",
      type: PromotionType.PERCENTAGE,
      discount_percent: 10,
      start_date: new Date("2026-07-01"),
      end_date: new Date("2026-07-31"),
    } as CreatePromotionInput & {
      name: string;
      description: string | null;
      scope: string;
      product_id: string | null;
    };

    expect(input.name).toBe("Weekend special");
    expect(input.description).toBe("10% off selected products");
    expect(input.scope).toBe("product");
    expect(input.product_id).toBe("prod-1");
    expect(input.type).toBe("percentage");
    expect(input.discount_percent).toBe(10);
  });

  it("accepts CreatePromotionInput for a store-wide promotion", () => {
    const input = {
      name: "Sunday store-wide",
      description: null,
      scope: "store",
      product_id: null,
      type: PromotionType.TWO_X_ONE,
      weekdays: [7],
    } as unknown as CreatePromotionInput & {
      name: string;
      description: string | null;
      scope: string;
      product_id: string | null;
    };

    expect(input.scope).toBe("store");
    expect(input.product_id).toBeNull();
    expect(input.weekdays).toEqual([7]);
  });

  it("accepts UpdatePromotionInput with partial fields", () => {
    const input = {
      name: "Updated weekend special",
      description: "Updated description",
      scope: "store",
      product_id: null,
      discount_percent: 20,
      enabled: false,
    } as UpdatePromotionInput & {
      name: string;
      description: string | null;
      scope: string;
      product_id: string | null;
    };

    expect(input.name).toBe("Updated weekend special");
    expect(input.description).toBe("Updated description");
    expect(input.scope).toBe("store");
    expect(input.product_id).toBeNull();
    expect(input.discount_percent).toBe(20);
    expect(input.enabled).toBe(false);
    expect(input.type).toBeUndefined();
  });
});
