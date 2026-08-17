import { Test, TestingModule } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductResponseDto, UpdateProductDto, CreateProductDto } from "./product.dto";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { ProductReadModelService } from "../application/product-read-model.service";
import { Product } from "../domain/product.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";
import { Page } from "../../../shared/read-model/page";

function buildProductDto(overrides: Partial<ProductResponseDto> = {}): ProductResponseDto {
  return {
    id: "prod-1",
    detalle: "Test Product",
    costo_neto: "100.00",
    costo_final: "200.00",
    iva: "21.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-01",
    etiqueta: "test",
    facturable: true,
    maneja_stock: false,
    codigos: ["TEST001"],
    pricing_mode: "fixed",
    is_protected: false,
    stock_actual: null,
    promotions: null,
    store_promotions: null,
    created_at: new Date("2026-07-01T00:00:00Z"),
    updated_at: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ProductsController", () => {
  let controller: ProductsController;
  let productReadModel: jest.Mocked<
    Pick<ProductReadModelService, "list" | "get" | "getByCode" | "enrich">
  >;
  let createProduct: jest.Mocked<Pick<CreateProductUseCase, "execute">>;
  let updateProduct: jest.Mocked<Pick<UpdateProductUseCase, "execute">>;
  let deleteProduct: jest.Mocked<Pick<DeleteProductUseCase, "execute">>;

  beforeEach(async () => {
    productReadModel = {
      list: jest.fn(),
      get: jest.fn(),
      getByCode: jest.fn(),
      enrich: jest.fn(),
    };
    createProduct = { execute: jest.fn() };
    updateProduct = { execute: jest.fn() };
    deleteProduct = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: CreateProductUseCase, useValue: createProduct },
        { provide: UpdateProductUseCase, useValue: updateProduct },
        { provide: DeleteProductUseCase, useValue: deleteProduct },
        { provide: ProductReadModelService, useValue: productReadModel },
      ],
    }).compile();

    controller = module.get(ProductsController);
  });

  describe("get (single product)", () => {
    it("delegates to productReadModel.get and returns the result", async () => {
      const dto = buildProductDto({ id: "prod-1" });
      productReadModel.get.mockResolvedValue(dto);

      const result = await controller.get("prod-1");

      expect(productReadModel.get).toHaveBeenCalledWith("prod-1");
      expect(result).toBe(dto);
    });

    it("returns enriched response with stock and promotions from service", async () => {
      const dto = buildProductDto({
        id: "prod-1",
        stock_actual: 42,
        promotions: [
          {
            id: "promo-product",
            name: "Product 10%",
            description: null,
            scope: "product",
            type: "percentage",
            discount_percent: 10,
            start_date: "2026-07-01T03:00:00.000Z",
            end_date: "2026-07-31T02:59:59.000Z",
            weekdays: null,
          },
        ],
        store_promotions: [
          {
            id: "promo-store",
            name: "Store 5%",
            description: null,
            scope: "store",
            type: "percentage",
            discount_percent: 5,
            start_date: "2026-07-01T03:00:00.000Z",
            end_date: "2026-07-31T02:59:59.000Z",
            weekdays: null,
          },
        ],
      });
      productReadModel.get.mockResolvedValue(dto);

      const result = await controller.get("prod-1");

      expect(result.stock_actual).toBe(42);
      expect(result.promotions).toHaveLength(1);
      expect(result.store_promotions).toHaveLength(1);
    });

    it("propagates NotFoundError from service", async () => {
      productReadModel.get.mockRejectedValue(
        new NotFoundError("Product not found"),
      );

      await expect(controller.get("prod-1")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("list (multiple products)", () => {
    it("delegates to productReadModel.list and returns the result", async () => {
      const dtos = [buildProductDto({ id: "prod-a" }), buildProductDto({ id: "prod-b" })];
      productReadModel.list.mockResolvedValue(dtos);

      const result = await controller.list({});

      expect(productReadModel.list).toHaveBeenCalledWith({});
      expect(result).toBe(dtos);
    });

    it("delegates pagination query to service", async () => {
      const page: Page<ProductResponseDto> = {
        data: [buildProductDto({ id: "prod-a" })],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNext: false },
      };
      productReadModel.list.mockResolvedValue(page);

      const query = { page: 1, limit: 10 };
      const result = await controller.list(query);

      expect(productReadModel.list).toHaveBeenCalledWith(query);
      expect(result).toBe(page);
    });

    it("returns service result as-is for non-paginated list", async () => {
      const dtos = [buildProductDto({ id: "prod-1", stock_actual: 10 })];
      productReadModel.list.mockResolvedValue(dtos);

      const result = await controller.list({});

      expect(result).toEqual(dtos);
    });
  });

  describe("getByCode", () => {
    it("delegates trimmed code to productReadModel.getByCode", async () => {
      const dto = buildProductDto({
        id: "special-1",
        pricing_mode: "manual",
        is_protected: true,
        codigos: ["1"],
      });
      productReadModel.getByCode.mockResolvedValue(dto);

      const result = await controller.getByCode("1");

      expect(result.id).toBe("special-1");
      expect(productReadModel.getByCode).toHaveBeenCalledWith("1");
    });

    it("throws NotFoundError when the code is unknown", async () => {
      productReadModel.getByCode.mockRejectedValue(
        new NotFoundError("Product with code 99 not found"),
      );

      await expect(controller.getByCode("99")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productReadModel.getByCode).toHaveBeenCalledWith("99");
    });

    it("resolves before /:id route for code '1' (route-order verification)", async () => {
      const dto = buildProductDto({
        id: "special-1",
        pricing_mode: "manual",
        is_protected: true,
        codigos: ["1"],
      });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("1");
      expect(productReadModel.getByCode).toHaveBeenCalledWith("1");
    });

    it("trims leading whitespace and delegates trimmed code to the service", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["77909145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("  77909145");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("77909145");
    });

    it("trims trailing whitespace and delegates trimmed code to the service", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["77909145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("77909145  ");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("77909145");
    });

    it("trims both leading and trailing whitespace", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["77909145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("  77909145  ");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("77909145");
    });

    it("preserves internal whitespace while trimming external whitespace", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["779 09145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("  779 09145  ");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("779 09145");
    });

    it("throws ValidationError when code is whitespace-only after trim", async () => {
      await expect(controller.getByCode("   ")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(productReadModel.getByCode).not.toHaveBeenCalled();
    });

    it("throws ValidationError when code is a single space", async () => {
      await expect(controller.getByCode(" ")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(productReadModel.getByCode).not.toHaveBeenCalled();
    });

    it("resolves short registered code '77909145' by exact equality (no EAN padding)", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["77909145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      const result = await controller.getByCode("77909145");

      expect(result.id).toBe("prod-1");
      expect(productReadModel.getByCode).toHaveBeenCalledWith("77909145");
    });

    it("resolves long registered code by exact equality", async () => {
      const longCode = "ABC-12345678901234567890";
      const dto = buildProductDto({ id: "prod-long", codigos: [longCode] });
      productReadModel.getByCode.mockResolvedValue(dto);

      const result = await controller.getByCode(longCode);

      expect(result.id).toBe("prod-long");
      expect(productReadModel.getByCode).toHaveBeenCalledWith(longCode);
    });

    it("passes exact trimmed code — does not pad, transform, or normalize", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["1234"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode(" 1234 ");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("1234");
    });

    it("rejects tab-only whitespace code with ValidationError", async () => {
      await expect(controller.getByCode("\t\t")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(productReadModel.getByCode).not.toHaveBeenCalled();
    });

    it("trims mixed tab and space whitespace before lookup", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["77909145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode("\t 77909145 \t");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("77909145");
    });

    it("preserves embedded tabs as part of the code", async () => {
      const dto = buildProductDto({ id: "prod-1", codigos: ["779\t09145"] });
      productReadModel.getByCode.mockResolvedValue(dto);

      await controller.getByCode(" 779\t09145 ");

      expect(productReadModel.getByCode).toHaveBeenCalledWith("779\t09145");
    });
  });

  describe("update", () => {
    it("calls UpdateProductUseCase then enriches the result", async () => {
      const product = new Product();
      product.id = "prod-1";
      product.maneja_stock = false;

      const enriched = buildProductDto({
        id: "prod-1",
        store_promotions: [
          {
            id: "promo-store",
            name: "Store 5%",
            description: null,
            scope: "store",
            type: "percentage",
            discount_percent: 5,
            start_date: "2026-07-01T03:00:00.000Z",
            end_date: "2026-07-31T02:59:59.000Z",
            weekdays: null,
          },
        ],
      });

      updateProduct.execute.mockResolvedValue(product);
      productReadModel.enrich.mockResolvedValue(enriched);

      const result = await controller.update("prod-1", {
        detalle: "Updated",
      });

      expect(updateProduct.execute).toHaveBeenCalledWith("prod-1", {
        detalle: "Updated",
      });
      expect(productReadModel.enrich).toHaveBeenCalledWith(product);
      expect(result.store_promotions).toHaveLength(1);
    });

    it("returns stock_actual null when maneja_stock is false after update", async () => {
      const product = new Product();
      product.id = "prod-1";
      product.maneja_stock = false;

      const enriched = buildProductDto({ id: "prod-1", stock_actual: null });

      updateProduct.execute.mockResolvedValue(product);
      productReadModel.enrich.mockResolvedValue(enriched);

      const result = await controller.update("prod-1", {
        maneja_stock: false,
      });

      expect(result.stock_actual).toBeNull();
    });

    it("returns stock_actual from enrichment when maneja_stock is true after update", async () => {
      const product = new Product();
      product.id = "prod-1";
      product.maneja_stock = true;

      const enriched = buildProductDto({ id: "prod-1", stock_actual: 30 });

      updateProduct.execute.mockResolvedValue(product);
      productReadModel.enrich.mockResolvedValue(enriched);

      const result = await controller.update("prod-1", {
        maneja_stock: true,
      });

      expect(result.stock_actual).toBe(30);
      expect(updateProduct.execute).toHaveBeenCalledWith("prod-1", {
        maneja_stock: true,
      });
      expect(productReadModel.enrich).toHaveBeenCalledWith(product);
    });

    it("re-enabling stock exposes the preserved previous balance via enrichment", async () => {
      const product = new Product();
      product.id = "prod-1";
      product.maneja_stock = true;

      const enriched = buildProductDto({ id: "prod-1", stock_actual: 25 });

      updateProduct.execute.mockResolvedValue(product);
      productReadModel.enrich.mockResolvedValue(enriched);

      const result = await controller.update("prod-1", {
        maneja_stock: true,
      });

      expect(result.stock_actual).toBe(25);
    });
  });

  describe("UpdateProductDto contract", () => {
    it("does not declare stock_actual — HTTP whitelist rejects it", () => {
      const dto = new UpdateProductDto();
      const ownKeys = Object.getOwnPropertyNames(dto);

      expect(ownKeys).not.toContain("stock_actual");
      expect((dto as Record<string, unknown>).stock_actual).toBeUndefined();
    });
  });

  describe("ValidationPipe", () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });
    const metatype = UpdateProductDto;
    const metadata = { type: "body" as const, metatype, data: "" };

    it("rejects stock_actual as a forbidden non-whitelisted property", async () => {
      const body = { maneja_stock: true, stock_actual: 100 };

      await expect(pipe.transform(body, metadata)).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            expect.stringContaining("stock_actual"),
          ]),
        },
      });
    });

    it("accepts a valid body with maneja_stock", async () => {
      const body = { maneja_stock: true };

      const result = await pipe.transform(body, metadata);

      expect(result).toMatchObject({ maneja_stock: true });
    });

    it("rejects unknown fields", async () => {
      const body = { unknown_field: "anything" };

      await expect(pipe.transform(body, metadata)).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            expect.stringContaining("unknown_field"),
          ]),
        },
      });
    });
  });

  describe("create (idempotency key)", () => {
    it("calls use case with DTO and trimmed idempotency key", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };
      const response = {
        id: "p1",
        detalle: "Test",
        label_status: "not_required",
        label_job: null,
      };
      createProduct.execute.mockResolvedValue(response);

      const result = await controller.create(dto, "  key-abc  ");

      expect(createProduct.execute).toHaveBeenCalledWith(dto, "key-abc");
      expect(result).toBe(response);
    });

    it("validates and rejects missing idempotency key", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };

      await expect(
        controller.create(dto, undefined as any),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(createProduct.execute).not.toHaveBeenCalled();
    });

    it("validates and rejects empty idempotency key", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };

      await expect(controller.create(dto, "")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(createProduct.execute).not.toHaveBeenCalled();
    });

    it("validates and rejects whitespace-only idempotency key", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };

      await expect(controller.create(dto, "   ")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(createProduct.execute).not.toHaveBeenCalled();
    });

    it("trims leading and trailing whitespace from key", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };
      createProduct.execute.mockResolvedValue({ id: "p1" });

      await controller.create(dto, "  my-key  ");

      expect(createProduct.execute).toHaveBeenCalledWith(dto, "my-key");
    });

    it("passes tab-trimmed key to use case", async () => {
      const dto: CreateProductDto = {
        detalle: "Test",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["T001"],
      };
      createProduct.execute.mockResolvedValue({ id: "p1" });

      await controller.create(dto, "\t\tkey-tab\t");

      expect(createProduct.execute).toHaveBeenCalledWith(dto, "key-tab");
    });
  });

  describe("delete", () => {
    it("delegates to deleteProduct.use-case and returns void", async () => {
      deleteProduct.execute.mockResolvedValue(undefined as any);

      await controller.delete("prod-1");

      expect(deleteProduct.execute).toHaveBeenCalledWith("prod-1");
    });
  });

  describe("ProductReadModelService delegation", () => {
    it("controller no longer imports PromotionRepositoryPort or InventoryRepositoryPort", () => {
      // Static guard: verify controller constructor only accepts local use cases
      // and ProductReadModelService. Foreign ports must not appear.
      const controllerInstance = new ProductsController(
        createProduct as any,
        updateProduct as any,
        deleteProduct as any,
        productReadModel as any,
      );

      // Controller should have exactly these 4 injected dependencies
      expect((controllerInstance as any).createProduct).toBe(createProduct);
      expect((controllerInstance as any).updateProduct).toBe(updateProduct);
      expect((controllerInstance as any).deleteProduct).toBe(deleteProduct);
      expect((controllerInstance as any).productReadModel).toBe(productReadModel);

      // No foreign ports
      expect((controllerInstance as any).promotionRepo).toBeUndefined();
      expect((controllerInstance as any).inventoryRepo).toBeUndefined();
    });
  });
});
