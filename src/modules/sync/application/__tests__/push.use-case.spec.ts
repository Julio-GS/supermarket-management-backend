import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { PushUseCase } from "../push.use-case";
import { IdempotencyService } from "../idempotency.service";
import { SyncTombstoneEntity } from "../../infrastructure/sync-tombstone.entity";
import { SaleRepositoryPort } from "../../../sales/application/sale.repository.port";
import { InventoryRepositoryPort } from "../../../inventory/application/inventory.repository.port";
import { ProductRepositoryPort } from "../../../products/application/product.repository.port";
import { PromotionRepositoryPort } from "../../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../../reports/application/provider-purchase.repository.port";
import { TransactionRunnerPort } from "../../../../shared/database/transaction-runner.port";
import { AutoLabelJobService } from "../../../label-printer/application/auto-label-job.service";
import type { SyncPushEntry } from "../sync.types";
import { Sale } from "../../../sales/domain/sale.entity";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PushUseCase", () => {
  let useCase: PushUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushUseCase,
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: SaleRepositoryPort, useValue: mockSaleRepo },
        { provide: InventoryRepositoryPort, useValue: mockInventoryRepo },
        { provide: ProductRepositoryPort, useValue: mockProductRepo },
        { provide: PromotionRepositoryPort, useValue: mockPromotionRepo },
        { provide: ProviderPurchaseRepositoryPort, useValue: mockProviderPurchaseRepo },
        { provide: TransactionRunnerPort, useValue: mockTransactionRunner },
        { provide: AutoLabelJobService, useValue: mockAutoLabel },
            { provide: getRepositoryToken(SyncTombstoneEntity), useValue: mockTombstoneRepo },
      ],
    }).compile();

    useCase = module.get<PushUseCase>(PushUseCase);
  });

  // -----------------------------------------------------------------------
  // RED — duplicate idempotency
  // -----------------------------------------------------------------------

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
      // Must NOT call saleRepo.create for a duplicate
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
  });

  // -----------------------------------------------------------------------
  // RED — idempotency violation
  // -----------------------------------------------------------------------

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
  });

  // -----------------------------------------------------------------------
  // RED — successful sale push
  // -----------------------------------------------------------------------

  describe("sale_create push", () => {
    it("creates the sale and returns accepted with server metadata", async () => {
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      const mockSale = {
        id: "srv-sale-1",
        total: "100.00",
        invoice_status: "none",
        created_at: new Date(),
      } as Sale;

      mockSaleRepo.create.mockResolvedValue(mockSale);

      const input = [makeSaleEntry()];
      const response = await useCase.execute({ entries: input });

      expect(response.results).toHaveLength(1);
      const result = response.results[0];
      expect(result.status).toBe("accepted");
      expect(result.server_id).toBe("srv-sale-1");

      // Verify it recorded the result
      expect(mockIdempotency.recordResult).toHaveBeenCalledWith(
        "inst-1:out-1",
        expect.anything(),
        expect.objectContaining({
          status: "accepted",
          server_id: "srv-sale-1",
        }),
      );

      // Verify sale was created (basic smoke — the payload mapping belongs to
      // the implementation design)
      expect(mockSaleRepo.create).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // RED — successful stock adjust push
  // -----------------------------------------------------------------------

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
        expect.any(String),
        "sale-1",
        "sale",
      );
    });
  });

  // -----------------------------------------------------------------------
  // RED — "entry 7 fails, entries 8+ stay pending"
  // -----------------------------------------------------------------------

  describe("partial failure — later entries remain pending", () => {
    it("when entry 3 fails, entry 4 stays pending (not attempted)", async () => {
      // entry 1 (success), entry 2 (success), entry 3 (fail), entry 4 (pending)
      mockIdempotency.hasBeenProcessed.mockResolvedValue(false);
      mockIdempotency.checkIdempotencyViolation.mockResolvedValue(undefined);

      // First two succeed
      mockSaleRepo.create.mockResolvedValue({ id: "srv-1" } as Sale);

      // Third throws transient error
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

      // Entry 4 MUST be exactly blocked (not attempted) after entry 3 fails.
      expect(response.results[3].status).toBe("blocked");
      expect(response.results[3].reason).toContain("not attempted");
    });
  });

  // -----------------------------------------------------------------------
  // RED — product_create, product_update, product_delete (Slice 5)
  // -----------------------------------------------------------------------

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

      // Assert tombstone was recorded with correct fields
      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "prod-to-delete",
          aggregate_type: "product",
          operation_type: "product_delete",
        }),
      );
    });
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

  // -----------------------------------------------------------------------
  // RED — promotion_create, promotion_update, promotion_delete (Slice 5)
  // -----------------------------------------------------------------------

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

      // Assert tombstone was recorded with correct fields
      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "promo-to-delete",
          aggregate_type: "promotion",
          operation_type: "promotion_delete",
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // RED — provider_purchase_create, provider_purchase_update (Slice 5)
  // -----------------------------------------------------------------------

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

      // Assert tombstone was recorded with correct fields
      expect(mockTombstoneRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: "pp-to-delete",
          aggregate_type: "provider_purchase",
          operation_type: "provider_purchase_delete",
        }),
      );
    });
  });
});
