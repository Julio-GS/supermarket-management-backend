import { Test, TestingModule } from "@nestjs/testing";
import { UpdatePromotionUseCase } from "./update-promotion.use-case";
import { DeletePromotionUseCase } from "./delete-promotion.use-case";
import { ListPromotionsUseCase } from "./list-promotions.use-case";
import { PromotionRepositoryPort } from "./promotion.repository.port";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";
import { Promotion } from "../domain/promotion.entity";

function makePromo(): Promotion {
  const p = new Promotion() as Promotion & {
    name: string;
    description: string | null;
    scope: string;
    product_id: string | null;
  };
  p.id = "p1";
  p.name = "Weekend special";
  p.description = "10% off selected products";
  p.scope = "product";
  p.product_id = "prod-1";
  p.type = "percentage";
  p.discount_percent = 10;
  p.enabled = true;
  p.created_at = new Date(); p.updated_at = new Date();
  return p;
}

describe("UpdatePromotionUseCase", () => {
  let useCase: UpdatePromotionUseCase;
  let repo: jest.Mocked<Pick<PromotionRepositoryPort, "findById" | "update">>;

  beforeEach(async () => {
    repo = { findById: jest.fn(), update: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdatePromotionUseCase,
        { provide: PromotionRepositoryPort, useValue: repo },
      ],
    }).compile();
    useCase = module.get(UpdatePromotionUseCase);
  });

  it("updates discount_percent", async () => {
    const existing = makePromo();
    repo.findById.mockResolvedValue(existing);
    repo.update.mockResolvedValue({ ...existing, discount_percent: 20 });

    const result = await useCase.execute("p1", { discount_percent: 20 });
    expect(result.discount_percent).toBe(20);
  });

  it("updates a promotion to store scope without a product_id", async () => {
    const existing = makePromo();
    repo.findById.mockResolvedValue(existing);
    repo.update.mockResolvedValue({ ...existing, scope: "store", product_id: null });

    const result = await useCase.execute("p1", { scope: "store" });

    const storeWide = result as unknown as Omit<Promotion, "product_id"> & {
      scope: string;
      product_id: string | null;
    };

    expect(repo.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ scope: "store", product_id: null }),
    );
    expect(storeWide.scope).toBe("store");
    expect(storeWide.product_id).toBeNull();
  });

  it("throws NotFoundError when missing", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute("missing", { enabled: false }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects store scope when a product_id is provided", async () => {
    repo.findById.mockResolvedValue(makePromo());

    await expect(
      useCase.execute("p1", {
        scope: "store",
        product_id: "prod-2",
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects 2x1 with discount_percent", async () => {
    repo.findById.mockResolvedValue(makePromo());
    await expect(
      useCase.execute("p1", { type: "two_x_one", discount_percent: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("DeletePromotionUseCase", () => {
  let useCase: DeletePromotionUseCase;
  let repo: jest.Mocked<Pick<PromotionRepositoryPort, "findById" | "delete">>;

  beforeEach(async () => {
    repo = { findById: jest.fn(), delete: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletePromotionUseCase,
        { provide: PromotionRepositoryPort, useValue: repo },
      ],
    }).compile();
    useCase = module.get(DeletePromotionUseCase);
  });

  it("deletes an existing promotion", async () => {
    repo.findById.mockResolvedValue(makePromo());
    await useCase.execute("p1");
    expect(repo.delete).toHaveBeenCalledWith("p1");
  });

  it("throws NotFoundError when missing", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute("missing"))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ListPromotionsUseCase", () => {
  let useCase: ListPromotionsUseCase;
  let repo: jest.Mocked<Pick<PromotionRepositoryPort, "findAll">>;

  beforeEach(async () => {
    repo = { findAll: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPromotionsUseCase,
        { provide: PromotionRepositoryPort, useValue: repo },
      ],
    }).compile();
    useCase = module.get(ListPromotionsUseCase);
  });

  it("returns all promotions", async () => {
    repo.findAll.mockResolvedValue([makePromo(), makePromo()]);
    const result = await useCase.execute();
    expect(result).toHaveLength(2);
  });
});
