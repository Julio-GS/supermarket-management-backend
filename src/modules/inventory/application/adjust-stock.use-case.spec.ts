import { AdjustStockUseCase } from "./adjust-stock.use-case";
import { InventoryRepositoryPort } from "./inventory.repository.port";
import { StockProductLookupPort } from "./stock-product-lookup.port";
import { StockMovement } from "../domain/inventory.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

describe("AdjustStockUseCase", () => {
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;
  let productLookup: jest.Mocked<StockProductLookupPort>;
  let useCase: AdjustStockUseCase;

  function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
    const m = new StockMovement();
    m.id = "mov-1";
    m.product_id = "prod-1";
    m.quantity = 10;
    m.type = "adjustment";
    m.reference_id = null;
    m.previous_stock = 20;
    m.new_stock = 30;
    m.reason = null;
    m.created_at = new Date();
    Object.assign(m, overrides);
    return m;
  }

  beforeEach(() => {
    inventoryRepo = {
      findBalance: jest.fn(),
      findAllBalances: jest.fn(),
      findBalancesByIds: jest.fn(),
      createBalance: jest.fn(),
      adjustBalance: jest.fn(),
      findMovementsByProduct: jest.fn(),
          getStockForProducts: jest.fn(),
    };
    productLookup = {
      findById: jest.fn(),
    };
    useCase = new AdjustStockUseCase(inventoryRepo, productLookup);
  });

  it("adjusts stock for a product that manages stock", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    const movement = makeMovement({ quantity: -5, previous_stock: 20, new_stock: 15 });
    inventoryRepo.adjustBalance.mockResolvedValue(movement);

    const result = await useCase.execute({
      product_id: "prod-1",
      quantity: -5,
      reason: "damaged",
    });

    expect(result).toEqual(movement);
    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1",
      -5,
      "adjustment",
      undefined,
      "damaged",
    );
  });

  it("rejects non-integer quantity", async () => {
    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 1.5 }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects adjustment for a product that does not manage stock", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: false });

    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 10 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when product does not exist", async () => {
    productLookup.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ product_id: "nonexistent", quantity: 10 }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects zero quantity", async () => {
    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 0 }),
    ).rejects.toThrow(ValidationError);
  });

  it("normalizes absent reason to null", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({ product_id: "prod-1", quantity: 5 });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, null,
    );
  });

  it("normalizes null reason to null", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({
      product_id: "prod-1",
      quantity: 5,
      reason: null as unknown as string,
    });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, null,
    );
  });

  it("normalizes empty string reason to null", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({ product_id: "prod-1", quantity: 5, reason: "" });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, null,
    );
  });

  it("normalizes whitespace-only reason to null", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({ product_id: "prod-1", quantity: 5, reason: "   " });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, null,
    );
  });

  it("preserves nonblank reason exactly", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({
      product_id: "prod-1",
      quantity: 5,
      reason: "Recepción mercadería",
    });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, "Recepción mercadería",
    );
  });

  it("allows adjustment that results in negative balance", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    const movement = makeMovement({
      quantity: -10,
      previous_stock: 3,
      new_stock: -7,
    });
    inventoryRepo.adjustBalance.mockResolvedValue(movement);

    const result = await useCase.execute({ product_id: "prod-1", quantity: -10 });

    expect(result.new_stock).toBe(-7);
  });

  it("allows further negative adjustment on already negative balance", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    const movement = makeMovement({
      quantity: -3,
      previous_stock: -2,
      new_stock: -5,
    });
    inventoryRepo.adjustBalance.mockResolvedValue(movement);

    const result = await useCase.execute({ product_id: "prod-1", quantity: -3 });

    expect(result.new_stock).toBe(-5);
  });

  it("preserves reason with surrounding spaces exactly", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.adjustBalance.mockResolvedValue(makeMovement());

    await useCase.execute({
      product_id: "prod-1",
      quantity: 5,
      reason: "  real reason  ",
    });

    expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
      "prod-1", 5, "adjustment", undefined, "  real reason  ",
    );
  });

  it("rejects non-integer quantity without calling productLookup", async () => {
    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 1.5 }),
    ).rejects.toThrow(ValidationError);

    expect(productLookup.findById).not.toHaveBeenCalled();
  });

  it("rejects zero quantity without calling productLookup", async () => {
    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 0 }),
    ).rejects.toThrow(ValidationError);

    expect(productLookup.findById).not.toHaveBeenCalled();
  });
});
