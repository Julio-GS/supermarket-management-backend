import { GetStockUseCase } from "./get-stock.use-case";
import { InventoryRepositoryPort } from "./inventory.repository.port";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { InventoryBalance } from "../domain/inventory.entity";
import { Product } from "../../products/domain/product.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";

describe("GetStockUseCase", () => {
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;
  let products: jest.Mocked<ProductRepositoryPort>;
  let useCase: GetStockUseCase;

  function makeProduct(overrides: Partial<Product> = {}): Product {
    const p = new Product();
    p.id = "prod-1";
    p.detalle = "Test Product";
    p.costo_neto = null;
    p.costo_final = "100.00";
    p.iva = "21.00";
    p.cambio_costo = "ARS";
    p.cambio_precio = "ARS";
    p.etiqueta = "test";
    p.facturable = true;
    p.maneja_stock = true;
    p.codigos = ["123"];
    p.pricing_mode = "fixed";
    p.is_protected = false;
    p.created_at = new Date();
    p.updated_at = new Date();
    Object.assign(p, overrides);
    return p;
  }

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
    products = {
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      findByBarcode: jest.fn(),
      findByCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    };
    useCase = new GetStockUseCase(inventoryRepo, products);
  });

  it("returns stock_actual for a product that manages stock", async () => {
    const product = makeProduct({ maneja_stock: true });
    products.findById.mockResolvedValue(product);
    inventoryRepo.findBalance.mockResolvedValue(makeBalance("prod-1", 42));

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: 42 });
  });

  it("returns 0 when a stock-tracked product has no balance yet", async () => {
    const product = makeProduct({ maneja_stock: true });
    products.findById.mockResolvedValue(product);
    inventoryRepo.findBalance.mockResolvedValue(null);

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: 0 });
  });

  it("returns null for a product that does not manage stock", async () => {
    const product = makeProduct({ maneja_stock: false });
    products.findById.mockResolvedValue(product);

    const result = await useCase.execute("prod-1");

    expect(result).toEqual({ stock_actual: null });
    expect(inventoryRepo.findBalance).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when product does not exist", async () => {
    products.findById.mockResolvedValue(null);

    await expect(useCase.execute("nonexistent")).rejects.toThrow(NotFoundError);
  });
});
