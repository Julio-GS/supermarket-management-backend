import { Sale } from "../domain/sale.entity";
import { toSaleResponse, SalesController } from "./sales.controller";

function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-1",
    user_id: "user-1",
    total: "121.00",
    payment_methods: [{ method: "cash", amount: "121.00" }],
    split_ticket_groups: null,
    items: [
      {
        id: "item-1",
        sale_id: "sale-1",
        product_id: "prod-1",
        quantity: 1,
        unit_price: "121.00",
        subtotal: "121.00",
        discount_amount: "0.00",
        applied_promotions: [],
      },
    ],
    invoice_status: "none",
    cae: null,
    cae_vto: null,
    cbte_nro: null,
    cbte_tipo: null,
    pto_vta: null,
    invoice_requested_at: null,
    created_at: new Date("2025-01-11T10:00:00Z"),
    updated_at: new Date("2025-01-11T10:00:00Z"),
    ...overrides,
  } as Sale;
}

describe("SalesController — CAE expiry response contract", () => {
  describe("toSaleResponse", () => {
    it("exposes cae_vto as an 8-digit YYYYMMDD string when sale has CAE expiry", () => {
      const sale = buildSale({ cae_vto: "20250111", cae: "CAE123" });

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBe("20250111");
    });

    it("exposes cae_vto as null when sale has no CAE expiry", () => {
      const sale = buildSale({ cae_vto: null, cae: null });

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBeNull();
    });

    it("exposes cae_vto as null when sale has cae_vto undefined (maps via ?? null)", () => {
      const sale = buildSale();
      delete (sale as unknown as Record<string, unknown>).cae_vto;

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBeNull();
    });

    it("does NOT expose any caeVto camelCase alias", () => {
      const sale = buildSale({ cae_vto: "20250111" });

      const dto = toSaleResponse(sale);

      expect(dto).not.toHaveProperty("caeVto");
      expect(Object.keys(dto)).toContain("cae_vto");
    });

    it("keeps cae_vto as snake_case (field name stability)", () => {
      const sale = buildSale({ cae_vto: "20250615" });

      const dto = toSaleResponse(sale);

      // Prove the snake_case key exists with the correct value
      expect(dto.cae_vto).toBe("20250615");
      // Prove no camelCase variant leaked in
      expect((dto as unknown as Record<string, unknown>).caeVto).toBeUndefined();
    });

    // TRIANGULATE: edge cases
    it("accepts a leap-year CAE expiry date as valid 8-digit string", () => {
      const sale = buildSale({ cae_vto: "20240229", cae: "CAE-LEAP" });

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBe("20240229");
    });

    it("accepts December 31 CAE expiry as valid 8-digit string", () => {
      const sale = buildSale({ cae_vto: "20251231", cae: "CAE-YE" });

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBe("20251231");
    });

    it("passes through null without converting to string 'null'", () => {
      const sale = buildSale({ cae_vto: null, cae: null });

      const dto = toSaleResponse(sale);

      expect(dto.cae_vto).toBeNull();
      expect(typeof dto.cae_vto).not.toBe("string");
    });
  });
});
