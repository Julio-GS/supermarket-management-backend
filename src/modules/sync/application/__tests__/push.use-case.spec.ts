import { Test, TestingModule } from "@nestjs/testing";
import { PushUseCase } from "../push.use-case";
import { IdempotencyService } from "../idempotency.service";
import {
  SYNC_OPERATION_HANDLERS,
  SyncOperationHandler,
} from "../ports/sync-operation-handler.port";
import { SaleSyncHandler } from "../handlers/sale-sync.handler";
import { StockSyncHandler } from "../handlers/stock-sync.handler";
import { ProductSyncHandler } from "../handlers/product-sync.handler";
import { PromotionSyncHandler } from "../handlers/promotion-sync.handler";
import { ProviderPurchaseSyncHandler } from "../handlers/provider-purchase-sync.handler";
import { SaleRepositoryPort } from "../../../sales/application/sale.repository.port";
import { InventoryRepositoryPort } from "../../../inventory/application/inventory.repository.port";
import { ProductRepositoryPort } from "../../../products/application/product.repository.port";
import { PromotionRepositoryPort } from "../../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../../reports/application/provider-purchase.repository.port";
import { TransactionRunnerPort } from "../../../../shared/database/transaction-runner.port";
import { AutoLabelJobService } from "../../../label-printer/application/auto-label-job.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SyncTombstoneEntity } from "../../infrastructure/sync-tombstone.entity";
import type { SyncPushEntry } from "../sync.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaleEntry(overrides: Partial<SyncPushEntry> = {}): SyncPushEntry {
  return {
    id: "out-1",
    idempotency_key: "inst-1:out-1",
    operation_type: "sale_create",
    aggregate_type: "sale",
    aggregate_id: "sale-1",
    payload: {
      saleId: "sale-1",
      total: "100.00",
      items: [
        {
          productId: "prod-1",
          name: "Test Product",
          quantity: 2,
          unitPrice: "50.00",
          subtotal: "100.00",
          discountAmount: "0.00",
        },
      ],
      payments: [{ method: "cash", amount: "100.00" }],
      createdAt: "2026-07-18T10:00:00.000Z",
    },
    actor_user_id: "user-1",
    created_at: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}

function makeStockAdjustEntry(
  overrides: Partial<SyncPushEntry> = {},
): SyncPushEntry {
  return {
    id: "out-2",
    idempotency_key: "inst-1:out-2",
    operation_type: "stock_adjust",
    aggregate_type: "stock",
    aggregate_id: "prod-1",
    payload: {
      product_id: "prod-1",
      quantity: -2,
      reason: "sale",
      referenceId: "sale-1",
    },
    actor_user_id: "user-1",
    created_at: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const mockIdempotency = {
  hasBeenProcessed: jest.fn(),
  checkIdempotencyViolation: jest.fn(),
  recordResult: jest.fn(),
  findExistingResult: jest.fn(),
};

const mockSaleRepo = {
  create: jest.fn(),
};

const mockInventoryRepo = {
  adjustBalance: jest.fn(),
};

const mockProductRepo = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

const mockPromotionRepo = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

const mockProviderPurchaseRepo = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

const mockTombstoneRepo = {
  save: jest.fn(),
};

const mockTransactionRunner = {
  run: jest.fn((work) => work({})),
};

const mockAutoLabel = {
  onProductPriceChanged: jest.fn(),
};

describe("PushUseCase", () => {
  let useCase: PushUseCase;
  let saleHandler: SaleSyncHandler;
  let stockHandler: StockSyncHandler;
  let productHandler: ProductSyncHandler;
  let promotionHandler: PromotionSyncHandler;
  let providerPurchaseHandler: ProviderPurchaseSyncHandler;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushUseCase,
        { provide: IdempotencyService, useValue: mockIdempotency },
        SaleSyncHandler,
        StockSyncHandler,
        ProductSyncHandler,
        PromotionSyncHandler,
        ProviderPurchaseSyncHandler,
        { provide: SaleRepositoryPort, useValue: mockSaleRepo },
        { provide: InventoryRepositoryPort, useValue: mockInventoryRepo },
        { provide: ProductRepositoryPort, useValue: mockProductRepo },
        { provide: PromotionRepositoryPort, useValue: mockPromotionRepo },
        { provide: ProviderPurchaseRepositoryPort, useValue: mockProviderPurchaseRepo },
        { provide: TransactionRunnerPort, useValue: mockTransactionRunner },
        { provide: AutoLabelJobService, useValue: mockAutoLabel },
        { provide: getRepositoryToken(SyncTombstoneEntity), useValue: mockTombstoneRepo },
        {
          provide: SYNC_OPERATION_HANDLERS,
          useFactory: (
            sale: SaleSyncHandler,
            stock: StockSyncHandler,
            product: ProductSyncHandler,
            promotion: PromotionSyncHandler,
            providerPurchase: ProviderPurchaseSyncHandler,
          ): SyncOperationHandler[] => [
            sale,
            stock,
            product,
            promotion,
            providerPurchase,
          ],
          inject: [
            SaleSyncHandler,
            StockSyncHandler,
            ProductSyncHandler,
            PromotionSyncHandler,
            ProviderPurchaseSyncHandler,
          ],
        },
      ],
    }).compile();

    useCase = module.get<PushUseCase>(PushUseCase);
    saleHandler = module.get<SaleSyncHandler>(SaleSyncHandler);
    stockHandler = module.get<StockSyncHandler>(StockSyncHandler);
    productHandler = module.get<ProductSyncHandler>(ProductSyncHandler);
    promotionHandler = module.get<PromotionSyncHandler>(PromotionSyncHandler);
    providerPurchaseHandler = module.get<ProviderPurchaseSyncHandler>(
      ProviderPurchaseSyncHandler,
    );
  });

  // -------------------------------------------------------------------------
  // Constructor & Handler Registry
  // -------------------------------------------------------------------------

  describe("constructor and handler registry", () => {
    it("fails fast when duplicate handlers register the same operation", () => {
      const handler1: SyncOperationHandler = {
        supportedOperations: new Set(["sale_create"]),
        handle: jest.fn(),
      };
      const handler2: SyncOperationHandler = {
        supportedOperations: new Set(["sale_create"]),
        handle: jest.fn(),
      };

      expect(
        () =>
          new PushUseCase(mockIdempotency as any, [handler1, handler2]),
      ).toThrow(/duplicate.*sale_create/i);
    });

    it("handles empty handler array gracefully without errors", () => {
      const emptyUseCase = new PushUseCase(mockIdempotency as any, []);
      expect(emptyUseCase).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate Idempotency
  // -------------------------------------------------------------------------

  describe("duplicate idempotency", () => {
    it("returns the original result without re-creating when a sale is a duplicate", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(true);
      mockIdempotency.findExistingResult.mockResolvedValue({
        status: "accepted",
        server_id: "srv-sale-1",
        server_version: "v5",
      });

      const input = [makeSaleEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      const result = response.results[0];
      expect(result.status).toBe("duplicate");
      expect(result.server_id).toBe("srv-sale-1");
      expect(mockSaleRepo.create).not.toHaveBeenCalled();
    });

    it("returns the original result without re-creating when a stock adjust is a duplicate", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(true);
      mockIdempotency.findExistingResult.mockResolvedValue({
        status: "accepted",
        server_id: null,
        server_version: "v3",
      });

      const input = [makeStockAdjustEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe("duplicate");
      expect(mockInventoryRepo.adjustBalance).not.toHaveBeenCalled();
    });

    it("duplicate entry does NOT block subsequent entries in batch", async () => {
      mockIdempotency.hasBeenProcessed
        .mockResolvedValueOnce(true) // First entry is duplicate
        .mockResolvedValueOnce(false); // Second entry is new
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);
      mockIdempotency.findExistingResult.mockResolvedValue({
        status: "accepted",
        server_id: "srv-dup-1",
      });

      mockSaleRepo.create.mockResolvedValue({ id: "srv-sale-2" });

      const entries = [
        makeSaleEntry({ id: "out-dup", idempotency_key: "inst:dup" }),
        makeSaleEntry({ id: "out-new", idempotency_key: "inst:new" }),
      ];

      const response = await useCase.execute({ entries });

      expect(response.results).toHaveLength(2);
      expect(response.results[0].status).toBe("duplicate");
      expect(response.results[1].status).toBe("accepted");
      expect(response.results[1].server_id).toBe("srv-sale-2");
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency Violation
  // -------------------------------------------------------------------------

  describe("idempotency violation", () => {
    it("marks the entry as conflict when idempotency violation is detected", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockRejectedValue(
        new Error("Idempotency violation"),
      );

      const input = [makeSaleEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe("conflict");
      expect(response.results[0].reason).toContain("Idempotency violation");
    });

    it("idempotency violation with string rejection error maps reason cleanly", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockRejectedValue("Raw string error");

      const input = [makeSaleEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results[0].status).toBe("conflict");
      expect(response.results[0].reason).toBe("Raw string error");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime Type Guard Validation
  // -------------------------------------------------------------------------

  describe("payload and entry validation", () => {
    it("returns validation_error when payload fails type guard", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      const invalidEntry: SyncPushEntry = {
        id: "out-bad",
        idempotency_key: "inst-1:out-bad",
        operation_type: "sale_create",
        aggregate_type: "sale",
        aggregate_id: "sale-1",
        payload: {
          total: undefined,
        },
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [invalidEntry] });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe("validation_error");
      expect(response.results[0].reason).toContain("Invalid payload");
      expect(mockSaleRepo.create).not.toHaveBeenCalled();
    });

    it("returns validation_error when aggregate_type does not match operation_type", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      const mismatchedEntry: SyncPushEntry = {
        id: "out-mismatch",
        idempotency_key: "inst-1:out-mismatch",
        operation_type: "sale_create",
        aggregate_type: "stock" as any,
        aggregate_id: "sale-1",
        payload: makeSaleEntry().payload,
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [mismatchedEntry] });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe("validation_error");
      expect(response.results[0].reason).toContain("requires aggregate_type 'sale'");
    });

    it("returns validation_error when operation is not supported by any handler", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      // Custom use-case without promotion handler
      const partialUseCase = new PushUseCase(mockIdempotency as any, [
        saleHandler,
      ]);

      const promoEntry: SyncPushEntry = {
        id: "out-p",
        idempotency_key: "inst:p",
        operation_type: "promotion_create",
        aggregate_type: "promotion",
        aggregate_id: "promo-1",
        payload: {
          name: "Promo",
          scope: "global",
          type: "percentage",
        },
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await partialUseCase.execute({ entries: [promoEntry] });

      expect(response.results[0].status).toBe("validation_error");
      expect(response.results[0].reason).toContain("not supported");
    });
  });

  // -------------------------------------------------------------------------
  // Operation Dispatch & Success
  // -------------------------------------------------------------------------

  describe("sale_create push", () => {
    it("creates the sale and returns accepted with server metadata", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      const mockSale = {
        id: "srv-sale-1",
        total: "100.00",
        invoice_status: "none",
        created_at: new Date(),
      };

      mockSaleRepo.create.mockResolvedValue(mockSale);

      const input = [makeSaleEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      const result = response.results[0];
      expect(result.status).toBe("accepted");
      expect(result.server_id).toBe("srv-sale-1");

      expect(mockIdempotency.recordResult).toHaveBeenCalledWith(
        "inst-1:out-1",
        input[0].payload,
        expect.objectContaining({
          status: "accepted",
          server_id: "srv-sale-1",
        }),
      );

      expect(mockSaleRepo.create).toHaveBeenCalled();
    });
  });

  describe("stock_adjust push", () => {
    it("adjusts stock and returns accepted", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockInventoryRepo.adjustBalance.mockResolvedValue({
        id: "mov-1",
        product_id: "prod-1",
        quantity: -2,
      });

      const input = [makeStockAdjustEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe("accepted");

      expect(mockInventoryRepo.adjustBalance).toHaveBeenCalledWith(
        "prod-1",
        -2,
        "adjustment",
        "sale-1",
        "sale",
      );
    });
  });

  describe("product operations (Slice 5)", () => {
    it("accepts product_create and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.create.mockResolvedValue({
        id: "srv-prod-1",
        detalle: "New Product",
      });

      const entry: SyncPushEntry = {
        id: "out-p1",
        idempotency_key: "inst-1:out-p1",
        operation_type: "product_create",
        aggregate_type: "product",
        aggregate_id: "prod-new",
        payload: {
          detalle: "New Product",
          costo_neto: "15.00",
          costo_final: "20.00",
          iva: "21.00",
          cambio_costo: "fixed",
          cambio_precio: "fixed",
          etiqueta: "tag",
          facturable: true,
          maneja_stock: true,
          codigos: ["123"],
        },
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
      expect(response.results[0].server_id).toBe("srv-prod-1");
      expect(mockProductRepo.create).toHaveBeenCalled();
    });

    it("accepts product_update and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.findById.mockResolvedValue({ updated_at: "v5" });
      mockProductRepo.update.mockResolvedValue({
        id: "prod-existing",
        detalle: "Updated Product",
      });

      const entry: SyncPushEntry = {
        id: "out-pu1",
        idempotency_key: "inst-1:out-pu1",
        operation_type: "product_update",
        aggregate_type: "product",
        aggregate_id: "prod-existing",
        payload: { detalle: "Updated Product" },
        base_server_version: "v5",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
      expect(response.results[0].server_id).toBe("prod-existing");
    });

    it("returns conflict when product_update has version mismatch", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.findById.mockResolvedValue({ updated_at: "v6" });

      const entry: SyncPushEntry = {
        id: "out-pu-conflict",
        idempotency_key: "inst-1:out-pu-conflict",
        operation_type: "product_update",
        aggregate_type: "product",
        aggregate_id: "prod-existing",
        payload: { detalle: "Updated Product" },
        base_server_version: "v5",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("conflict");
      expect(response.results[0].server_version).toBe("v6");
      expect(mockIdempotency.recordResult).not.toHaveBeenCalled();
    });

    it("accepts product_delete, records tombstone, and returns accepted", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.delete.mockResolvedValue(undefined);

      const entry: SyncPushEntry = {
        id: "out-pd1",
        idempotency_key: "inst-1:out-pd1",
        operation_type: "product_delete",
        aggregate_type: "product",
        aggregate_id: "prod-to-delete",
        payload: {},
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");

      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "prod-to-delete",
          aggregate_type: "product",
          operation_type: "product_delete",
        }),
      );
    });

    it("product_update with price change triggers auto label job", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.findById.mockResolvedValue({
        id: "prod-existing",
        detalle: "Old Name",
        costo_final: "100.00",
        codigos: ["SKU001"],
        updated_at: "v5",
      });
      mockProductRepo.update.mockResolvedValue({
        id: "prod-existing",
        detalle: "Old Name",
        costo_final: "200.00",
        codigos: ["SKU001"],
      });
      mockAutoLabel.onProductPriceChanged.mockResolvedValue(null);

      const entry: SyncPushEntry = {
        id: "out-pu-price",
        idempotency_key: "inst-1:out-pu-price",
        operation_type: "product_update",
        aggregate_type: "product",
        aggregate_id: "prod-existing",
        payload: { costo_final: "200.00" },
        base_server_version: "v5",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });

      expect(response.results[0].status).toBe("accepted");
      expect(mockAutoLabel.onProductPriceChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: "prod-existing", costo_final: "100.00" }),
        "200.00",
        expect.anything(),
      );
    });

    it("product_update without price change does not trigger label job", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.findById.mockResolvedValue({
        id: "prod-existing",
        detalle: "Product",
        costo_final: "150.00",
        codigos: ["SKU001"],
        updated_at: "v5",
      });
      mockProductRepo.update.mockResolvedValue({
        id: "prod-existing",
        detalle: "New Name",
        costo_final: "150.00",
        codigos: ["SKU001"],
      });

      const entry: SyncPushEntry = {
        id: "out-pu-noprice",
        idempotency_key: "inst-1:out-pu-noprice",
        operation_type: "product_update",
        aggregate_type: "product",
        aggregate_id: "prod-existing",
        payload: { detalle: "New Name" },
        base_server_version: "v5",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });

      expect(response.results[0].status).toBe("accepted");
      expect(mockAutoLabel.onProductPriceChanged).not.toHaveBeenCalled();
    });
  });

  describe("promotion operations (Slice 5)", () => {
    it("accepts promotion_create and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockPromotionRepo.create.mockResolvedValue({
        id: "srv-promo-1",
        name: "Summer Sale",
      });

      const entry: SyncPushEntry = {
        id: "out-promo1",
        idempotency_key: "inst-1:out-promo1",
        operation_type: "promotion_create",
        aggregate_type: "promotion",
        aggregate_id: "promo-new",
        payload: {
          name: "Summer Sale",
          description: "Discount",
          scope: "product",
          product_id: "prod-1",
          type: "percentage",
          discount_percent: 10,
        },
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
      expect(response.results[0].server_id).toBe("srv-promo-1");
    });

    it("accepts promotion_update and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockPromotionRepo.findById.mockResolvedValue({ updated_at: "v3" });
      mockPromotionRepo.update.mockResolvedValue({
        id: "promo-existing",
        name: "Updated",
      });

      const entry: SyncPushEntry = {
        id: "out-promo2",
        idempotency_key: "inst-1:out-promo2",
        operation_type: "promotion_update",
        aggregate_type: "promotion",
        aggregate_id: "promo-existing",
        payload: { enabled: false },
        base_server_version: "v3",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
    });

    it("returns conflict on promotion_update version mismatch", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockPromotionRepo.findById.mockResolvedValue({ updated_at: "v4" });

      const entry: SyncPushEntry = {
        id: "out-promo-conflict",
        idempotency_key: "inst:promo-conflict",
        operation_type: "promotion_update",
        aggregate_type: "promotion",
        aggregate_id: "promo-1",
        payload: { name: "New Name" },
        base_server_version: "v3",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("conflict");
      expect(response.results[0].server_version).toBe("v4");
      expect(mockPromotionRepo.update).not.toHaveBeenCalled();
    });

    it("accepts promotion_delete, records tombstone, and returns accepted", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockPromotionRepo.delete.mockResolvedValue(undefined);

      const entry: SyncPushEntry = {
        id: "out-promo3",
        idempotency_key: "inst-1:out-promo3",
        operation_type: "promotion_delete",
        aggregate_type: "promotion",
        aggregate_id: "promo-to-delete",
        payload: {},
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");

      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "promo-to-delete",
          aggregate_type: "promotion",
          operation_type: "promotion_delete",
        }),
      );
    });
  });

  describe("provider purchase operations (Slice 5)", () => {
    it("accepts provider_purchase_create and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProviderPurchaseRepo.create.mockResolvedValue({
        id: "srv-pp-1",
        provider_name: "Acme Corp",
        amount: "500.00",
      });

      const entry: SyncPushEntry = {
        id: "out-pp1",
        idempotency_key: "inst-1:out-pp1",
        operation_type: "provider_purchase_create",
        aggregate_type: "provider_purchase",
        aggregate_id: "pp-new",
        payload: {
          provider_name: "Acme Corp",
          amount: "500.00",
          payment_method: "transfer",
        },
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
      expect(response.results[0].server_id).toBe("srv-pp-1");
    });

    it("accepts provider_purchase_update and returns server_id", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProviderPurchaseRepo.findById.mockResolvedValue({ updated_at: "v2" });
      mockProviderPurchaseRepo.update.mockResolvedValue({
        id: "pp-existing",
        provider_name: "Updated Corp",
        amount: "600.00",
      });

      const entry: SyncPushEntry = {
        id: "out-pp2",
        idempotency_key: "inst-1:out-pp2",
        operation_type: "provider_purchase_update",
        aggregate_type: "provider_purchase",
        aggregate_id: "pp-existing",
        payload: { amount: "600.00" },
        base_server_version: "v2",
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");
    });

    it("returns conflict on provider_purchase_update version mismatch", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProviderPurchaseRepo.findById.mockResolvedValue({ updated_at: "v3" });

      const entry: SyncPushEntry = {
        id: "out-pp-conflict",
        idempotency_key: "inst:pp-conflict",
        operation_type: "provider_purchase_update",
        aggregate_type: "provider_purchase",
        aggregate_id: "pp-1",
        payload: { amount: "100.00" },
        base_server_version: "v2",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("conflict");
      expect(response.results[0].server_version).toBe("v3");
      expect(mockProviderPurchaseRepo.update).not.toHaveBeenCalled();
    });

    it("accepts provider_purchase_delete, records tombstone, and returns accepted", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProviderPurchaseRepo.delete.mockResolvedValue(undefined);

      const entry: SyncPushEntry = {
        id: "out-pp3",
        idempotency_key: "inst-1:out-pp3",
        operation_type: "provider_purchase_delete",
        aggregate_type: "provider_purchase",
        aggregate_id: "pp-to-delete",
        payload: {},
        actor_user_id: "user-1",
        created_at: "2026-07-18T10:00:00.000Z",
      };

      const response = await useCase.execute({ entries: [entry] });
      expect(response.results[0].status).toBe("accepted");

      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "pp-to-delete",
          aggregate_type: "provider_purchase",
          operation_type: "provider_purchase_delete",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cascade Blocking & Error Trapping
  // -------------------------------------------------------------------------

  describe("partial failure and cascade blocking", () => {
    it("when an entry fails with transient error, subsequent entries are marked blocked", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockSaleRepo.create.mockResolvedValue({ id: "srv-1" });
      mockInventoryRepo.adjustBalance.mockRejectedValue(
        new Error("Database connection lost"),
      );

      const entries = [
        makeSaleEntry({ id: "out-1", idempotency_key: "inst-1:out-1" }),
        makeSaleEntry({ id: "out-2", idempotency_key: "inst-1:out-2" }),
        makeStockAdjustEntry({
          id: "out-3",
          idempotency_key: "inst-1:out-3",
        }),
        makeSaleEntry({ id: "out-4", idempotency_key: "inst-1:out-4" }),
      ];

      const response = await useCase.execute({ entries });

      expect(response.results).toHaveLength(4);
      expect(response.results[0].status).toBe("accepted");
      expect(response.results[1].status).toBe("accepted");
      expect(response.results[2].status).toBe("transient_error");
      expect(response.results[2].reason).toContain("Database connection lost");

      expect(response.results[3].status).toBe("blocked");
      expect(response.results[3].reason).toContain("not attempted");
    });

    it("when handler throws a non-Error object, it stringifies reason and cascades blocked", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockInventoryRepo.adjustBalance.mockRejectedValue("String failure");

      const entries = [
        makeStockAdjustEntry({ id: "out-str-fail" }),
        makeSaleEntry({ id: "out-after" }),
      ];

      const response = await useCase.execute({ entries });

      expect(response.results[0].status).toBe("transient_error");
      expect(response.results[0].reason).toBe("String failure");
      expect(response.results[1].status).toBe("blocked");
    });

    it("when an entry fails validation, subsequent entries are marked blocked", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      const entries = [
        {
          ...makeSaleEntry({ id: "out-bad", idempotency_key: "inst-1:out-bad" }),
          payload: { total: 123 }, // invalid total type
        },
        makeSaleEntry({ id: "out-next", idempotency_key: "inst-1:out-next" }),
      ];

      const response = await useCase.execute({ entries });

      expect(response.results).toHaveLength(2);
      expect(response.results[0].status).toBe("validation_error");
      expect(response.results[1].status).toBe("blocked");
    });

    it("when an entry encounters version conflict, subsequent entries are marked blocked", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      mockProductRepo.findById.mockResolvedValue({ updated_at: "v9" });

      const entries = [
        {
          id: "out-conf",
          idempotency_key: "inst:conf",
          operation_type: "product_update" as const,
          aggregate_type: "product" as const,
          aggregate_id: "prod-1",
          payload: { detalle: "Change" },
          base_server_version: "v1",
          created_at: "2026-07-18T10:00:00.000Z",
        },
        makeSaleEntry({ id: "out-blocked" }),
      ];

      const response = await useCase.execute({ entries });

      expect(response.results[0].status).toBe("conflict");
      expect(response.results[1].status).toBe("blocked");
    });
  });
});
