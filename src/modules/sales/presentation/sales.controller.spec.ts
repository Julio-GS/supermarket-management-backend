import { ValidationPipe } from "@nestjs/common";
import { Sale } from "../domain/sale.entity";
import { CreateSaleDto } from "./sale.dto";
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

  describe("manual discount response mapping", () => {
    it("exposes historical null discount fields as null", () => {
      const dto = toSaleResponse(buildSale());
      expect(dto.manual_discount_amount).toBeNull();
      expect(dto.manual_discount_modality).toBeNull();
      expect(dto.manual_discount_percentage).toBeNull();
    });

    it("exposes confirmed-zero discounts as '0.00' with null modality", () => {
      const dto = toSaleResponse(
        buildSale({
          manual_discount_amount: "0.00",
          manual_discount_modality: null,
          manual_discount_percentage: null,
        }),
      );
      expect(dto.manual_discount_amount).toBe("0.00");
      expect(dto.manual_discount_modality).toBeNull();
      expect(dto.manual_discount_percentage).toBeNull();
    });

    it("exposes fixed discount fields", () => {
      const dto = toSaleResponse(
        buildSale({
          manual_discount_amount: "20.00",
          manual_discount_modality: "fixed",
          manual_discount_percentage: null,
        }),
      );
      expect(dto.manual_discount_amount).toBe("20.00");
      expect(dto.manual_discount_modality).toBe("fixed");
      expect(dto.manual_discount_percentage).toBeNull();
    });

    it("exposes percentage discount fields", () => {
      const dto = toSaleResponse(
        buildSale({
          manual_discount_amount: "15.00",
          manual_discount_modality: "percentage",
          manual_discount_percentage: "10.00",
        }),
      );
      expect(dto.manual_discount_amount).toBe("15.00");
      expect(dto.manual_discount_modality).toBe("percentage");
      expect(dto.manual_discount_percentage).toBe("10.00");
    });
  });

  describe("manual discount DTO validation", () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });
    const metadata = { type: "body" as const, metatype: CreateSaleDto, data: "" };

    function validBody(manual_discount: Record<string, unknown>) {
      return {
        items: [
          { product_id: "123e4567-e89b-42d3-a456-426614174000", quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "121.00" }],
        manual_discount,
      };
    }

    it("accepts a valid fixed discount", async () => {
      const result = await pipe.transform(
        validBody({ modality: "fixed", amount: "10.00" }),
        metadata,
      );
      expect(result.manual_discount).toMatchObject({
        modality: "fixed",
        amount: "10.00",
      });
    });

    it("accepts a valid percentage discount", async () => {
      const result = await pipe.transform(
        validBody({ modality: "percentage", percentage: "10", amount: "15.00" }),
        metadata,
      );
      expect(result.manual_discount).toMatchObject({
        modality: "percentage",
        percentage: "10",
        amount: "15.00",
      });
    });

    it("rejects a fixed discount that also sends percentage (forbidden shape)", async () => {
      await expect(
        pipe.transform(
          validBody({ modality: "fixed", amount: "10.00", percentage: "5" }),
          metadata,
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            expect.stringContaining("manual_discount"),
          ]),
        },
      });
    });

    it("rejects a percentage discount missing amount", async () => {
      await expect(
        pipe.transform(
          validBody({ modality: "percentage", percentage: "10" }),
          metadata,
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            expect.stringContaining("manual_discount"),
          ]),
        },
      });
    });

    it("rejects an unknown field inside manual_discount (forbidNonWhitelisted)", async () => {
      await expect(
        pipe.transform(
          validBody({ modality: "fixed", amount: "10.00", bogus: "x" }),
          metadata,
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([expect.stringContaining("bogus")]),
        },
      });
    });
  });
});
