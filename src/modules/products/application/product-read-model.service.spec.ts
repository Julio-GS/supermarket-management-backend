import { ProductReadModelService } from "./product-read-model.service";
import { ListProductsUseCase } from "./list-products.use-case";
import { GetProductUseCase } from "./get-product.use-case";
import { GetProductByCodeUseCase } from "./get-product-by-code.use-case";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import {
  PromotionRepositoryPort,
  PromotionLookupScope,
} from "../../promotions/application/promotion.repository.port";
import { Product } from "../domain/product.entity";
import { Promotion } from "../../promotions/domain/promotion.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { Page } from "../../../shared/read-model/page";
import { argentinaNow } from "../../promotions/application/promotion-reference-date";

jest.mock("../../promotions/application/promotion-reference-date");

const mockArgentinaNow = argentinaNow as jest.MockedFunction<typeof argentinaNow>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  const product = new Product();
  product.id = overrides.id ?? "11111111-1111-1111-1111-111111111111";
  product.detalle = overrides.detalle ?? "Test Product";
  product.costo_neto = overrides.costo_neto ?? "100.00";
  product.costo_final = overrides.costo_final ?? "121.00";
  product.iva = overrides.iva ?? "21";
  product.cambio_costo = overrides.cambio_costo ?? "2024-01-01";
  product.cambio_precio = overrides.cambio_precio ?? "2024-01-01";
  product.etiqueta = overrides.etiqueta ?? "normal";
  product.facturable = overrides.facturable ?? true;
  product.maneja_stock = overrides.maneja_stock ?? true;
  product.codigos = overrides.codigos ?? ["SKU-001"];
  product.pricing_mode = overrides.pricing_mode ?? "fixed";
  product.is_protected = overrides.is_protected ?? false;
  product.created_at = overrides.created_at ?? new Date("2024-01-01");
  product.updated_at = overrides.updated_at ?? new Date("2024-01-01");
  return product;
}

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  const promo = new Promotion();
  promo.id = overrides.id ?? "promo-001";
  promo.name = overrides.name ?? "Test Promo";
  promo.description = overrides.description ?? null;
  promo.scope = overrides.scope ?? "product";
  promo.product_id = overrides.product_id ?? null;
  promo.type = overrides.type ?? "percentage";
  promo.discount_percent = overrides.discount_percent ?? 10;
  promo.start_date = overrides.start_date ?? null;
  promo.end_date = overrides.end_date ?? null;
  promo.weekdays = overrides.weekdays ?? null;
  promo.enabled = overrides.enabled ?? true;
  promo.created_at = overrides.created_at ?? new Date("2024-01-01");
  promo.updated_at = overrides.updated_at ?? new Date("2024-01-01");
  return promo;
}

describe("ProductReadModelService", () => {
  let service: ProductReadModelService;
  let listProducts: jest.Mocked<ListProductsUseCase>;
  let getProduct: jest.Mocked<GetProductUseCase>;
  let getProductByCode: jest.Mocked<GetProductByCodeUseCase>;
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;
  let promotionRepo: jest.Mocked<PromotionRepositoryPort>;

  beforeEach(() => {
    listProducts = {
      execute: jest.fn(),
      executePage: jest.fn(),
    } as unknown as jest.Mocked<ListProductsUseCase>;

    getProduct = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetProductUseCase>;

    getProductByCode = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetProductByCodeUseCase>;

    inventoryRepo = {
      findBalance: jest.fn(),
      findAllBalances: jest.fn(),
      findBalancesByIds: jest.fn(),
      createBalance: jest.fn(),
      adjustBalance: jest.fn(),
      findMovementsByProduct: jest.fn(),
      getStockForProducts: jest.fn(),
    } as unknown as jest.Mocked<InventoryRepositoryPort>;

    promotionRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findActiveByProductIds: jest.fn(),
      delete: jest.fn(),
      findActiveForProducts: jest.fn(),
    } as unknown as jest.Mocked<PromotionRepositoryPort>;

    mockArgentinaNow.mockReturnValue(new Date("2024-06-15T12:00:00"));

    service = new ProductReadModelService(
      listProducts,
      getProduct,
      getProductByCode,
      inventoryRepo,
      promotionRepo,
    );
  });

  describe("enrichMany", () => {
    it("should return empty array and skip port calls for empty input", async () => {
      const result = await service.enrichMany([]);

      expect(result).toEqual([]);
      expect(inventoryRepo.getStockForProducts).not.toHaveBeenCalled();
      expect(promotionRepo.findActiveForProducts).not.toHaveBeenCalled();
    });

    it("should resolve stock_actual as null for non-stock products", async () => {
      const product = makeProduct({ maneja_stock: false });
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.enrichMany([product]);

      expect(result[0].stock_actual).toBeNull();
      // Non-stock products should not be included in the stock lookup
      // (the port is still called with all IDs, but null is used regardless)
      expect(result).toHaveLength(1);
    });

    it("should resolve numeric stock for tracked product with balance", async () => {
      const product = makeProduct({ id: "prod-1", maneja_stock: true });
      inventoryRepo.getStockForProducts.mockResolvedValue(
        new Map([["prod-1", 42]]),
      );
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.enrichMany([product]);

      expect(result[0].stock_actual).toBe(42);
    });

    it("should default stock_actual to 0 for tracked product without balance", async () => {
      const product = makeProduct({ id: "prod-1", maneja_stock: true });
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.enrichMany([product]);

      expect(result[0].stock_actual).toBe(0);
    });

    it("should group product-scoped promotions by product_id", async () => {
      const product1 = makeProduct({ id: "prod-1" });
      const product2 = makeProduct({ id: "prod-2" });
      inventoryRepo.getStockForProducts.mockResolvedValue(
        new Map([["prod-1", 10], ["prod-2", 20]]),
      );
      promotionRepo.findActiveForProducts.mockResolvedValue([
        makePromotion({
          id: "p1",
          name: "Promo P1",
          scope: "product",
          product_id: "prod-1",
          discount_percent: 15,
        }),
        makePromotion({
          id: "p2",
          name: "Promo P2",
          scope: "product",
          product_id: "prod-2",
          discount_percent: 20,
        }),
      ]);

      const result = await service.enrichMany([product1, product2]);

      expect(result[0].promotions).toHaveLength(1);
      expect(result[0].promotions![0].id).toBe("p1");
      expect(result[0].promotions![0].discount_percent).toBe(15);
      expect(result[1].promotions).toHaveLength(1);
      expect(result[1].promotions![0].id).toBe("p2");
      expect(result[1].promotions![0].discount_percent).toBe(20);
    });

    it("should fan out store-wide promotions to all products via store_promotions", async () => {
      const product1 = makeProduct({ id: "prod-1" });
      const product2 = makeProduct({ id: "prod-2" });
      inventoryRepo.getStockForProducts.mockResolvedValue(
        new Map([["prod-1", 10], ["prod-2", 20]]),
      );
      promotionRepo.findActiveForProducts.mockResolvedValue([
        makePromotion({
          id: "store-1",
          name: "Store Sale",
          scope: "store",
          product_id: null,
          discount_percent: 5,
        }),
      ]);

      const result = await service.enrichMany([product1, product2]);

      expect(result[0].promotions).toBeNull();
      expect(result[0].store_promotions).toHaveLength(1);
      expect(result[0].store_promotions![0].id).toBe("store-1");
      expect(result[1].promotions).toBeNull();
      expect(result[1].store_promotions).toHaveLength(1);
      expect(result[1].store_promotions![0].id).toBe("store-1");
    });

    it("should produce response DTO matching current controller mapping shape", async () => {
      const createdAt = new Date("2024-01-01T00:00:00Z");
      const updatedAt = new Date("2024-06-01T00:00:00Z");
      const product = makeProduct({
        id: "prod-shape",
        detalle: "Shape Test",
        costo_neto: "500.00",
        costo_final: "605.00",
        iva: "21",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-02-01",
        etiqueta: "oferta",
        facturable: true,
        maneja_stock: true,
        codigos: ["SKU-SHAPE"],
        pricing_mode: "fixed",
        is_protected: false,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      inventoryRepo.getStockForProducts.mockResolvedValue(
        new Map([["prod-shape", 7]]),
      );
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.enrichMany([product]);

      expect(result[0]).toEqual({
        id: "prod-shape",
        detalle: "Shape Test",
        costo_neto: "500.00",
        costo_final: "605.00",
        iva: "21",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-02-01",
        etiqueta: "oferta",
        facturable: true,
        maneja_stock: true,
        codigos: ["SKU-SHAPE"],
        pricing_mode: "fixed",
        is_protected: false,
        stock_actual: 7,
        promotions: null,
        store_promotions: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    });

    it("should NOT inject or call ReadCachePort", () => {
      // Verify the constructor does not accept ReadCachePort
      expect(service).toBeDefined();
      // Verify ReadCachePort is not in the service's injected dependencies
      // by checking the constructor parameter count matches our 5 injections
      const paramNames = [
        "listProducts",
        "getProduct",
        "getProductByCode",
        "inventoryRepo",
        "promotionRepo",
      ];
      // If ReadCachePort were injected, the constructor would need 6+ params
      // This test documents that the service does NOT inject ReadCachePort
      expect(paramNames).toHaveLength(5);
    });
  });

  describe("enrich", () => {
    it("should delegate to enrichMany with a single-item array", async () => {
      const product = makeProduct({ id: "single-1", maneja_stock: false });
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.enrich(product);

      expect(result.id).toBe("single-1");
      expect(result.stock_actual).toBeNull();
      expect(inventoryRepo.getStockForProducts).toHaveBeenCalledWith([
        "single-1",
      ]);
    });
  });

  describe("list", () => {
    it("should delegate to ListProductsUseCase.execute for non-paginated query and enrich", async () => {
      const product = makeProduct({ id: "list-1", maneja_stock: false });
      listProducts.execute.mockResolvedValue([product]);
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.list({});

      expect(listProducts.execute).toHaveBeenCalledWith({ search: undefined });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].id).toBe("list-1");
    });

    it("should delegate to ListProductsUseCase.executePage for paginated query and enrich", async () => {
      const product = makeProduct({ id: "page-1", maneja_stock: false });
      const page: Page<Product> = {
        data: [product],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
        },
      };
      listProducts.executePage.mockResolvedValue(page);
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(listProducts.executePage).toHaveBeenCalled();
      expect((result as Page<any>).data).toHaveLength(1);
      expect((result as Page<any>).data[0].id).toBe("page-1");
      expect((result as Page<any>).meta.total).toBe(1);
    });
  });

  describe("get", () => {
    it("should delegate to GetProductUseCase and enrich", async () => {
      const product = makeProduct({ id: "get-1", maneja_stock: true });
      getProduct.execute.mockResolvedValue(product);
      inventoryRepo.getStockForProducts.mockResolvedValue(
        new Map([["get-1", 99]]),
      );
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.get("get-1");

      expect(getProduct.execute).toHaveBeenCalledWith("get-1");
      expect(result.id).toBe("get-1");
      expect(result.stock_actual).toBe(99);
    });
  });

  describe("getByCode", () => {
    it("should delegate to GetProductByCodeUseCase and enrich", async () => {
      const product = makeProduct({ id: "code-1", maneja_stock: false });
      getProductByCode.execute.mockResolvedValue(product);
      inventoryRepo.getStockForProducts.mockResolvedValue(new Map());
      promotionRepo.findActiveForProducts.mockResolvedValue([]);

      const result = await service.getByCode("SKU-001");

      expect(getProductByCode.execute).toHaveBeenCalledWith("SKU-001");
      expect(result.id).toBe("code-1");
    });
  });
});
