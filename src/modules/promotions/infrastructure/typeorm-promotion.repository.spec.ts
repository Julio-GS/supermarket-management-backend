import { Repository } from "typeorm";
import { TypeOrmPromotionRepository } from "./typeorm-promotion.repository";
import { PromotionEntity } from "./typeorm-promotion.entity";
import { Promotion } from "../domain/promotion.entity";

describe("TypeOrmPromotionRepository", () => {
  let promotionRepo: jest.Mocked<Pick<Repository<PromotionEntity>, "create" | "save" | "find" | "findOne" | "findBy" | "update">>;
  let repository: TypeOrmPromotionRepository;

  beforeEach(() => {
    promotionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findBy: jest.fn(),
      update: jest.fn(),
    };

    repository = new TypeOrmPromotionRepository(
      promotionRepo as unknown as Repository<PromotionEntity>,
    );
  });

  describe("create", () => {
    it("persists a percentage promotion and returns the domain model", async () => {
      const savedEntity = {
        id: "promo-id",
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-1",
        type: "percentage",
        discount_percent: 10,
        start_date: new Date("2026-07-01"),
        end_date: new Date("2026-07-31"),
        weekdays: null,
        enabled: true,
        created_at: new Date("2026-07-01T00:00:00Z"),
        updated_at: new Date("2026-07-01T00:00:00Z"),
      };

      (promotionRepo.create as jest.Mock).mockReturnValue(savedEntity);
      (promotionRepo.save as jest.Mock).mockResolvedValue(savedEntity);

      const result = await repository.create({
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-1",
        type: "percentage",
        discount_percent: 10,
        start_date: new Date("2026-07-01"),
        end_date: new Date("2026-07-31"),
      });

      expect(promotionRepo.create).toHaveBeenCalledWith({
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-1",
        type: "percentage",
        discount_percent: 10,
        start_date: new Date("2026-07-01"),
        end_date: new Date("2026-07-31"),
        weekdays: null,
      });
      expect(promotionRepo.save).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Promotion);
      expect(result.id).toBe("promo-id");
      expect(result.type).toBe("percentage");
      expect(result.discount_percent).toBe(10);
    });

    it("persists a store-wide promotion with a null product reference", async () => {
      const savedEntity = {
        id: "promo-store",
        name: "Sunday store-wide",
        description: null,
        scope: "store",
        product_id: null,
        type: "two_x_one",
        discount_percent: null,
        start_date: null,
        end_date: null,
        weekdays: [7],
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (promotionRepo.create as jest.Mock).mockReturnValue(savedEntity);
      (promotionRepo.save as jest.Mock).mockResolvedValue(savedEntity);

      const result = await repository.create({
        name: "Sunday store-wide",
        description: null,
        scope: "store",
        product_id: null,
        type: "two_x_one",
        weekdays: [7],
      });

      const storeWide = result as unknown as Omit<Promotion, "product_id"> & {
        scope: string;
        product_id: string | null;
      };

      expect(promotionRepo.create).toHaveBeenCalledWith({
        name: "Sunday store-wide",
        description: null,
        scope: "store",
        product_id: null,
        type: "two_x_one",
        discount_percent: null,
        start_date: null,
        end_date: null,
        weekdays: [7],
      });
      expect(storeWide.scope).toBe("store");
      expect(storeWide.product_id).toBeNull();
    });

    it("persists a 2x1 promotion without discount_percent", async () => {
      const savedEntity = {
        id: "promo-2x1",
        name: "Weekday 2x1",
        description: null,
        scope: "product",
        product_id: "prod-2",
        type: "two_x_one",
        discount_percent: null,
        start_date: null,
        end_date: null,
        weekdays: [1, 3, 5],
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (promotionRepo.create as jest.Mock).mockReturnValue(savedEntity);
      (promotionRepo.save as jest.Mock).mockResolvedValue(savedEntity);

      const result = await repository.create({
        name: "Weekday 2x1",
        description: null,
        scope: "product",
        product_id: "prod-2",
        type: "two_x_one",
        weekdays: [1, 3, 5],
      });

      expect(result.type).toBe("two_x_one");
      expect(result.discount_percent).toBeNull();
      expect(result.weekdays).toEqual([1, 3, 5]);
    });
  });

  describe("findById", () => {
    it("returns domain model when found", async () => {
      const entity = {
        id: "promo-id",
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-1",
        type: "percentage",
        discount_percent: 10,
        start_date: null,
        end_date: null,
        weekdays: null,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (promotionRepo.findOne as jest.Mock).mockResolvedValue(entity);

      const result = await repository.findById("promo-id");

      expect(result).toBeInstanceOf(Promotion);
      expect(result?.id).toBe("promo-id");
      expect(promotionRepo.findOne).toHaveBeenCalledWith({
        where: { id: "promo-id" },
      });
    });

    it("returns null when not found", async () => {
      (promotionRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById("missing-id");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("returns all promotions sorted by created_at DESC", async () => {
      const entities = [
        {
          id: "p2", name: "Store wide", description: null, scope: "store", product_id: null, type: "two_x_one",
          discount_percent: null, start_date: null, end_date: null,
          weekdays: null, enabled: true,
          created_at: new Date("2026-07-02"), updated_at: new Date(),
        },
        {
          id: "p1", name: "Product promotion", description: null, scope: "product", product_id: "prod-1", type: "percentage",
          discount_percent: 15, start_date: null, end_date: null,
          weekdays: null, enabled: true,
          created_at: new Date("2026-07-01"), updated_at: new Date(),
        },
      ];

      (promotionRepo.find as jest.Mock).mockResolvedValue(entities);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("p2");
      expect(result[1].id).toBe("p1");
      expect(promotionRepo.find).toHaveBeenCalledWith({
        order: { created_at: "DESC" },
      });
    });
  });

  describe("findActiveByProductIds", () => {
    it("finds active promotions for given product IDs", async () => {
      const promotionEntities = [
        {
          id: "p1", name: "Store wide", description: null, scope: "store", product_id: null, type: "percentage",
          discount_percent: 10, start_date: new Date("2026-07-01"),
          end_date: new Date("2026-07-31"), weekdays: null, enabled: true,
          created_at: new Date(), updated_at: new Date(),
        },
        {
          id: "p2", name: "Product wide", description: null, scope: "product", product_id: "prod-1", type: "percentage",
          discount_percent: 10, start_date: new Date("2026-07-01"),
          end_date: new Date("2026-07-31"), weekdays: null, enabled: true,
          created_at: new Date(), updated_at: new Date(),
        },
      ];

      (promotionRepo.find as jest.Mock).mockResolvedValue(promotionEntities);

      const result = await repository.findActiveByProductIds(
        ["prod-1", "prod-2"],
        new Date("2026-07-15T12:00:00Z"),
      );

      expect(result).toHaveLength(2);
      expect(result.map((promotion) => promotion.id)).toEqual(["p1", "p2"]);
      expect(promotionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([
            expect.objectContaining({ scope: "store" }),
            expect.objectContaining({ scope: "product" }),
          ]),
        }),
      );
    });

    it("excludes disabled promotions", async () => {
      const disabledEntity = {
        id: "p1", name: "Disabled", description: null, scope: "product", product_id: "prod-1", type: "percentage",
        discount_percent: 10, start_date: null, end_date: null,
        weekdays: null, enabled: false,
        created_at: new Date(), updated_at: new Date(),
      };

      (promotionRepo.find as jest.Mock).mockResolvedValue([disabledEntity]);

      const result = await repository.findActiveByProductIds(["prod-1"]);

      expect(result).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates fields and returns refreshed domain model", async () => {
      const originalEntity = {
        id: "promo-id", name: "Weekend special", description: "10% off selected products", scope: "product", product_id: "prod-1", type: "percentage",
        discount_percent: 10, start_date: null, end_date: null,
        weekdays: null, enabled: true,
        created_at: new Date(), updated_at: new Date(),
      };
      const updatedEntity = {
        ...originalEntity,
        discount_percent: 20,
        enabled: false,
        updated_at: new Date(),
      };

      (promotionRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(originalEntity)  // first call: find for existence
        .mockResolvedValueOnce(updatedEntity);   // second call: re-fetch after update
      (promotionRepo.update as jest.Mock).mockResolvedValue(undefined);

      const result = await repository.update("promo-id", {
        name: "Updated weekend special",
        description: "Updated description",
        scope: "store",
        product_id: null,
        discount_percent: 20,
        enabled: false,
      });

      expect(result).not.toBeNull();
      expect(result?.discount_percent).toBe(20);
      expect(result?.enabled).toBe(false);
    });

    it("returns null when promotion does not exist", async () => {
      (promotionRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.update("missing-id", { enabled: false });

      expect(result).toBeNull();
      expect(promotionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("disable", () => {
    it("sets enabled to false", async () => {
      (promotionRepo.update as jest.Mock).mockResolvedValue(undefined);

      await repository.disable("promo-id");

      expect(promotionRepo.update).toHaveBeenCalledWith(
        "promo-id",
        { enabled: false },
      );
    });
  });
});
