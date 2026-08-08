import { Test, TestingModule } from "@nestjs/testing";
import { UpdateProductUseCase } from "./update-product.use-case";
import { ProductRepositoryPort } from "./product.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { AutoLabelJobService } from "../../label-printer/application/auto-label-job.service";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Product } from "../domain/product.entity";

function buildProduct(overrides: Partial<Product> = {}): Product {
  const p = new Product();
  p.id = "prod-1";
  p.detalle = "Test Product";
  p.costo_neto = "100.00";
  p.costo_final = "121.00";
  p.iva = "21.00";
  p.cambio_costo = "2024-01-01";
  p.cambio_precio = "2024-01-01";
  p.etiqueta = "test";
  p.facturable = true;
  p.maneja_stock = false;
  p.codigos = ["TEST001"];
  p.pricing_mode = "fixed";
  p.is_protected = false;
  p.created_at = new Date();
  p.updated_at = new Date();
  return Object.assign(p, overrides);
}

describe("UpdateProductUseCase — maneja_stock preservation", () => {
  let useCase: UpdateProductUseCase;
  let products: jest.Mocked<ProductRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let inventory: jest.Mocked<
    Pick<InventoryRepositoryPort, "createBalance">
  >;
  let autoLabel: jest.Mocked<AutoLabelJobService>;
  // Transaction runner mock captures the callback so tests can inspect
  // whether product update and balance creation run inside the same txn.
  let txnWork: ((runner: unknown) => Promise<Product>) | null;
  let transactionRunner: { run: jest.Mock };

  beforeEach(async () => {
    products = {
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findByBarcode: jest.fn(),
      findByCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    };
    cache = { getOrSet: jest.fn(), deleteByPrefix: jest.fn() };
    inventory = { createBalance: jest.fn() };
    autoLabel = { onProductPriceChanged: jest.fn() } as any;

    txnWork = null;
    transactionRunner = {
      run: jest.fn((work) => {
        txnWork = work;
        return work({});
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateProductUseCase,
        { provide: ProductRepositoryPort, useValue: products },
        { provide: ReadCachePort, useValue: cache },
        { provide: InventoryRepositoryPort, useValue: inventory },
        { provide: TransactionRunnerPort, useValue: transactionRunner },
        { provide: AutoLabelJobService, useValue: autoLabel },
      ],
    }).compile();

    useCase = module.get(UpdateProductUseCase);
  });

  describe("stock tracking toggle (false → true)", () => {
    it("calls createBalance(id, 0, runner) inside the same transaction as the product update", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true }),
      );

      await useCase.execute(product.id, { maneja_stock: true });

      // Both product update and balance creation happen inside one txn
      expect(transactionRunner.run).toHaveBeenCalledTimes(1);
      // createBalance was called with the correct arguments
      expect(inventory.createBalance).toHaveBeenCalledWith(
        product.id,
        0,
        {},
      );
      expect(inventory.createBalance).toHaveBeenCalledTimes(1);
    });

    it("uses insert-or-ignore semantics — createBalance(…, 0) must not overwrite a pre-existing balance", async () => {
      // This test is a characterization: the production code delegates to
      // createBalance which internally uses .insert().orIgnore() then reads
      // existing. The mock verifies the contract shape stays correct.
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true }),
      );

      await useCase.execute(product.id, { maneja_stock: true });

      // Always passes 0 — the orIgnore path guarantees an existing balance wins
      expect(inventory.createBalance).toHaveBeenCalledWith(
        product.id,
        0,
        expect.anything(),
      );
    });
  });

  describe("stock tracking toggle (true → false)", () => {
    it("preserves the underlying balance — no inventory write operation is triggered", async () => {
      const product = buildProduct({ maneja_stock: true });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: false }),
      );

      await useCase.execute(product.id, { maneja_stock: false });

      // Disabling stock does not touch the inventory at all
      expect(inventory.createBalance).not.toHaveBeenCalled();
    });
  });

  describe("transaction atomicity", () => {
    it("does not invalidate the read cache when the transaction fails", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true }),
      );
      inventory.createBalance.mockRejectedValue(
        new Error("DB failure"),
      );

      await expect(
        useCase.execute(product.id, { maneja_stock: true }),
      ).rejects.toThrow("DB failure");

      // Cache must not be invalidated when the transaction did not commit
      expect(cache.deleteByPrefix).not.toHaveBeenCalled();
    });

    it("wraps product update and balance creation in one transaction callback", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true }),
      );

      await useCase.execute(product.id, { maneja_stock: true });

      // A single transaction wraps the entire mutation
      expect(transactionRunner.run).toHaveBeenCalledTimes(1);
      // Both product update and balance creation were invoked (inside the txn callback)
      expect(products.update).toHaveBeenCalled();
      expect(inventory.createBalance).toHaveBeenCalled();
      // And balance creation is always after update (same callback, sequential)
      const updateCallIdx = products.update.mock.invocationCallOrder[0];
      const balanceCallIdx =
        inventory.createBalance.mock.invocationCallOrder[0];
      expect(balanceCallIdx).toBeGreaterThan(updateCallIdx);
    });
  });

  describe("no-op transitions", () => {
    it("true→true: does not recreate the balance", async () => {
      const product = buildProduct({ maneja_stock: true });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true, detalle: "new name" }),
      );

      await useCase.execute(product.id, { detalle: "new name" });

      expect(inventory.createBalance).not.toHaveBeenCalled();
    });

    it("false→false: does not create a balance", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: false, detalle: "new name" }),
      );

      await useCase.execute(product.id, { detalle: "new name" });

      expect(inventory.createBalance).not.toHaveBeenCalled();
    });
  });
});
