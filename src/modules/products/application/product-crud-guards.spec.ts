import { Test, TestingModule } from "@nestjs/testing";
import { CreateProductUseCase } from "./create-product.use-case";
import { UpdateProductUseCase } from "./update-product.use-case";
import { DeleteProductUseCase } from "./delete-product.use-case";
import { ProductRepositoryPort } from "./product.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Product } from "../domain/product.entity";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { AutoLabelJobService } from "../../label-printer/application/auto-label-job.service";
import { ProductCreateIdempotencyRepositoryPort } from "./product-create-idempotency.repository.port";
import { PrintJobRepositoryPort } from "../../label-printer/application/print-job.repository.port";
import { ProductCreatePayloadCanonicalizer } from "./product-create-payload-canonicalizer";

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

describe("Product CRUD Guards", () => {
  describe("CreateProductUseCase — reserved code rejection", () => {
    let useCase: CreateProductUseCase;
    let products: jest.Mocked<ProductRepositoryPort>;
    let cache: jest.Mocked<ReadCachePort>;
    let inventory: Pick<InventoryRepositoryPort, "createBalance">;
    let idempotencyRepo: any;
    let printJobRepo: any;
    const transactionRunner = { run: jest.fn((work) => work({ query: jest.fn() })) };

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
      idempotencyRepo = { findByKey: jest.fn(), create: jest.fn() };
      printJobRepo = { create: jest.fn() };
      const canonicalizer = new ProductCreatePayloadCanonicalizer();

      idempotencyRepo.findByKey.mockResolvedValue(null);
      idempotencyRepo.create.mockResolvedValue({} as any);
      printJobRepo.create.mockResolvedValue({ id: 'job-mock', product_id: 'prod-1', sku: 'TEST001', product_name: 'Test', sale_price: '200.00', status: 'pending', source: 'auto', created_at: new Date(), updated_at: new Date() });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CreateProductUseCase,
          { provide: ProductRepositoryPort, useValue: products },
          { provide: ReadCachePort, useValue: cache },
          { provide: InventoryRepositoryPort, useValue: inventory },
          { provide: TransactionRunnerPort, useValue: transactionRunner },
          { provide: ProductCreateIdempotencyRepositoryPort, useValue: idempotencyRepo },
          { provide: PrintJobRepositoryPort, useValue: printJobRepo },
          { provide: ProductCreatePayloadCanonicalizer, useValue: canonicalizer },
        ],
      }).compile();

      useCase = module.get(CreateProductUseCase);
    });

    it("rejects creation when a barcode is a reserved code (1-9)", async () => {
      products.existsAnyBarcode.mockResolvedValue(false);

      await expect(
        useCase.execute({
          detalle: "Should Fail",
          costo_neto: "100.00",
          costo_final: "200.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "test",
          facturable: true,
          maneja_stock: false,
          codigos: ["1"],
        }, "key-1"),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(products.create).not.toHaveBeenCalled();
    });

    it("rejects creation when any barcode in the list is reserved", async () => {
      products.existsAnyBarcode.mockResolvedValue(false);

      await expect(
        useCase.execute({
          detalle: "Should Fail Too",
          costo_neto: "100.00",
          costo_final: "200.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "test",
          facturable: true,
          maneja_stock: false,
          codigos: ["ABC123", "9", "XYZ"],
        }, "key-2"),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(products.create).not.toHaveBeenCalled();
    });

    it("allows creation with non-reserved codes", async () => {
      products.existsAnyBarcode.mockResolvedValue(false);
      products.create.mockResolvedValue(buildProduct({ codigos: ["ABC123"] }));

      const result = await useCase.execute({
        detalle: "Valid Product",
        costo_neto: "100.00",
        costo_final: "200.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["ABC123"],
      }, "key-3");

      expect(result.codigos).toEqual(["ABC123"]);
      expect(products.create).toHaveBeenCalled();
    });

    it("initializes a balance for a stock-managed product", async () => {
      products.existsAnyBarcode.mockResolvedValue(false);
      products.create.mockResolvedValue(buildProduct({ maneja_stock: true }));

      await useCase.execute({
        detalle: "Tracked Product", cambio_costo: "2024-01-01", cambio_precio: "2024-01-01",
        etiqueta: "test", facturable: true, maneja_stock: true, codigos: ["TRACKED"],
      }, "key-4");

      expect(inventory.createBalance).toHaveBeenCalledWith("prod-1", 0, expect.anything());
      expect(transactionRunner.run).toHaveBeenCalled();
    });
  });

  describe("UpdateProductUseCase — protected product guard", () => {
    let useCase: UpdateProductUseCase;
    let products: jest.Mocked<ProductRepositoryPort>;
    let cache: jest.Mocked<ReadCachePort>;
    let inventory: Pick<InventoryRepositoryPort, "findBalance" | "createBalance">;
    let autoLabel: jest.Mocked<AutoLabelJobService>;
    const transactionRunner = { run: jest.fn((work) => work({ query: jest.fn() })) };

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
      inventory = { findBalance: jest.fn(), createBalance: jest.fn() };
      autoLabel = { onProductPriceChanged: jest.fn() } as any;

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

    it("rejects barcode change for a protected product", async () => {
      const protectedProduct = buildProduct({
        is_protected: true,
        pricing_mode: "manual",
        codigos: ["1"],
      });
      products.findById.mockResolvedValue(protectedProduct);

      await expect(
        useCase.execute(protectedProduct.id, { codigos: ["NEWCODE"] }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(products.update).not.toHaveBeenCalled();
    });

    it("allows non-codigos edit on a protected product", async () => {
      const protectedProduct = buildProduct({
        is_protected: true,
        pricing_mode: "manual",
        codigos: ["1"],
      });
      products.findById.mockResolvedValue(protectedProduct);
      const updated = buildProduct({ detalle: "Updated Name", is_protected: true });
      products.update.mockResolvedValue(updated);

      const result = await useCase.execute(protectedProduct.id, {
        detalle: "Updated Name",
      });

      expect(result.detalle).toBe("Updated Name");
      expect(products.update).toHaveBeenCalled();
    });

    it("rejects reserved codes on non-protected products", async () => {
      const normalProduct = buildProduct({ is_protected: false });
      products.findById.mockResolvedValue(normalProduct);

      await expect(
        useCase.execute(normalProduct.id, { codigos: ["3"] }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(products.update).not.toHaveBeenCalled();
    });

    it("initializes a balance when stock tracking is enabled", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(buildProduct({ maneja_stock: true }));
      await useCase.execute(product.id, { maneja_stock: true });

      expect(inventory.createBalance).toHaveBeenCalledWith(product.id, 0, expect.anything());
      expect(transactionRunner.run).toHaveBeenCalled();
    });

    it("triggers auto label job when final sale price changes", async () => {
      const product = buildProduct({ costo_final: "100.00" });
      products.findById.mockResolvedValue(product);
      const updated = buildProduct({ costo_final: "200.00" });
      products.update.mockResolvedValue(updated);

      await useCase.execute(product.id, { costo_final: "200.00" });

      expect(autoLabel.onProductPriceChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: product.id, costo_final: "100.00" }),
        "200.00",
        expect.anything(),
      );
    });

    it("does not trigger auto label job when price is unchanged", async () => {
      const product = buildProduct({ costo_final: "150.00" });
      products.findById.mockResolvedValue(product);
      const updated = buildProduct({ detalle: "New Name", costo_final: "150.00" });
      products.update.mockResolvedValue(updated);

      await useCase.execute(product.id, { detalle: "New Name" });

      expect(autoLabel.onProductPriceChanged).not.toHaveBeenCalled();
    });

    it("triggers auto label job when price changes from null", async () => {
      const product = buildProduct({ costo_final: null });
      products.findById.mockResolvedValue(product);
      const updated = buildProduct({ costo_final: "300.00" });
      products.update.mockResolvedValue(updated);

      await useCase.execute(product.id, { costo_final: "300.00" });

      expect(autoLabel.onProductPriceChanged).toHaveBeenCalledWith(
        expect.objectContaining({ costo_final: null }),
        "300.00",
        expect.anything(),
      );
    });

    it("does not delete or reset the underlying balance when stock tracking is disabled (true→false)", async () => {
      const product = buildProduct({ maneja_stock: true });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: false }),
      );

      await useCase.execute(product.id, { maneja_stock: false });

      // Disabling stock must not touch inventory — balance is preserved
      expect(inventory.createBalance).not.toHaveBeenCalled();
    });

    it("does not create a duplicate balance when stock tracking was already enabled (true→true)", async () => {
      const product = buildProduct({ maneja_stock: true });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: true, detalle: "Updated" }),
      );

      await useCase.execute(product.id, { detalle: "Updated" });

      // No balance creation because stock was already tracked
      expect(inventory.createBalance).not.toHaveBeenCalled();
    });

    it("does not create a balance when stock tracking remains disabled (false→false)", async () => {
      const product = buildProduct({ maneja_stock: false });
      products.findById.mockResolvedValue(product);
      products.update.mockResolvedValue(
        buildProduct({ maneja_stock: false, detalle: "Updated" }),
      );

      await useCase.execute(product.id, { detalle: "Updated" });

      expect(inventory.createBalance).not.toHaveBeenCalled();
    });
  });

  describe("DeleteProductUseCase — protected product guard", () => {
    let useCase: DeleteProductUseCase;
    let products: jest.Mocked<ProductRepositoryPort>;
    let cache: jest.Mocked<ReadCachePort>;

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

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DeleteProductUseCase,
          { provide: ProductRepositoryPort, useValue: products },
          { provide: ReadCachePort, useValue: cache },
        ],
      }).compile();

      useCase = module.get(DeleteProductUseCase);
    });

    it("rejects deletion of a protected product", async () => {
      const protectedProduct = buildProduct({
        is_protected: true,
        pricing_mode: "manual",
      });
      products.findById.mockResolvedValue(protectedProduct);

      await expect(
        useCase.execute(protectedProduct.id),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(products.delete).not.toHaveBeenCalled();
    });

    it("allows deletion of a non-protected product", async () => {
      const normalProduct = buildProduct({ is_protected: false });
      products.findById.mockResolvedValue(normalProduct);

      await useCase.execute(normalProduct.id);

      expect(products.delete).toHaveBeenCalledWith(normalProduct.id);
    });

    it("rejects deletion when product does not exist", async () => {
      products.findById.mockResolvedValue(null);

      await expect(
        useCase.execute("missing-id"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
