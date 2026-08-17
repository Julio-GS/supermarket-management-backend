import { Decimal } from "decimal.js";
import { SalePersistenceAssembler } from "./sale-persistence-assembler";
import {
  FiscalResult,
  PricingResult,
} from "./create-sale.types";
import { PaymentMethodAllocation } from "../domain/sale.entity";
import { SaleItemCreateData } from "./sale.repository.port";

describe("SalePersistenceAssembler", () => {
  const assembler = new SalePersistenceAssembler();

  it("assembles exact SaleCreateInput payload with all fields populated", () => {
    const saleItems: SaleItemCreateData[] = [
      {
        product_id: "prod-1",
        quantity: 2,
        unit_price: "25.00",
        subtotal: "50.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
        iva: "21.00",
      },
    ];

    const pricing: PricingResult = {
      pricedLines: [],
      saleItems,
      postPromotionSubtotal: new Decimal("50.00"),
      manualDiscount: {
        amount: new Decimal("5.00"),
        modality: "fixed",
        percentage: null,
      },
      finalTotal: new Decimal("45.00"),
    };

    const paymentMethods: PaymentMethodAllocation[] = [
      { method: "cash", amount: "45.00" },
    ];

    const requestedAt = new Date("2026-08-17T12:00:00.000Z");
    const fiscal: FiscalResult = {
      invoiceStatus: "issued",
      invoiceRequestedAt: requestedAt,
      fiscalFields: {
        cae: "74012345678901",
        cae_vto: "20260827",
        cbte_nro: 101,
        cbte_tipo: 6,
        pto_vta: 1,
      },
    };

    const result = assembler.assemble({
      userId: "user-123",
      pricing,
      paymentMethods,
      splitTicketGroups: [
        { label: "Ticket A", items: [{ product_id: "prod-1", quantity: 2 }] },
      ],
      fiscal,
    });

    expect(result).toEqual({
      user_id: "user-123",
      items: saleItems,
      payment_methods: paymentMethods,
      split_ticket_groups: [
        { label: "Ticket A", items: [{ product_id: "prod-1", quantity: 2 }] },
      ],
      total: "45.00",
      manual_discount_amount: "5.00",
      manual_discount_modality: "fixed",
      manual_discount_percentage: null,
      invoice_status: "issued",
      cae: "74012345678901",
      cae_vto: "20260827",
      cbte_nro: 101,
      cbte_tipo: 6,
      pto_vta: 1,
      invoice_requested_at: requestedAt,
    });
  });

  it("assembles payload for non-invoice sale with absent manual discount and null split groups", () => {
    const saleItems: SaleItemCreateData[] = [
      {
        product_id: "prod-2",
        quantity: 1,
        unit_price: "100.00",
        subtotal: "100.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
      },
    ];

    const pricing: PricingResult = {
      pricedLines: [],
      saleItems,
      postPromotionSubtotal: new Decimal("100.00"),
      manualDiscount: {
        amount: new Decimal("0.00"),
        modality: null,
        percentage: null,
      },
      finalTotal: new Decimal("100.00"),
    };

    const paymentMethods: PaymentMethodAllocation[] = [
      { method: "card", amount: "60.00" },
      { method: "transfer", amount: "40.00" },
    ];

    const fiscal: FiscalResult = {
      invoiceStatus: "none",
      invoiceRequestedAt: null,
      fiscalFields: {
        cae: null,
        cae_vto: null,
        cbte_nro: null,
        cbte_tipo: null,
        pto_vta: null,
      },
    };

    const result = assembler.assemble({
      userId: "user-456",
      pricing,
      paymentMethods,
      splitTicketGroups: null,
      fiscal,
    });

    expect(result).toEqual({
      user_id: "user-456",
      items: saleItems,
      payment_methods: paymentMethods,
      split_ticket_groups: null,
      total: "100.00",
      manual_discount_amount: "0.00",
      manual_discount_modality: null,
      manual_discount_percentage: null,
      invoice_status: "none",
      cae: null,
      cae_vto: null,
      cbte_nro: null,
      cbte_tipo: null,
      pto_vta: null,
      invoice_requested_at: null,
    });
  });

  it("handles percentage manual discount correctly", () => {
    const saleItems: SaleItemCreateData[] = [
      {
        product_id: "prod-3",
        quantity: 1,
        unit_price: "200.00",
        subtotal: "200.00",
        discount_amount: "0.00",
        applied_promotions: [],
        applied_promotion_id: null,
        applied_promotion_type: null,
      },
    ];

    const pricing: PricingResult = {
      pricedLines: [],
      saleItems,
      postPromotionSubtotal: new Decimal("200.00"),
      manualDiscount: {
        amount: new Decimal("20.00"),
        modality: "percentage",
        percentage: "10.00",
      },
      finalTotal: new Decimal("180.00"),
    };

    const paymentMethods: PaymentMethodAllocation[] = [
      { method: "qr", amount: "180.00" },
    ];

    const fiscal: FiscalResult = {
      invoiceStatus: "none",
      invoiceRequestedAt: null,
      fiscalFields: {
        cae: null,
        cae_vto: null,
        cbte_nro: null,
        cbte_tipo: null,
        pto_vta: null,
      },
    };

    const result = assembler.assemble({
      userId: "user-789",
      pricing,
      paymentMethods,
      splitTicketGroups: null,
      fiscal,
    });

    expect(result.manual_discount_amount).toBe("20.00");
    expect(result.manual_discount_modality).toBe("percentage");
    expect(result.manual_discount_percentage).toBe("10.00");
    expect(result.total).toBe("180.00");
  });

  it("handles failed invoice issuance preserving requested timestamp and null fiscal fields", () => {
    const requestedAt = new Date("2026-08-17T15:30:00.000Z");
    const fiscal: FiscalResult = {
      invoiceStatus: "failed",
      invoiceRequestedAt: requestedAt,
      fiscalFields: {
        cae: null,
        cae_vto: null,
        cbte_nro: null,
        cbte_tipo: null,
        pto_vta: null,
      },
    };

    const pricing: PricingResult = {
      pricedLines: [],
      saleItems: [],
      postPromotionSubtotal: new Decimal("50.00"),
      manualDiscount: {
        amount: new Decimal("0.00"),
        modality: null,
        percentage: null,
      },
      finalTotal: new Decimal("50.00"),
    };

    const result = assembler.assemble({
      userId: "user-fail",
      pricing,
      paymentMethods: [{ method: "cash", amount: "50.00" }],
      splitTicketGroups: null,
      fiscal,
    });

    expect(result.invoice_status).toBe("failed");
    expect(result.invoice_requested_at).toEqual(requestedAt);
    expect(result.cae).toBeNull();
    expect(result.cae_vto).toBeNull();
    expect(result.cbte_nro).toBeNull();
    expect(result.cbte_tipo).toBeNull();
    expect(result.pto_vta).toBeNull();
  });

  it("strictly enforces snake_case only with no camelCase aliases", () => {
    const fiscal: FiscalResult = {
      invoiceStatus: "issued",
      invoiceRequestedAt: new Date(),
      fiscalFields: {
        cae: "123",
        cae_vto: "20260817",
        cbte_nro: 1,
        cbte_tipo: 6,
        pto_vta: 1,
      },
    };

    const pricing: PricingResult = {
      pricedLines: [],
      saleItems: [],
      postPromotionSubtotal: new Decimal("10.00"),
      manualDiscount: {
        amount: new Decimal("1.00"),
        modality: "fixed",
        percentage: null,
      },
      finalTotal: new Decimal("9.00"),
    };

    const result = assembler.assemble({
      userId: "user-1",
      pricing,
      paymentMethods: [{ method: "cash", amount: "9.00" }],
      splitTicketGroups: null,
      fiscal,
    });

    const raw = result as unknown as Record<string, unknown>;

    // Ensure snake_case keys are present
    expect(raw.user_id).toBe("user-1");
    expect(raw.payment_methods).toBeDefined();
    expect(raw.manual_discount_amount).toBe("1.00");
    expect(raw.manual_discount_modality).toBe("fixed");
    expect(raw.manual_discount_percentage).toBeNull();
    expect(raw.invoice_status).toBe("issued");
    expect(raw.cae).toBe("123");
    expect(raw.cae_vto).toBe("20260817");
    expect(raw.cbte_nro).toBe(1);
    expect(raw.cbte_tipo).toBe(6);
    expect(raw.pto_vta).toBe(1);
    expect(raw.invoice_requested_at).toBeDefined();

    // Ensure camelCase aliases are strictly absent / undefined
    expect(raw.userId).toBeUndefined();
    expect(raw.paymentMethods).toBeUndefined();
    expect(raw.splitTicketGroups).toBeUndefined();
    expect(raw.manualDiscountAmount).toBeUndefined();
    expect(raw.manualDiscountModality).toBeUndefined();
    expect(raw.manualDiscountPercentage).toBeUndefined();
    expect(raw.invoiceStatus).toBeUndefined();
    expect(raw.caeVto).toBeUndefined();
    expect(raw.cbteNro).toBeUndefined();
    expect(raw.cbteTipo).toBeUndefined();
    expect(raw.ptoVta).toBeUndefined();
    expect(raw.invoiceRequestedAt).toBeUndefined();
  });
});
