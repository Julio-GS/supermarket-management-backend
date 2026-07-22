import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { PullUseCase } from "../pull.use-case";
import { SyncTombstoneEntity } from "../../infrastructure/sync-tombstone.entity";
import { ProductRepositoryPort } from "../../../products/application/product.repository.port";
import { InventoryRepositoryPort } from "../../../inventory/application/inventory.repository.port";
import { PromotionRepositoryPort } from "../../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../../reports/application/provider-purchase.repository.port";
import { Product } from "../../../products/domain/product.entity";
import { InventoryBalance } from "../../../inventory/domain/inventory.entity";
import { Promotion } from "../../../promotions/domain/promotion.entity";
import { ProviderPurchase } from "../../../reports/domain/provider-purchase.entity";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T0 = new Date("2026-07-01T00:00:00.000Z");
const T1 = new Date("2026-07-17T00:00:00.000Z");
const T2 = new Date("2026-07-18T10:00:00.000Z");

const makeProduct = (id: string, updatedAt: Date): Product =>
  ({
    id,
    detalle: `Product ${id}`,
    costo_neto: null,
    costo_final: null,
    iva: null,
    cambio_costo: "fixed",
    cambio_precio: "fixed",
    etiqueta: "",
    facturable: true,
    maneja_stock: true,
    codigos: [],
    pricing_mode: "fixed",
    is_protected: false,
    created_at: T0,
    updated_at: updatedAt,
  }) as Product;

const makeBalance = (productId: string, stock: number, updatedAt: Date): InventoryBalance =>
  ({
    product_id: productId,
    stock_actual: stock,
    updated_at: updatedAt,
  }) as InventoryBalance;

const makePromotion = (id: string, updatedAt: Date): Promotion =>
  ({
    id,
    name: `Promo ${id}`,
    description: null,
    scope: "product",
    product_id: null,
    type: "percentage" as Promotion["type"],
    discount_percent: 10,
    start_date: null,
    end_date: null,
    weekdays: null,
    enabled: true,
    created_at: T0,
    updated_at: updatedAt,
  }) as unknown as Promotion;

const makePurchase = (id: string, updatedAt: Date): ProviderPurchase =>
  ({
    id,
    provider_name: "Test Provider",
    amount: "100.00",
    payment_method: null,
    created_at: T0,
    updated_at: updatedAt,
  }) as ProviderPurchase;

const mockProductRepo = { findAll: jest.fn() };
const mockInventoryRepo = { findAllBalances: jest.fn() };
const mockPromotionRepo = { findAll: jest.fn() };
const mockProviderPurchaseRepo = { findAll: jest.fn() };

const mockTombstoneRepo = {
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
};

describe("PullUseCase", () => {
  let useCase: PullUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PullUseCase,
        { provide: ProductRepositoryPort, useValue: mockProductRepo },
        { provide: InventoryRepositoryPort, useValue: mockInventoryRepo },
        { provide: PromotionRepositoryPort, useValue: mockPromotionRepo },
        {
          provide: ProviderPurchaseRepositoryPort,
          useValue: mockProviderPurchaseRepo,
        },
        { provide: getRepositoryToken(SyncTombstoneEntity), useValue: mockTombstoneRepo },
      ],
    }).compile();

    useCase = module.get<PullUseCase>(PullUseCase);
  });

  // -----------------------------------------------------------------------
  // RED — empty pull (no changes since cursor)
  // -----------------------------------------------------------------------

  describe("empty pull", () => {
    it("returns has_more=false and the current cursor when no changes exist", async () => {
      const cursor = T2.toISOString(); // cursor is AFTER all entity updates

      // All entities updated before cursor
      mockProductRepo.findAll.mockResolvedValue([makeProduct("p1", T1)]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([makeBalance("p2", 5, T1)]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      expect(response.changes).toHaveLength(0);
      expect(response.has_more).toBe(false);
      expect(response.cursor).toBeTruthy();
      expect(new Date(response.cursor).getTime()).toBeGreaterThanOrEqual(
        new Date(cursor).getTime(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // RED — changes since cursor
  // -----------------------------------------------------------------------

  describe("changes since cursor", () => {
    it("returns product update changes for products updated after cursor", async () => {
      const cursor = T1.toISOString();

      mockProductRepo.findAll.mockResolvedValue([makeProduct("prod-1", T2)]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      const productChanges = response.changes.filter(
        (c) => c.aggregate_type === "product",
      );
      expect(productChanges.length).toBe(1);
      expect(productChanges[0].id).toBe("prod-1");
      expect(productChanges[0].server_version).toBeTruthy();
    });

    it("includes stock balance changes", async () => {
      const cursor = T1.toISOString();

      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([
        makeBalance("prod-2", 50, T2),
      ]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      const stockChanges = response.changes.filter(
        (c) => c.aggregate_type === "stock",
      );
      expect(stockChanges.length).toBe(1);
      expect(stockChanges[0].id).toBe("prod-2");
    });

    it("includes stock balances updated BEFORE cursor are excluded", async () => {
      const cursor = T2.toISOString();

      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([
        makeBalance("prod-old", 5, T1), // updated before cursor
      ]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      expect(response.changes).toHaveLength(0);
    });

    it("sets has_more=true when there are MORE changes than the limit", async () => {
      const cursor = T1.toISOString();

      const products = Array.from({ length: 12 }, (_, i) =>
        makeProduct(`prod-${i}`, T2),
      );
      mockProductRepo.findAll.mockResolvedValue(products);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 10 });

      expect(response.has_more).toBe(true);
      expect(response.changes).toHaveLength(10);
      // When has_more=true, the cursor MUST be a composite of the last
      // returned change's timestamp AND id so the next pull can skip
      // already-returned same-timestamp records.
      const last = response.changes[9];
      expect(response.cursor).toBe(
        `${last.server_applied_at}|${last.id}`,
      );
    });

    it("returns cursor=now when there are NO more changes (has_more=false)", async () => {
      const cursor = T1.toISOString();
      const before = new Date();

      mockProductRepo.findAll.mockResolvedValue([makeProduct("p1", T2)]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      expect(response.has_more).toBe(false);
      // When has_more=false, cursor should be a recent timestamp, not the
      // last change timestamp (which would cause re-delivery).
      expect(new Date(response.cursor).getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });

    it("does not skip records when multiple changes share the same timestamp at page boundary", async () => {
      const cursor = T1.toISOString();

      // All 5 products share the same updated_at (T2)
      const products = Array.from({ length: 5 }, (_, i) =>
        makeProduct(`prod-${i}`, T2),
      );
      mockProductRepo.findAll.mockResolvedValue(products);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      // Page 1: limit=3, should return first 3
      const page1 = await useCase.execute({ cursor, limit: 3 });
      expect(page1.changes).toHaveLength(3);
      expect(page1.has_more).toBe(true);
      const page1Ids = page1.changes.map((c) => c.id);

      // Page 2: should return the REMAINING 2, NOT repeat page 1
      const page2 = await useCase.execute({
        cursor: page1.cursor,
        limit: 3,
      });
      expect(page2.changes.length).toBe(2); // 5 total - 3 = 2 remaining
      expect(page2.has_more).toBe(false);
      const page2Ids = page2.changes.map((c) => c.id);

      // No record from page 1 should appear in page 2
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }

      // All 5 records reached across the two pages
      const allIds = [...page1Ids, ...page2Ids].sort();
      expect(allIds).toEqual([
        "prod-0",
        "prod-1",
        "prod-2",
        "prod-3",
        "prod-4",
      ]);
    });

    it("reaches every record across multiple pages when many share the same timestamp", async () => {
      // 8 records, all same timestamp, limit=3 => ceil(8/3) = 3 pages
      const products = Array.from({ length: 8 }, (_, i) =>
        makeProduct(`item-${i}`, T2),
      );
      mockProductRepo.findAll.mockResolvedValue(products);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      let cursor: string | undefined = T1.toISOString();
      const allSeenIds: string[] = [];
      let pages = 0;

      // Paginate until has_more=false
      while (true) {
        const response = await useCase.execute({ cursor, limit: 3 });
        pages++;
        const pageIds = response.changes.map((c) => c.id);

        // No duplicates: each page must only return unseen records
        for (const id of pageIds) {
          expect(allSeenIds).not.toContain(id);
        }
        allSeenIds.push(...pageIds);

        if (!response.has_more) break;
        cursor = response.cursor;
      }

      expect(pages).toBe(3); // ceil(8/3) = 3
      expect(allSeenIds.sort()).toEqual([
        "item-0",
        "item-1",
        "item-2",
        "item-3",
        "item-4",
        "item-5",
        "item-6",
        "item-7",
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Promotion & provider purchase changes
  // -----------------------------------------------------------------------

  describe("promotion and provider purchase changes", () => {
    it("includes promotion updates when updated after cursor", async () => {
      const cursor = T1.toISOString();

      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([
        makePromotion("promo-1", T2),
      ]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({ cursor, limit: 50 });

      const promoChanges = response.changes.filter(
        (c) => c.aggregate_type === "promotion",
      );
      expect(promoChanges.length).toBe(1);
      expect(promoChanges[0].id).toBe("promo-1");
    });

    it("includes provider purchase changes when updated after cursor", async () => {
      const cursor = T1.toISOString();

      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([
        makePurchase("pp-1", T2),
      ]);

      const response = await useCase.execute({ cursor, limit: 50 });

      const ppChanges = response.changes.filter(
        (c) => c.aggregate_type === "provider_purchase",
      );
      expect(ppChanges.length).toBe(1);
      expect(ppChanges[0].id).toBe("pp-1");
    });
  });

  // -----------------------------------------------------------------------
  // RED — default cursor (epoch)
  // -----------------------------------------------------------------------

  describe("tombstone emission", () => {
    it("emits deleted=true changes for tombstone records since cursor", async () => {
      const cursor = T1.toISOString();

      // Active entities: empty (no changes)
      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      // Tombstone: product deleted after cursor
      mockTombstoneRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            entity_id: "prod-deleted-1",
            aggregate_type: "product",
            operation_type: "product_delete",
            deleted_at: T2,
          },
        ]),
      } as unknown as ReturnType<typeof mockTombstoneRepo.createQueryBuilder>);

      const response = await useCase.execute({ cursor, limit: 50 });

      const deletedChanges = response.changes.filter((c) => c.deleted);
      expect(deletedChanges.length).toBe(1);
      expect(deletedChanges[0]).toMatchObject({
        id: "prod-deleted-1",
        aggregate_type: "product",
        operation_type: "product_delete",
        deleted: true,
      });
    });

    it("passes cursor to tombstone where clause", async () => {
      const cursor = T2.toISOString();

      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const mockWhere = jest.fn().mockReturnThis();
      const mockOrderBy = jest.fn().mockReturnThis();
      const mockAddOrderBy = jest.fn().mockReturnThis();
      const mockGetMany = jest.fn().mockResolvedValue([]);

      mockTombstoneRepo.createQueryBuilder.mockReturnValue({
        where: mockWhere,
        orderBy: mockOrderBy,
        addOrderBy: mockAddOrderBy,
        getMany: mockGetMany,
      } as unknown as ReturnType<typeof mockTombstoneRepo.createQueryBuilder>);

      await useCase.execute({ cursor, limit: 50 });

      // Verify that the cursor time was passed as a parameter to the where clause
      expect(mockWhere).toHaveBeenCalledWith(
        expect.stringContaining("deleted_at"),
        expect.objectContaining({
          cursorTime: expect.any(String),
        }),
      );
    });
  });

  describe("default cursor", () => {
    it("uses epoch as the default cursor when none is provided", async () => {
      mockProductRepo.findAll.mockResolvedValue([makeProduct("p1", T2)]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);

      const response = await useCase.execute({});

      // T2 is after epoch, so product should be included
      expect(response.changes.length).toBeGreaterThanOrEqual(1);
      expect(response.cursor).toBeTruthy();
    });
  });
});
