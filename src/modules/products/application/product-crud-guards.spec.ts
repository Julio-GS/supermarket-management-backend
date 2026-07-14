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
          CreateProductUseCase,
          { provide: ProductRepositoryPort, useValue: products },
          { provide: ReadCachePort, useValue: cache },
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
        }),
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
        }),
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
      });

      expect(result.codigos).toEqual(["ABC123"]);
      expect(products.create).toHaveBeenCalled();
    });
  });

  describe("UpdateProductUseCase — protected product guard", () => {
    let useCase: UpdateProductUseCase;
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
          UpdateProductUseCase,
          { provide: ProductRepositoryPort, useValue: products },
          { provide: ReadCachePort, useValue: cache },
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
