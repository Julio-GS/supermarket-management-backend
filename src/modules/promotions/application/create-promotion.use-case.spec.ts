import { Test, TestingModule } from "@nestjs/testing";
import { CreatePromotionUseCase } from "./create-promotion.use-case";
import {
  PromotionRepositoryPort,
} from "./promotion.repository.port";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Promotion } from "../domain/promotion.entity";

function buildPromotion(overrides: Partial<Promotion> = {}): Promotion {
  const p = new Promotion() as Promotion & {
    name: string;
    description: string | null;
    scope: string;
    product_id: string | null;
  };
  p.id = "promo-id";
  p.name = "Weekend special";
  p.description = "10% off selected products";
  p.scope = "product";
  p.product_id = "prod-1";
  p.type = "percentage";
  p.discount_percent = 10;
  p.enabled = true;
  p.created_at = new Date();
  p.updated_at = new Date();
  return Object.assign(p, overrides);
}

describe("CreatePromotionUseCase", () => {
  let useCase: CreatePromotionUseCase;
  let promoRepo: jest.Mocked<Pick<PromotionRepositoryPort, "create">>;

  beforeEach(async () => {
    promoRepo = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatePromotionUseCase,
        { provide: PromotionRepositoryPort, useValue: promoRepo },
      ],
    }).compile();
    useCase = module.get(CreatePromotionUseCase);
  });

  it("creates a percentage promotion with date range", async () => {
    promoRepo.create.mockResolvedValue(
      buildPromotion({ type: "percentage", discount_percent: 10 }),
    );

    const result = await useCase.execute({
      name: "Weekend special",
      description: "10% off selected products",
      product_id: "prod-1",
      type: "percentage",
      discount_percent: 10,
      start_date: new Date("2026-07-01"),
      end_date: new Date("2026-07-31"),
    });

    expect(result.type).toBe("percentage");
    expect(result.discount_percent).toBe(10);
    expect(promoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Weekend special",
        description: "10% off selected products",
        scope: "product",
        product_id: "prod-1",
      }),
    );
  });

  it("creates a store-wide promotion without product_id", async () => {
    promoRepo.create.mockResolvedValue(
      buildPromotion({
        id: "promo-store",
        name: "Sunday store-wide",
        description: null,
        scope: "store",
        product_id: null,
        type: "two_x_one",
        discount_percent: null,
      }),
    );

    const result = await useCase.execute({
      name: "Sunday store-wide",
      scope: "store",
      type: "two_x_one",
      weekdays: [7],
    });

    const storeWide = result as unknown as Omit<Promotion, "product_id"> & {
      scope: string;
      product_id: string | null;
    };

    expect(storeWide.scope).toBe("store");
    expect(storeWide.product_id).toBeNull();
    expect(promoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sunday store-wide",
        scope: "store",
        product_id: null,
      }),
    );
  });

  it("rejects percentage type without discount_percent", async () => {
    await expect(
      useCase.execute({
        name: "Invalid percentage",
        product_id: "prod-1",
        type: "percentage",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(promoRepo.create).not.toHaveBeenCalled();
  });

  it("rejects 2x1 with discount_percent", async () => {
    await expect(
      useCase.execute({
        name: "Invalid 2x1",
        product_id: "prod-1",
        type: "two_x_one",
        discount_percent: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects missing schedule", async () => {
    await expect(
      useCase.execute({
        name: "Missing schedule",
        product_id: "prod-1",
        type: "percentage",
        discount_percent: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
