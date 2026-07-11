import { Test, TestingModule } from "@nestjs/testing";
import { PromotionsController } from "./promotions.controller";
import { UpdatePromotionDto } from "./promotion.dto";
import { CreatePromotionUseCase } from "../application/create-promotion.use-case";
import { UpdatePromotionUseCase } from "../application/update-promotion.use-case";
import { DeletePromotionUseCase } from "../application/delete-promotion.use-case";
import { ListPromotionsUseCase } from "../application/list-promotions.use-case";
import { Promotion } from "../domain/promotion.entity";

function buildPromotion(overrides: Partial<Promotion> = {}): Promotion {
  const promotion = new Promotion();
  promotion.id = "promo-id";
  promotion.name = "Weekend special";
  promotion.description = "10% off selected products";
  promotion.scope = "product";
  promotion.product_id = "prod-1";
  promotion.type = "percentage";
  promotion.discount_percent = 10;
  promotion.start_date = new Date("2026-07-01T00:00:00Z");
  promotion.end_date = new Date("2026-07-31T23:59:59Z");
  promotion.weekdays = null;
  promotion.enabled = true;
  promotion.created_at = new Date("2026-07-01T00:00:00Z");
  promotion.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(promotion, overrides);
}

describe("PromotionsController", () => {
  let controller: PromotionsController;
  let createPromotion: jest.Mocked<Pick<CreatePromotionUseCase, "execute">>;
  let updatePromotion: jest.Mocked<Pick<UpdatePromotionUseCase, "execute">>;
  let deletePromotion: jest.Mocked<Pick<DeletePromotionUseCase, "execute">>;
  let listPromotions: jest.Mocked<Pick<ListPromotionsUseCase, "execute">>;

  beforeEach(async () => {
    createPromotion = { execute: jest.fn() };
    updatePromotion = { execute: jest.fn() };
    deletePromotion = { execute: jest.fn() };
    listPromotions = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [
        { provide: CreatePromotionUseCase, useValue: createPromotion },
        { provide: UpdatePromotionUseCase, useValue: updatePromotion },
        { provide: DeletePromotionUseCase, useValue: deletePromotion },
        { provide: ListPromotionsUseCase, useValue: listPromotions },
      ],
    }).compile();

    controller = module.get(PromotionsController);
  });

  describe("update", () => {
    it("keeps omitted schedule fields undefined on partial updates", async () => {
      updatePromotion.execute.mockResolvedValue(buildPromotion());

      await controller.update("promo-id", { enabled: true } as UpdatePromotionDto);

      expect(updatePromotion.execute).toHaveBeenCalledWith(
        "promo-id",
        expect.objectContaining({
          enabled: true,
          start_date: undefined,
          end_date: undefined,
          weekdays: undefined,
        }),
      );
    });

    it("forwards explicit schedule clears without coercing them", async () => {
      updatePromotion.execute.mockResolvedValue(
        buildPromotion({
          start_date: null,
          end_date: null,
          weekdays: [1, 3, 5],
        }),
      );

      await controller.update("promo-id", {
        enabled: true,
        start_date: null,
        end_date: null,
        weekdays: [1, 3, 5],
      } as UpdatePromotionDto);

      expect(updatePromotion.execute).toHaveBeenCalledWith(
        "promo-id",
        expect.objectContaining({
          start_date: null,
          end_date: null,
          weekdays: [1, 3, 5],
        }),
      );
    });
  });
});
