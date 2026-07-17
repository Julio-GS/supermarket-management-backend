import { AdjustStockUseCase } from "./adjust-stock.use-case";
import { InventoryRepositoryPort } from "./inventory.repository.port";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { StockMovement } from "../domain/inventory.entity";
import { Product } from "../../products/domain/product.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

describe("AdjustStockUseCase", () => {
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;
  let products: jest.Mocked<ProductRepositoryPort>;
  let useCase: AdjustStockUseCase;

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
    useCase = new AdjustStockUseCase(inventoryRepo, products);
  });

  it("adjusts stock for a product that manages stock", async () => {
    const product = makeProduct({ maneja_stock: true });
    products.findById.mockResolvedValue(product);
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
    const product = makeProduct({ maneja_stock: false });
    products.findById.mockResolvedValue(product);

    await expect(
      useCase.execute({ product_id: "prod-1", quantity: 10 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when product does not exist", async () => {
    products.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ product_id: "nonexistent", quantity: 10 }),
    ).rejects.toThrow(NotFoundError);
  });
});
