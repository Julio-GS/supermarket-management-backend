import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import {
  RetryArcaInvoiceUseCase,
  RetryArcaInvoiceInput,
  RetryArcaInvoiceResult,
} from "./retry-arca-invoice.use-case";
import { SaleRepositoryPort } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { ArcaAlertPort } from "./arca-alert.port";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Sale } from "../domain/sale.entity";

function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-id",
    user_id: "user-id",
    total: "121.00",
    payment_methods: [{ method: "cash", amount: "121.00" }],
    split_ticket_groups: null,
    items: [
      {
        id: "item-id",
        sale_id: "sale-id",
        product_id: "product-id",
        iva: "21.00",
        quantity: 1,
        unit_price: "121.00",
        subtotal: "121.00",
        discount_amount: "0.00",
        applied_promotions: [],
      },
    ],
    invoice_status: "failed",
    cae: null,
    cae_vto: null,
    cbte_nro: null,
    cbte_tipo: null,
    pto_vta: null,
    invoice_requested_at: new Date("2025-01-01T12:00:00Z"),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Sale;
}

describe("RetryArcaInvoiceUseCase", () => {
  let useCase: RetryArcaInvoiceUseCase;
  let sales: jest.Mocked<SaleRepositoryPort>;
  let issueInvoice: { issue: jest.Mock };
  let configService: jest.Mocked<ConfigService>;
  let dataSource: { transaction: jest.Mock };
  let alertPort: jest.Mocked<ArcaAlertPort>;
  let manager: jest.Mocked<Partial<EntityManager>>;

  function buildArcaConfig(overrides: Record<string, unknown> = {}) {
    return {
      enabled: true,
      mock: false,
      production: false,
      cuit: 27939732808,
      pto_vta: 265,
      ...overrides,
    };
  }

  beforeEach(async () => {
    sales = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findPageByUser: jest.fn(),
      findByIdForUser: jest.fn(),
      findByIdForUserForUpdate: jest.fn(),
      markInvoiceIssued: jest.fn(),
      transitionInvoiceStatus: jest.fn(),
    };
    issueInvoice = {
      issue: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    configService.get.mockReturnValue(buildArcaConfig());

    alertPort = {
      alertRetryFailed: jest.fn(),
      alertRetryAmbiguous: jest.fn(),
    };

    manager = {
      connection: undefined as any,
      queryRunner: undefined as any,
    } as unknown as jest.Mocked<Partial<EntityManager>>;

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryArcaInvoiceUseCase,
        { provide: SaleRepositoryPort, useValue: sales },
        { provide: IssueArcaInvoiceUseCase, useValue: issueInvoice },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        { provide: ArcaAlertPort, useValue: alertPort },
      ],
    }).compile();

    useCase = module.get(RetryArcaInvoiceUseCase);
  });

  // ---------------------------------------------------------------------------
  // RED remediation tests — safe two-transaction retry with alerting
  // ---------------------------------------------------------------------------

  describe("safe retry flow — failed→issuing→issued", () => {
    it("atomically transitions failed→issuing before calling ARCA, then issuing→issued on success", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuingSale = buildSale({ invoice_status: "issuing" });
      const issuedSale = buildSale({
        invoice_status: "issued",
        cae: "74154876254185",
        cae_vto: "20250111",
        cbte_nro: 42,
        cbte_tipo: 6,
        pto_vta: 265,
      });

      // Quick read: failed
      sales.findByIdForUser.mockResolvedValue(failedSale);

      // Transaction 1: failed→issuing claim
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(issuingSale);

      // ARCA call (outside transaction)
      issueInvoice.issue.mockResolvedValue({
        cae: "74154876254185",
        cae_vto: "20250111",
        cbte_nro: 42,
        cbte_tipo: 6,
        pto_vta: 265,
      });

      // Transaction 2: issuing→issued
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(issuedSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("issued");
      expect(result.sale.invoice_status).toBe("issued");
      expect(result.sale.cae).toBe("74154876254185");
      expect(result.sale.cbte_nro).toBe(42);

      // Verify Transaction 1: failed→issuing was called
      expect(sales.transitionInvoiceStatus).toHaveBeenNthCalledWith(
        1,
        "sale-id",
        "user-id",
        "failed",
        "issuing",
        undefined,
        manager,
      );

      // Verify Transaction 2: issuing→issued with fiscal fields
      expect(sales.transitionInvoiceStatus).toHaveBeenNthCalledWith(
        2,
        "sale-id",
        "user-id",
        "issuing",
        "issued",
        {
          cae: "74154876254185",
          cae_vto: "20250111",
          cbte_nro: 42,
          cbte_tipo: 6,
          pto_vta: 265,
        },
        manager,
      );

      // ARCA was called between the two transactions
      expect(issueInvoice.issue).toHaveBeenCalledWith([
        { line_total: "121.00", iva_rate: "21.00" },
      ]);

      // No alerts emitted
      expect(alertPort.alertRetryFailed).not.toHaveBeenCalled();
      expect(alertPort.alertRetryAmbiguous).not.toHaveBeenCalled();
    });

    it("uses persisted sale item subtotal and IVA, not mutable product data", async () => {
      const failedSale = buildSale({
        invoice_status: "failed",
        items: [
          {
            id: "item-1",
            sale_id: "sale-id",
            product_id: "product-xyz",
            iva: "10.50",
            quantity: 2,
            unit_price: "100.00",
            subtotal: "200.00",
            discount_amount: "0.00",
            applied_promotions: [],
          },
        ],
      });
      const issuingSale = buildSale({ ...failedSale, invoice_status: "issuing" });
      const issuedSale = buildSale({
        ...failedSale,
        invoice_status: "issued",
        cae: "74154876254185",
      });

      sales.findByIdForUser.mockResolvedValue(failedSale);

      dataSource.transaction.mockImplementation(
        async (fn: (em: EntityManager) => Promise<any>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus
        .mockResolvedValueOnce(issuingSale)
        .mockResolvedValueOnce(issuedSale);
      issueInvoice.issue.mockResolvedValue({
        cae: "74154876254185",
        cae_vto: "20250111",
        cbte_nro: 43,
        cbte_tipo: 6,
        pto_vta: 265,
      });

      await useCase.execute({ sale_id: "sale-id", user_id: "user-id" });

      // Must use persisted subtotal and IVA, not look up product
      expect(issueInvoice.issue).toHaveBeenCalledWith([
        { line_total: "200.00", iva_rate: "10.50" },
      ]);
    });
  });

  describe("issuing and ambiguous states block retry", () => {
    it("returns reconciliation_required when sale is in 'issuing' state", async () => {
      const issuingSale = buildSale({ invoice_status: "issuing" });
      sales.findByIdForUser.mockResolvedValue(issuingSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("reconciliation_required");
      expect(result.sale.invoice_status).toBe("issuing");
      expect(result.message).toContain("reconciliation");
      expect(issueInvoice.issue).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("returns reconciliation_required when sale is in 'ambiguous' state", async () => {
      const ambiguousSale = buildSale({ invoice_status: "ambiguous" });
      sales.findByIdForUser.mockResolvedValue(ambiguousSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("reconciliation_required");
      expect(result.sale.invoice_status).toBe("ambiguous");
      expect(result.message).toContain("reconciliation");
      expect(issueInvoice.issue).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe("idempotent no-op for issued sales", () => {
    it("returns already_issued without calling ARCA when sale is already issued", async () => {
      const issuedSale = buildSale({
        invoice_status: "issued",
        cae: "74154876254185",
        cae_vto: "20250111",
        cbte_nro: 42,
        cbte_tipo: 6,
        pto_vta: 265,
      });
      sales.findByIdForUser.mockResolvedValue(issuedSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("already_issued");
      expect(result.sale.invoice_status).toBe("issued");
      expect(issueInvoice.issue).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe("rejection of non-retryable states", () => {
    it("rejects 'none' status as not retryable", async () => {
      const noneSale = buildSale({ invoice_status: "none" });
      sales.findByIdForUser.mockResolvedValue(noneSale);

      await expect(
        useCase.execute({ sale_id: "sale-id", user_id: "user-id" }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(issueInvoice.issue).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when the sale does not belong to the user", async () => {
      sales.findByIdForUser.mockResolvedValue(null);

      await expect(
        useCase.execute({ sale_id: "missing-id", user_id: "user-id" }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(issueInvoice.issue).not.toHaveBeenCalled();
    });
  });

  describe("ARCA clear failure — transition back to failed + alert", () => {
    it("transitions issuing→failed on ARCA rejection and emits FISCAL_ARCA_RETRY_FAILED alert", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuingSale = buildSale({ invoice_status: "issuing" });
      const returnedToFailed = buildSale({ invoice_status: "failed" });

      sales.findByIdForUser
        .mockResolvedValueOnce(failedSale) // quick read
        .mockResolvedValueOnce(returnedToFailed); // re-read after rollback

      // Transaction 1: failed→issuing claim
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(issuingSale);

      // ARCA fails
      const arcaError = new Error("ARCA SOAP fault");
      issueInvoice.issue.mockRejectedValue(arcaError);

      // Transaction 2: issuing→failed rollback
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(returnedToFailed);

      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(jest.fn());

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("failed");
      expect(result.sale.invoice_status).toBe("failed");

      // Alert must have been emitted
      expect(alertPort.alertRetryFailed).toHaveBeenCalledWith(
        "sale-id",
        arcaError,
      );
      expect(alertPort.alertRetryAmbiguous).not.toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });
  });

  describe("ARCA success but local persistence fails — ambiguous state + alert", () => {
    it("emits FISCAL_ARCA_RETRY_AMBIGUOUS alert when issuing→issued persistence fails", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuingSale = buildSale({ invoice_status: "issuing" });
      const ambiguousSale = buildSale({ invoice_status: "ambiguous" });

      sales.findByIdForUser
        .mockResolvedValueOnce(failedSale) // quick read
        .mockResolvedValueOnce(ambiguousSale); // re-read after ambiguous mark

      // Transaction 1: failed→issuing
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(issuingSale);

      // ARCA succeeds
      issueInvoice.issue.mockResolvedValue({
        cae: "74154876254185",
        cae_vto: "20250111",
        cbte_nro: 44,
        cbte_tipo: 6,
        pto_vta: 265,
      });

      // Transaction 2: issuing→issued FAILS (returns null — concurrent modification)
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(null);

      // Best-effort Transaction 3: issuing→ambiguous
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(ambiguousSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("ambiguous");
      expect(result.message).toContain("reconciliation");

      // Alert must have been emitted with CAE reference
      expect(alertPort.alertRetryAmbiguous).toHaveBeenCalledWith(
        "sale-id",
        expect.stringContaining("74154876254185"),
      );
      expect(alertPort.alertRetryFailed).not.toHaveBeenCalled();
    });
  });

  describe("alert sanitization", () => {
    it("does not expose PEM secrets in client-facing retry failure message", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuingSale = buildSale({ invoice_status: "issuing" });
      const returnedToFailed = buildSale({ invoice_status: "failed" });

      sales.findByIdForUser
        .mockResolvedValueOnce(failedSale) // quick read
        .mockResolvedValueOnce(returnedToFailed); // re-read after rollback

      dataSource.transaction.mockImplementation(
        async (fn: (em: EntityManager) => Promise<any>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus
        .mockResolvedValueOnce(issuingSale) // failed→issuing
        .mockResolvedValueOnce(returnedToFailed); // issuing→failed

      const arcaError = new Error("ARCA network error");
      (arcaError as any).response = {
        body: "-----BEGIN CERTIFICATE-----\nSECRET\n-----END CERTIFICATE-----",
      };
      (arcaError as any).cause = "-----BEGIN PRIVATE KEY-----\nKEYDATA\n-----END PRIVATE KEY-----";
      issueInvoice.issue.mockRejectedValue(arcaError);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      // Alert was emitted via the port (adapter handles sanitization)
      expect(alertPort.alertRetryFailed).toHaveBeenCalledWith(
        "sale-id",
        arcaError,
      );

      // Client-facing message must not contain PEM content or raw secrets
      expect(result.retry_status).toBe("failed");
      expect(result.message).not.toContain("BEGIN CERTIFICATE");
      expect(result.message).not.toContain("BEGIN PRIVATE KEY");
      expect(result.message).not.toContain("BEGIN RSA PRIVATE KEY");
      expect(result.message).not.toContain("SECRET");
      expect(result.message).not.toContain("KEYDATA");
    });

    it("ArcaLoggerAlertAdapter emits structured alerts with PEM sanitization", () => {
      const { ArcaLoggerAlertAdapter } = require("../infrastructure/arca-logger-alert.adapter");
      const adapter = new ArcaLoggerAlertAdapter();

      const errorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(jest.fn());

      // FISCAL_ARCA_RETRY_FAILED with PEM-laden error
      const error = new Error("SOAP fault");
      (error as any).response = {
        body: "-----BEGIN CERTIFICATE-----\nABC123\n-----END CERTIFICATE-----",
      };
      (error as any).cause = "-----BEGIN PRIVATE KEY-----\nXYZ789\n-----END PRIVATE KEY-----";

      adapter.alertRetryFailed("sale-1", error);

      let logged = errorSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(logged?.event_code).toBe("FISCAL_ARCA_RETRY_FAILED");
      expect(logged?.sale_id).toBe("sale-1");

      const errPayload = logged?.error as Record<string, unknown>;
      expect(errPayload.name).toBe("Error");
      expect(errPayload.message).toBe("SOAP fault");
      expect(errPayload.response).toBe("[response redacted]");
      expect(errPayload.cause).toBe("[cause redacted — PEM content]");

      let serialized = JSON.stringify(logged);
      expect(serialized).not.toContain("BEGIN CERTIFICATE");
      expect(serialized).not.toContain("BEGIN PRIVATE KEY");
      expect(serialized).not.toContain("ABC123");
      expect(serialized).not.toContain("XYZ789");

      // FISCAL_ARCA_RETRY_AMBIGUOUS
      adapter.alertRetryAmbiguous(
        "sale-2",
        "ARCA issued CAE 74154876254185 but local persistence failed",
      );

      logged = errorSpy.mock.calls[1]?.[0] as Record<string, unknown> | undefined;
      expect(logged?.event_code).toBe("FISCAL_ARCA_RETRY_AMBIGUOUS");
      expect(logged?.sale_id).toBe("sale-2");
      expect(logged?.reason).toContain("74154876254185");

      // Non-PEM cause passes through
      const normalError = new Error("timeout");
      (normalError as any).cause = "connection refused";
      adapter.alertRetryFailed("sale-3", normalError);

      logged = errorSpy.mock.calls[2]?.[0] as Record<string, unknown> | undefined;
      const normalPayload = logged?.error as Record<string, unknown>;
      expect(normalPayload.cause).toBe("connection refused");

      errorSpy.mockRestore();
    });
  });

  describe("ARCA mode guard", () => {
    it("refuses retry when ARCA is disabled", async () => {
      configService.get.mockReturnValue(
        buildArcaConfig({ enabled: false }),
      );

      await expect(
        useCase.execute({ sale_id: "sale-id", user_id: "user-id" }),
      ).rejects.toThrow(/ARCA fiscal retry requires real billing mode/);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(issueInvoice.issue).not.toHaveBeenCalled();
    });

    it("refuses retry when ARCA is in mock mode", async () => {
      configService.get.mockReturnValue(
        buildArcaConfig({ mock: true }),
      );

      await expect(
        useCase.execute({ sale_id: "sale-id", user_id: "user-id" }),
      ).rejects.toThrow(/ARCA fiscal retry requires real billing mode/);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(issueInvoice.issue).not.toHaveBeenCalled();
    });
  });

  describe("race condition: status changes between quick read and claim", () => {
    it("returns reconciliation_required if sale changed to issuing between read and claim", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuingSale = buildSale({ invoice_status: "issuing" });

      // Quick read: still failed
      sales.findByIdForUser.mockResolvedValueOnce(failedSale);

      // Transaction: claim attempted but already changed to issuing (returns null)
      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(null);

      // Re-read: now issuing
      sales.findByIdForUser.mockResolvedValueOnce(issuingSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("reconciliation_required");
      expect(issueInvoice.issue).not.toHaveBeenCalled();
    });

    it("returns already_issued if sale changed to issued between read and claim", async () => {
      const failedSale = buildSale({ invoice_status: "failed" });
      const issuedSale = buildSale({
        invoice_status: "issued",
        cae: "74154876254185",
      });

      sales.findByIdForUser.mockResolvedValueOnce(failedSale);

      dataSource.transaction.mockImplementationOnce(
        async (fn: (em: EntityManager) => Promise<Sale | null>) =>
          fn(manager as unknown as EntityManager),
      );
      sales.transitionInvoiceStatus.mockResolvedValueOnce(null);

      sales.findByIdForUser.mockResolvedValueOnce(issuedSale);

      const result = await useCase.execute({
        sale_id: "sale-id",
        user_id: "user-id",
      });

      expect(result.retry_status).toBe("already_issued");
      expect(issueInvoice.issue).not.toHaveBeenCalled();
    });
  });
});
