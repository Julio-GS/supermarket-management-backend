import { Test, TestingModule } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductResponseDto, UpdateProductDto, CreateProductDto } from "./product.dto";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { ListProductsUseCase } from "../application/list-products.use-case";
import { GetProductUseCase } from "../application/get-product.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { GetProductByCodeUseCase } from "../application/get-product-by-code.use-case";
import { Product } from "../domain/product.entity";
import { Promotion } from "../../promotions/domain/promotion.entity";
import { InventoryBalance } from "../../inventory/domain/inventory.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

function buildProduct(overrides: Partial<Product> = {}): Product {
  const p = new Product();
  p.id = "prod-1";
  p.detalle = "Test Product";
  p.costo_neto = "100.00";
  p.costo_final = "200.00";
  p.iva = "21.00";
  p.cambio_costo = "2024-01-01";
  p.cambio_precio = "2024-01-01";
  p.etiqueta = "test";
  p.facturable = true;
  p.maneja_stock = false;
  p.codigos = ["TEST001"];
  p.pricing_mode = "fixed";
  p.is_protected = false;
  p.created_at = new Date("2026-07-01T00:00:00Z");
  p.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(p, overrides);
}

function buildPromotion(overrides: Partial<Promotion> = {}): Promotion {
  const p = new Promotion();
  p.id = "promo-id";
  p.name = "Promotion";
  p.description = null;
  p.scope = "product";
  p.product_id = "prod-1";
  p.type = "percentage";
  p.discount_percent = 10;
  p.start_date = new Date("2026-07-01T00:00:00-03:00");
  p.end_date = new Date("2026-07-31T23:59:59-03:00");
  p.weekdays = null;
  p.enabled = true;
  p.created_at = new Date("2026-07-01T00:00:00Z");
  p.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(p, overrides);
}

describe("ProductsController", () => {
  let controller: ProductsController;
  let promoRepo: jest.Mocked<
    Pick<PromotionRepositoryPort, "findActiveByProductIds">
  >;
  let inventoryRepo: jest.Mocked<
    Pick<InventoryRepositoryPort, "findBalance" | "findBalancesByIds">
  >;
  let listProducts: jest.Mocked<
    Pick<ListProductsUseCase, "execute" | "executePage">
  >;
  let getProduct: jest.Mocked<Pick<GetProductUseCase, "execute">>;
  let getProductByCode: jest.Mocked<Pick<GetProductByCodeUseCase, "execute">>;
  let updateProduct: jest.Mocked<Pick<UpdateProductUseCase, "execute">>;

  beforeEach(async () => {
    promoRepo = { findActiveByProductIds: jest.fn() };
    inventoryRepo = { findBalance: jest.fn(), findBalancesByIds: jest.fn() };
    listProducts = { execute: jest.fn(), executePage: jest.fn() };
    getProduct = { execute: jest.fn() };
    getProductByCode = { execute: jest.fn() };
    updateProduct = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: CreateProductUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ListProductsUseCase,
          useValue: listProducts,
        },
        {
          provide: GetProductUseCase,
          useValue: getProduct,
        },
        {
          provide: UpdateProductUseCase,
          useValue: updateProduct,
        },
        {
          provide: DeleteProductUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: GetProductByCodeUseCase,
          useValue: getProductByCode,
        },
        {
          provide: PromotionRepositoryPort,
          useValue: promoRepo,
        },
        {
          provide: InventoryRepositoryPort,
          useValue: inventoryRepo,
        },
      ],
    }).compile();

    controller = module.get(ProductsController);
  });

  describe("get (single product)", () => {
    it("splits promotions by scope: product-scoped in promotions, store-wide in store_promotions", async () => {
      const product = buildProduct({ id: "prod-1" });
      getProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-product",
          name: "Product 10%",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
        }),
        buildPromotion({
          id: "promo-store",
          name: "Store 5%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 5,
        }),
      ]);

      const result = await controller.get("prod-1");

      // Product-scoped promotions go to promotions
      expect(result.promotions).toHaveLength(1);
      expect(result.promotions![0].id).toBe("promo-product");

      // Store-wide promotions go to store_promotions
      expect(result.store_promotions).toHaveLength(1);
      expect(result.store_promotions![0].id).toBe("promo-store");
      expect(result.store_promotions![0].scope).toBe("store");
    });

    it("returns null for store_promotions when no store-wide promotions are active", async () => {
      const product = buildProduct({ id: "prod-1" });
      getProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-product",
          name: "Product 10%",
          scope: "product",
          product_id: "prod-1",
        }),
      ]);

      const result = await controller.get("prod-1");

      expect(result.store_promotions).toBeNull();
      expect(result.promotions).toHaveLength(1);
    });

    it("passes an Argentina-aligned date to the repository", async () => {
      const product = buildProduct({ id: "prod-1" });
      getProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.get("prod-1");

      const callArgs = promoRepo.findActiveByProductIds.mock.calls[0];
      const dateArg = callArgs[1] as Date;

      // The second argument must be a Date instance (Argentina-aligned now)
      expect(dateArg).toBeInstanceOf(Date);
      expect(isNaN(dateArg.getTime())).toBe(false);
    });
  });

  describe("list (multiple products)", () => {
    it("fans out store-wide promotions to every product in the list", async () => {
      const productA = buildProduct({ id: "prod-a", detalle: "Product A" });
      const productB = buildProduct({ id: "prod-b", detalle: "Product B" });
      listProducts.execute.mockResolvedValue([productA, productB]);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-store",
          name: "Store 5%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 5,
        }),
      ]);

      const result = (await controller.list({})) as ProductResponseDto[];

      // Both products receive the same store-wide promotion
      expect(result[0].store_promotions).toHaveLength(1);
      expect(result[0].store_promotions![0].id).toBe("promo-store");
      expect(result[1].store_promotions).toHaveLength(1);
      expect(result[1].store_promotions![0].id).toBe("promo-store");
    });

    it("each product gets only its own product-scoped promotions", async () => {
      const productA = buildProduct({ id: "prod-a", detalle: "Product A" });
      const productB = buildProduct({ id: "prod-b", detalle: "Product B" });
      listProducts.execute.mockResolvedValue([productA, productB]);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-a",
          name: "Product A Promo",
          scope: "product",
          product_id: "prod-a",
          type: "percentage",
          discount_percent: 10,
        }),
        buildPromotion({
          id: "promo-b",
          name: "Product B Promo",
          scope: "product",
          product_id: "prod-b",
          type: "two_x_one",
          discount_percent: null,
        }),
      ]);

      const result = (await controller.list({})) as Array<{
        promotions: Array<{ id: string }>;
      }>;

      expect(result[0].promotions).toHaveLength(1);
      expect(result[0].promotions![0].id).toBe("promo-a");
      expect(result[1].promotions).toHaveLength(1);
      expect(result[1].promotions![0].id).toBe("promo-b");
    });

    it("returns null for store_promotions when only product-scoped promos exist", async () => {
      const product = buildProduct({ id: "prod-1" });
      listProducts.execute.mockResolvedValue([product]);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-product",
          name: "Product 10%",
          scope: "product",
          product_id: "prod-1",
        }),
      ]);

      const result = (await controller.list({})) as ProductResponseDto[];

      expect(result[0].store_promotions).toBeNull();
    });
  });

  describe("getByCode", () => {
    it("resolves a known special code and returns the product", async () => {
      const product = buildProduct({
        id: "special-1",
        detalle: "Fiambre",
        pricing_mode: "manual",
        is_protected: true,
        costo_neto: null,
        costo_final: null,
        iva: null,
        codigos: ["1"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.getByCode("1");

      expect(result.id).toBe("special-1");
      expect(result.pricing_mode).toBe("manual");
      expect(result.is_protected).toBe(true);
      expect(getProductByCode.execute).toHaveBeenCalledWith("1");
    });

    it("throws NotFoundError when the code is unknown", async () => {
      getProductByCode.execute.mockRejectedValue(
        new NotFoundError("Product with code 99 not found"),
      );

      await expect(controller.getByCode("99")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(getProductByCode.execute).toHaveBeenCalledWith("99");
    });

    it("resolves before /:id route for code '1' (route-order verification)", async () => {
      // This test documents that the /products/code/:code route is declared
      // before /products/:id in the controller. The mock setup mimics code "1"
      // which could be mistaken for a UUID if route order were wrong.
      const product = buildProduct({
        id: "special-1",
        pricing_mode: "manual",
        is_protected: true,
        codigos: ["1"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      // Should resolve via code, not try to parse "1" as UUID
      await controller.getByCode("1");
      expect(getProductByCode.execute).toHaveBeenCalledWith("1");
    });

    it("trims leading whitespace and delegates trimmed code to the use case", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["77909145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode("  77909145");

      expect(getProductByCode.execute).toHaveBeenCalledWith("77909145");
    });

    it("trims trailing whitespace and delegates trimmed code to the use case", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["77909145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode("77909145  ");

      expect(getProductByCode.execute).toHaveBeenCalledWith("77909145");
    });

    it("trims both leading and trailing whitespace", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["77909145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode("  77909145  ");

      expect(getProductByCode.execute).toHaveBeenCalledWith("77909145");
    });

    it("preserves internal whitespace while trimming external whitespace", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["779 09145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode("  779 09145  ");

      expect(getProductByCode.execute).toHaveBeenCalledWith("779 09145");
    });

    it("throws ValidationError when code is whitespace-only after trim", async () => {
      await expect(controller.getByCode("   ")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(getProductByCode.execute).not.toHaveBeenCalled();
    });

    it("throws ValidationError when code is a single space", async () => {
      await expect(controller.getByCode(" ")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(getProductByCode.execute).not.toHaveBeenCalled();
    });

    it("resolves short registered code '77909145' by exact equality (no EAN padding)", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["77909145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.getByCode("77909145");

      expect(result.id).toBe("prod-1");
      expect(getProductByCode.execute).toHaveBeenCalledWith("77909145");
    });

    it("resolves long registered code by exact equality", async () => {
      const longCode = "ABC-12345678901234567890";
      const product = buildProduct({
        id: "prod-long",
        codigos: [longCode],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.getByCode(longCode);

      expect(result.id).toBe("prod-long");
      expect(getProductByCode.execute).toHaveBeenCalledWith(longCode);
    });

    it("passes exact trimmed code — does not pad, transform, or normalize", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["1234"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode(" 1234 ");

      // Must be exact "1234", not "0000000001234" or any EAN-padded form
      expect(getProductByCode.execute).toHaveBeenCalledWith("1234");
    });

    it("rejects tab-only whitespace code with ValidationError", async () => {
      await expect(controller.getByCode("\t\t")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(getProductByCode.execute).not.toHaveBeenCalled();
    });

    it("trims mixed tab and space whitespace before lookup", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["77909145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      // Tab + space + code + space + tab
      await controller.getByCode("\t 77909145 \t");

      expect(getProductByCode.execute).toHaveBeenCalledWith("77909145");
    });

    it("preserves embedded tabs as part of the code", async () => {
      const product = buildProduct({
        id: "prod-1",
        codigos: ["779\t09145"],
      });
      getProductByCode.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      await controller.getByCode(" 779\t09145 ");

      // Only external whitespace trimmed, internal tab preserved
      expect(getProductByCode.execute).toHaveBeenCalledWith("779\t09145");
    });
  });

  describe("update", () => {
    it("includes store_promotions in the update response", async () => {
      const product = buildProduct({ id: "prod-1" });
      updateProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([
        buildPromotion({
          id: "promo-store",
          name: "Store 5%",
          scope: "store",
          product_id: null,
          type: "percentage",
          discount_percent: 5,
        }),
      ]);

      const result = await controller.update("prod-1", {
        detalle: "Updated",
      });

      expect(result.store_promotions).toHaveLength(1);
      expect(result.store_promotions![0].id).toBe("promo-store");
    });

    it("returns stock_actual null when maneja_stock is false after update", async () => {
      const product = buildProduct({ id: "prod-1", maneja_stock: false });
      updateProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.update("prod-1", {
        maneja_stock: false,
      });

      expect(result.stock_actual).toBeNull();
      expect(inventoryRepo.findBalance).not.toHaveBeenCalled();
    });

    it("returns stock_actual from balance when maneja_stock is true after update", async () => {
      const product = buildProduct({ id: "prod-1", maneja_stock: true });
      updateProduct.execute.mockResolvedValue(product);
      inventoryRepo.findBalance.mockResolvedValue({
        product_id: "prod-1",
        stock_actual: 30,
        updated_at: new Date(),
      } as InventoryBalance);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.update("prod-1", {
        maneja_stock: true,
      });

      expect(result.stock_actual).toBe(30);
      expect(inventoryRepo.findBalance).toHaveBeenCalledWith("prod-1");
    });

    it("re-enabling stock exposes the preserved previous balance", async () => {
      // Simulate: product had maneja_stock=true, balance 25;
      // client disabled it, then re-enabled. The balance must survive.
      const product = buildProduct({ id: "prod-1", maneja_stock: true });
      updateProduct.execute.mockResolvedValue(product);
      inventoryRepo.findBalance.mockResolvedValue({
        product_id: "prod-1",
        stock_actual: 25,
        updated_at: new Date(),
      } as InventoryBalance);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.update("prod-1", {
        maneja_stock: true,
      });

      // The preserved balance of 25 is exposed, not 0
      expect(result.stock_actual).toBe(25);
    });
  });

  describe("UpdateProductDto contract", () => {
    it("does not declare stock_actual — HTTP whitelist rejects it", () => {
      // Static guard: stock_actual must NOT be a decorated property of
      // UpdateProductDto. Global ValidationPipe with whitelist:true +
      // forbidNonWhitelisted:true will reject it at the HTTP boundary.
      const dto = new UpdateProductDto();
      const ownKeys = Object.getOwnPropertyNames(dto);

      // If someone adds stock_actual in the future this test breaks.
      expect(ownKeys).not.toContain("stock_actual");

      // Even if TypeScript add it as an implicit class member the DTO
      // constructor sets no such key.
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

            await expect(
              pipe.transform(body, metadata),
            ).rejects.toMatchObject({
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

            await expect(
              pipe.transform(body, metadata),
            ).rejects.toMatchObject({
              response: {
                message: expect.arrayContaining([
                  expect.stringContaining("unknown_field"),
                ]),
              },
            });
          });
        });
  describe("stock_actual enrichment", () => {
    it("includes stock_actual numeric for stock-tracked product in get-by-id", async () => {
      const product = buildProduct({ id: "prod-1", maneja_stock: true });
      getProduct.execute.mockResolvedValue(product);
      inventoryRepo.findBalance.mockResolvedValue({
        product_id: "prod-1",
        stock_actual: 42,
        updated_at: new Date(),
      } as InventoryBalance);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.get("prod-1");

      expect(result.stock_actual).toBe(42);
      expect(inventoryRepo.findBalance).toHaveBeenCalledWith("prod-1");
    });

    it("returns stock_actual 0 for stock-tracked product with no balance row", async () => {
      const product = buildProduct({ id: "prod-2", maneja_stock: true });
      getProduct.execute.mockResolvedValue(product);
      inventoryRepo.findBalance.mockResolvedValue(null);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.get("prod-2");

      expect(result.stock_actual).toBe(0);
    });

    it("returns stock_actual null for non-stock product", async () => {
      const product = buildProduct({ id: "prod-3", maneja_stock: false });
      getProduct.execute.mockResolvedValue(product);
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = await controller.get("prod-3");

      expect(result.stock_actual).toBeNull();
      expect(inventoryRepo.findBalance).not.toHaveBeenCalled();
    });

    it("batch-enriches stock_actual in product list", async () => {
      const productA = buildProduct({ id: "prod-a", maneja_stock: true });
      const productB = buildProduct({ id: "prod-b", maneja_stock: false });
      listProducts.execute.mockResolvedValue([productA, productB]);
      inventoryRepo.findBalancesByIds.mockResolvedValue(
        new Map([
          [
            "prod-a",
            {
              product_id: "prod-a",
              stock_actual: 150,
              updated_at: new Date(),
            } as InventoryBalance,
          ],
        ]),
      );
      promoRepo.findActiveByProductIds.mockResolvedValue([]);

      const result = (await controller.list({})) as ProductResponseDto[];

      expect(result[0].stock_actual).toBe(150);
      expect(result[1].stock_actual).toBeNull();
      expect(inventoryRepo.findBalancesByIds).toHaveBeenCalledWith([
        "prod-a",
        "prod-b",
      ]);
    });
  });

  describe("create (idempotency key)", () => {
    let createProduct: jest.Mocked<Pick<CreateProductUseCase, "execute">>;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ProductsController],
        providers: [
          { provide: CreateProductUseCase, useValue: { execute: jest.fn() } },
          { provide: ListProductsUseCase, useValue: { execute: jest.fn(), executePage: jest.fn() } },
          { provide: GetProductUseCase, useValue: { execute: jest.fn() } },
          { provide: UpdateProductUseCase, useValue: { execute: jest.fn() } },
          { provide: DeleteProductUseCase, useValue: { execute: jest.fn() } },
          { provide: GetProductByCodeUseCase, useValue: { execute: jest.fn() } },
          { provide: PromotionRepositoryPort, useValue: { findActiveByProductIds: jest.fn() } },
          { provide: InventoryRepositoryPort, useValue: { findBalance: jest.fn(), findBalancesByIds: jest.fn() } },
        ],
      }).compile();

      controller = module.get(ProductsController);
      createProduct = module.get(CreateProductUseCase);
    });

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

      await expect(
        controller.create(dto, ""),
      ).rejects.toBeInstanceOf(ValidationError);
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

      await expect(
        controller.create(dto, "   "),
      ).rejects.toBeInstanceOf(ValidationError);
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
});
