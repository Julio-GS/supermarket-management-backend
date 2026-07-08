import "reflect-metadata";
import { validate, ValidationError } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  PromotionResponseDto,
} from "./promotion.dto";

describe("Promotion DTOs", () => {
  describe("CreatePromotionDto", () => {
    it("validates a valid percentage promotion", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Weekend special",
        description: "10% off selected products",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 10,
        start_date: "2026-07-01",
        end_date: "2026-07-31",
      });

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });

    it("validates a store-wide promotion without product_id", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Sunday store-wide",
        description: "Applies to every product",
        scope: "store",
        type: "two_x_one",
        weekdays: [7],
      });

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });

    it("validates a valid 2x1 promotion without discount_percent", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Weekday deal",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "two_x_one",
        weekdays: [1, 3, 5],
      });

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });

    it("rejects store-wide promotions when a product_id is provided", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Invalid store-wide",
        scope: "store",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 10,
        weekdays: [1],
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects missing product_id for product-scoped promotions", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Missing target",
        type: "percentage",
        discount_percent: 10,
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects invalid promotion type", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Bad type",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "invalid_type",
        discount_percent: 10,
      });

      const errors = await validate(dto as object);
      expect(errors.some((e) => e.property === "type")).toBe(true);
    });

    it("rejects percentage without discount_percent", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Missing discount",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects discount_percent below 1", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Too small",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 0,
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects discount_percent above 99", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Too large",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 100,
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects 2x1 with discount_percent provided", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Invalid 2x1",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "two_x_one",
        discount_percent: 10,
        weekdays: [1],
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects missing schedule (neither date range nor weekdays)", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "No schedule",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 10,
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects date range where start_date > end_date", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Bad dates",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 10,
        start_date: "2026-07-31",
        end_date: "2026-07-01",
      });

      const errors = await validate(dto as object);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects weekdays with values outside 1-7", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Bad weekdays",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "two_x_one",
        weekdays: [0, 3, 8],
      });

      const errors = await validate(dto as object);
      expect(errors.some((e) => e.property === "weekdays")).toBe(true);
    });

    it("validates a promotion with weekday recurrence schedule", async () => {
      const dto = plainToInstance(CreatePromotionDto, {
        name: "Weekday recurrence",
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "percentage",
        discount_percent: 15,
        weekdays: [2, 4, 6],
      });

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });
  });

  describe("UpdatePromotionDto", () => {
    it("allows partial updates with all fields optional", async () => {
      const dto = plainToInstance(UpdatePromotionDto, {
        name: "Updated name",
        discount_percent: 20,
        scope: "store",
      } as Partial<UpdatePromotionDto>);

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });

    it("accepts type change", async () => {
      const dto = plainToInstance(UpdatePromotionDto, {
        name: "Updated promotion",
        type: "two_x_one",
        discount_percent: null,
        weekdays: [1, 3, 5],
      } as Partial<UpdatePromotionDto>);

      const errors = await validate(dto as object);
      expect(errors).toHaveLength(0);
    });

    it("rejects invalid discount_percent range on update", async () => {
      const dto = plainToInstance(UpdatePromotionDto, {
        discount_percent: 150,
      } as Partial<UpdatePromotionDto>);

      const errors = await validate(dto as object);
      expect(errors.some((e) => e.property === "discount_percent")).toBe(true);
    });
  });

  describe("PromotionResponseDto", () => {
    it("has all expected fields", () => {
      const dto = Object.assign(new PromotionResponseDto(), {
        id: "promo-id",
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-id",
        type: "percentage",
        discount_percent: 10,
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        weekdays: null,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      }) as PromotionResponseDto & {
        name: string;
        description: string | null;
        scope: string;
        product_id: string | null;
      };

      expect(dto.id).toBe("promo-id");
      expect(dto.name).toBe("Weekend special");
      expect(dto.description).toBe("10% off selected products");
      expect(dto.scope).toBe("product");
      expect(dto.product_id).toBe("prod-id");
      expect(dto.type).toBe("percentage");
      expect(dto.discount_percent).toBe(10);
      expect(dto.enabled).toBe(true);
    });
  });
});
