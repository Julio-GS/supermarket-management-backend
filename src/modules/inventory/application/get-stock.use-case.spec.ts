import { GetStockUseCase } from "./get-stock.use-case";
import { InventoryRepositoryPort } from "./inventory.repository.port";
import { StockProductLookupPort } from "./stock-product-lookup.port";
import { InventoryBalance } from "../domain/inventory.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";

describe("GetStockUseCase", () => {
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;
  let productLookup: jest.Mocked<StockProductLookupPort>;
  let useCase: GetStockUseCase;

  function makeBalance(productId: string, stockActual: number): InventoryBalance {
    const b = new InventoryBalance();
    b.product_id = productId;
    b.stock_actual = stockActual;
    b.updated_at = new Date();
    return b;
  }

  beforeEach(() => {
    inventoryRepo = {
      findBalance: jest.fn(),
      findAllBalances: jest.fn(),
      findBalancesByIds: jest.fn(),
      createBalance: jest.fn(),
      adjustBalance: jest.fn(),
      findMovementsByProduct: jest.fn(),
    };
    productLookup = {
      findById: jest.fn(),
    };
    useCase = new GetStockUseCase(inventoryRepo, productLookup);
  });

  it("returns stock_actual for a product that manages stock", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.findBalance.mockResolvedValue(makeBalance("prod-1", 42));

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: 42 });
  });

  it("returns 0 when a stock-tracked product has no balance yet", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: true });
    inventoryRepo.findBalance.mockResolvedValue(null);

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: 0 });
  });

  it("returns null for a product that does not manage stock", async () => {
    productLookup.findById.mockResolvedValue({ id: "prod-1", maneja_stock: false });

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: null });
    expect(inventoryRepo.findBalance).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when product does not exist", async () => {
    productLookup.findById.mockResolvedValue(null);

    await expect(useCase.execute("nonexistent")).rejects.toThrow(NotFoundError);
  });
});
