import { Decimal } from "decimal.js";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { SaleFiscalOrchestrator } from "./sale-fiscal-orchestrator";
import { ResolvedCatalogFixedLine, ResolvedAdHocLine } from "./create-sale.types";
import { Product } from "../../products/domain/product.entity";
import { ValidationError } from "../../../shared/errors/domain.error";

function makeFixedLine(id: string, subtotal: string, iva: string | null = "21.00") {
  return {
    item: { product_id: id, quantity: 1, unit_price: subtotal, subtotal, discount_amount: "0.00", applied_promotions: [], ...(iva ? { iva } : {}) },
    resolved: {
      kind: "catalog-fixed" as const,
      lineId: id,
      originalIndex: 0,
      product: { id, codigo: "123", detalle: "P", precio_costo: "10.00", costo_final: subtotal, alicuota_iva: "21.00", iva: iva ?? undefined, facturable: true, maneja_stock: true, pricing_mode: "standard", sucursal_id: "s1", created_at: new Date(), updated_at: new Date() } as unknown as Product,
      quantity: 1,
      unitPrice: subtotal,
      promotionEligible: true as const,
      stockManaged: true,
      facturable: true,
      ivaForPersistence: iva,
    } as ResolvedCatalogFixedLine,
  };
}

function makeAdHocLine(name: string, subtotal: string, iva = "21.00") {
  return {
    item: { product_id: null, name, quantity: 1, unit_price: subtotal, subtotal, discount_amount: "0.00", applied_promotions: [], iva },
    resolved: {
      kind: "ad-hoc" as const,
      lineId: "adhoc-uuid",
      originalIndex: 0,
      adHoc: { name, description: null },
      quantity: 1,
      unitPrice: subtotal,
      promotionEligible: true as const,
      stockManaged: false,
      facturable: true,
      ivaForPersistence: "21.00" as const,
    } as ResolvedAdHocLine,
  };
}

describe("SaleFiscalOrchestrator", () => {
  let issueInvoiceMock: jest.Mocked<IssueArcaInvoiceUseCase>;
  let orchestrator: SaleFiscalOrchestrator;

  beforeEach(() => {
    issueInvoiceMock = { issue: jest.fn() } as unknown as jest.Mocked<IssueArcaInvoiceUseCase>;
    orchestrator = new SaleFiscalOrchestrator(issueInvoiceMock);
  });

  describe("when invoice is not requested", () => {
    it("returns invoiceStatus 'none', null requestedAt, and null fiscal fields without calling ARCA", async () => {
      const line = makeFixedLine("p1", "40.00");
      const result = await orchestrator.issueIfRequested({
        invoiceRequested: false,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("40.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(result).toEqual({
        invoiceStatus: "none",
        invoiceRequestedAt: null,
        fiscalFields: { cae: null, cae_vto: null, cbte_nro: null, cbte_tipo: null, pto_vta: null },
      });
      expect(issueInvoiceMock.issue).not.toHaveBeenCalled();
    });

    it("returns 'none' even with empty items array", async () => {
      const result = await orchestrator.issueIfRequested({
        invoiceRequested: false,
        saleItems: [],
        resolvedLines: [],
        postPromotionSubtotal: new Decimal("0.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(result.invoiceStatus).toBe("none");
      expect(issueInvoiceMock.issue).not.toHaveBeenCalled();
    });
  });

  describe("when invoice is requested and ARCA succeeds", () => {
    it("calls ARCA with mapped lines and returns issued status with fiscal fields", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "74012345678901", cae_vto: "20260830", cbte_nro: 1234, cbte_tipo: 6, pto_vta: 1 });
      const line = makeFixedLine("p1", "50.00", "21.00");
      const before = new Date();
      const result = await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("50.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      const after = new Date();

      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "50.00", iva_rate: "21.00" }]);
      expect(result.invoiceStatus).toBe("issued");
      expect(result.invoiceRequestedAt).toBeInstanceOf(Date);
      expect(result.invoiceRequestedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.invoiceRequestedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.fiscalFields).toEqual({ cae: "74012345678901", cae_vto: "20260830", cbte_nro: 1234, cbte_tipo: 6, pto_vta: 1 });
    });

    it("correctly resolves IVA for mixed catalog and ad-hoc lines", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "999", cae_vto: "20260830", cbte_nro: 42, cbte_tipo: 6, pto_vta: 1 });
      const catalog = makeFixedLine("p1", "100.00", "10.50");
      const adhoc = makeAdHocLine("Ad-hoc Custom", "50.00", "21.00");
      await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [catalog.item, adhoc.item],
        resolvedLines: [catalog.resolved, adhoc.resolved],
        postPromotionSubtotal: new Decimal("150.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "100.00", iva_rate: "10.50" }, { line_total: "50.00", iva_rate: "21.00" }]);
    });

    it("falls back to product IVA when si.iva is absent", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "888", cae_vto: "20260830", cbte_nro: 10, cbte_tipo: 6, pto_vta: 1 });
      const line = makeFixedLine("p1", "30.00", null);
      line.resolved.product.iva = "10.50";
      await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("30.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "30.00", iva_rate: "10.50" }]);
    });
  });

  describe("when invoice is requested and ARCA fails", () => {
    it("catches Error, logs it, and returns failed status with null fiscal fields and non-null requestedAt", async () => {
      issueInvoiceMock.issue.mockRejectedValueOnce(new Error("ARCA connection timeout"));
      const line = makeFixedLine("p1", "50.00", "21.00");
      const result = await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("50.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(result.invoiceStatus).toBe("failed");
      expect(result.invoiceRequestedAt).toBeInstanceOf(Date);
      expect(result.fiscalFields).toEqual({ cae: null, cae_vto: null, cbte_nro: null, cbte_tipo: null, pto_vta: null });
    });

    it("catches non-Error thrown objects without crashing", async () => {
      issueInvoiceMock.issue.mockRejectedValueOnce("raw string failure");
      const line = makeFixedLine("p1", "50.00", "21.00");
      const result = await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("50.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(result.invoiceStatus).toBe("failed");
      expect(result.fiscalFields.cae).toBeNull();
    });
  });

  describe("manual discount allocation across invoice lines", () => {
    it("returns lines unchanged when discount is zero", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "123", cae_vto: "20260830", cbte_nro: 1, cbte_tipo: 6, pto_vta: 1 });
      const line = makeFixedLine("p1", "100.00", "21.00");
      await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [line.item],
        resolvedLines: [line.resolved],
        postPromotionSubtotal: new Decimal("100.00"),
        manualDiscountAmount: new Decimal("0.00"),
      });
      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "100.00", iva_rate: "21.00" }]);
    });

    it("allocates discount proportionally and absorbs residual on last line for 2 lines", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "123", cae_vto: "20260830", cbte_nro: 1, cbte_tipo: 6, pto_vta: 1 });
      const l1 = makeFixedLine("p1", "60.00", "21.00");
      const l2 = makeFixedLine("p2", "40.00", "10.50");
      await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [l1.item, l2.item],
        resolvedLines: [l1.resolved, l2.resolved],
        postPromotionSubtotal: new Decimal("100.00"),
        manualDiscountAmount: new Decimal("15.00"),
      });
      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "51.00", iva_rate: "21.00" }, { line_total: "34.00", iva_rate: "10.50" }]);
    });

    it("absorbs rounding residual on last line for 3 lines with uneven split", async () => {
      issueInvoiceMock.issue.mockResolvedValueOnce({ cae: "123", cae_vto: "20260830", cbte_nro: 1, cbte_tipo: 6, pto_vta: 1 });
      const l1 = makeFixedLine("p1", "33.33", "21.00");
      const l2 = makeFixedLine("p2", "33.33", "21.00");
      const l3 = makeFixedLine("p3", "33.34", "21.00");
      await orchestrator.issueIfRequested({
        invoiceRequested: true,
        saleItems: [l1.item, l2.item, l3.item],
        resolvedLines: [l1.resolved, l2.resolved, l3.resolved],
        postPromotionSubtotal: new Decimal("100.00"),
        manualDiscountAmount: new Decimal("10.00"),
      });
      expect(issueInvoiceMock.issue).toHaveBeenCalledWith([{ line_total: "30.00", iva_rate: "21.00" }, { line_total: "30.00", iva_rate: "21.00" }, { line_total: "30.00", iva_rate: "21.00" }]);
    });

    it("throws ValidationError if manual discount allocation produces a negative residual line", async () => {
      const line = makeFixedLine("p1", "100.00", "21.00");
      await expect(
        orchestrator.issueIfRequested({
          invoiceRequested: true,
          saleItems: [line.item],
          resolvedLines: [line.resolved],
          postPromotionSubtotal: new Decimal("100.00"),
          manualDiscountAmount: new Decimal("150.00"),
        }),
      ).rejects.toThrow(new ValidationError("manual discount allocation produced a negative invoice line"));
    });
  });
});
