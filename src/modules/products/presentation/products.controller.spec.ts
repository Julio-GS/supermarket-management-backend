import { Test, TestingModule } from "@nestjs/testing";
import { ProductsController } from "./products.controller";
import { ProductResponseDto } from "./product.dto";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { ListProductsUseCase } from "../application/list-products.use-case";
import { GetProductUseCase } from "../application/get-product.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { Product } from "../domain/product.entity";
import { Promotion } from "../../promotions/domain/promotion.entity";

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
  let listProducts: jest.Mocked<
    Pick<ListProductsUseCase, "execute" | "executePage">
  >;
  let getProduct: jest.Mocked<Pick<GetProductUseCase, "execute">>;
  let updateProduct: jest.Mocked<Pick<UpdateProductUseCase, "execute">>;

  beforeEach(async () => {
    promoRepo = { findActiveByProductIds: jest.fn() };
    listProducts = { execute: jest.fn(), executePage: jest.fn() };
    getProduct = { execute: jest.fn() };
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
          provide: PromotionRepositoryPort,
          useValue: promoRepo,
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
  });
});
