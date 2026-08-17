import { ValidationError } from "../../../shared/errors/domain.error";
import { CreateSaleInput } from "./create-sale.types";
import { SaleInputNormalizer } from "./sale-input-normalizer";

describe("SaleInputNormalizer", () => {
  let normalizer: SaleInputNormalizer;

  beforeEach(() => {
    normalizer = new SaleInputNormalizer();
  });

  describe("Items validation and normalization", () => {
    it("throws ValidationError when items array is missing or empty", () => {
      expect(() =>
        normalizer.normalize({
          user_id: "user-1",
          items: [],
          payment_methods: [{ method: "cash", amount: "10.00" }],
        }),
      ).toThrow("Sale must contain at least one item");

      expect(() =>
        normalizer.normalize({
          user_id: "user-1",
          items: undefined as unknown as CreateSaleInput["items"],
          payment_methods: [{ method: "cash", amount: "10.00" }],
        }),
      ).toThrow("Sale must contain at least one item");
    });

    it("normalizes catalog reference items with kind 'catalog-reference' and preserves line_total", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [
          { product_id: "prod-1", quantity: 2 },
          { product_id: "prod-2", quantity: 1, line_total: "50.00" },
        ],
        payment_methods: [{ method: "cash", amount: "50.00" }],
      };

      const result = normalizer.normalize(input);

      expect(result.userId).toBe("user-1");
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        kind: "catalog-reference",
        originalIndex: 0,
        productId: "prod-1",
        quantity: 2,
        lineTotal: undefined,
        splitTicket: undefined,
      });
      expect(result.items[1]).toEqual({
        kind: "catalog-reference",
        originalIndex: 1,
        productId: "prod-2",
        quantity: 1,
        lineTotal: "50.00",
        splitTicket: undefined,
      });
    });

    it("validates ad-hoc items: requires name", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [{ unit_price: "10.00", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      expect(() => normalizer.normalize(input)).toThrow(
        "Ad-hoc sale items require a name",
      );

      const blankName: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "   ", unit_price: "10.00", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      expect(() => normalizer.normalize(blankName)).toThrow(
        "Ad-hoc sale items require a name",
      );
    });

    it("validates ad-hoc items: requires positive unit_price", () => {
      const missingPrice: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "Custom Item", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      expect(() => normalizer.normalize(missingPrice)).toThrow(
        "Ad-hoc sale items require a unit_price",
      );

      const zeroPrice: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "Custom Item", unit_price: "0.00", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      expect(() => normalizer.normalize(zeroPrice)).toThrow(
        "Ad-hoc sale items require a positive unit_price",
      );

      const negativePrice: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "Custom Item", unit_price: "-5.00", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      expect(() => normalizer.normalize(negativePrice)).toThrow(
        "Ad-hoc sale items require a positive unit_price",
      );
    });

    it("normalizes ad-hoc items with kind 'ad-hoc' and generates synthetic UUID", () => {
      const mockUuid = "00000000-0000-0000-0000-000000000001";
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            name: "Custom item",
            description: "Custom desc",
            unit_price: "25.00",
            quantity: 2,
          },
        ],
        payment_methods: [{ method: "cash", amount: "50.00" }],
        invoice_requested: true,
      };

      const result = normalizer.normalize(input, () => mockUuid);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        kind: "ad-hoc",
        originalIndex: 0,
        syntheticProductId: mockUuid,
        name: "Custom item",
        description: "Custom desc",
        unitPrice: "25.00",
        quantity: 2,
        splitTicket: undefined,
      });
      expect(result.invoiceRequested).toBe(true);
    });

    it("generates a valid random UUID when no uuid generator is passed", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "Item", unit_price: "10.00", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      const result = normalizer.normalize(input);
      const adHocItem = result.items[0];
      expect(adHocItem.kind).toBe("ad-hoc");
      if (adHocItem.kind === "ad-hoc") {
        expect(adHocItem.syntheticProductId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      }
    });
  });

  describe("Split-ticket normalization", () => {
    it("returns null when no split ticket configuration is provided", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      };
      const result = normalizer.normalize(input);
      expect(result.splitTicketGroups).toBeNull();
    });

    it("throws ValidationError when both split_ticket_groups and item split_ticket are provided", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            split_ticket: { group_1_quantity: 1, group_2_quantity: 1 },
          },
        ],
        payment_methods: [{ method: "cash", amount: "10.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: "B", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(input)).toThrow(
        "Sale split ticket input must use either split_ticket_groups or item split_ticket, not both",
      );
    });

    it("validates explicit split_ticket_groups: rejects if not exactly two groups", () => {
      const input1: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(input1)).toThrow(
        "Split ticket must contain exactly two groups",
      );

      const input3: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "10.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: "B", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: "C", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(input3)).toThrow(
        "Split ticket must contain exactly two groups",
      );
    });

    it("validates explicit split_ticket_groups: rejects empty or duplicate labels", () => {
      const emptyLabel: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "   ", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: "B", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(emptyLabel)).toThrow(
        "Split ticket group labels must not be empty",
      );

      const duplicateLabels: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: " A ", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(duplicateLabels)).toThrow(
        "Split ticket group labels must be unique",
      );
    });

    it("validates explicit split_ticket_groups: rejects unknown product or quantity mismatch", () => {
      const unknownProduct: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-unknown", quantity: 1 }] },
          { label: "B", items: [{ product_id: "prod-1", quantity: 1 }] },
        ],
      };
      expect(() => normalizer.normalize(unknownProduct)).toThrow(
        "Split ticket references unknown product prod-unknown",
      );

      const quantityMismatch: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 1 }] },
          { label: "B", items: [{ product_id: "prod-1", quantity: 2 }] },
        ],
      };
      expect(() => normalizer.normalize(quantityMismatch)).toThrow(
        "Split ticket allocation for product prod-1 must match the ordered quantity",
      );
    });

    it("validates explicit split_ticket_groups: rejects when either group has no allocations", () => {
      const emptyGroup: CreateSaleInput = {
        user_id: "user-1",
        items: [{ product_id: "prod-1", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: "prod-1", quantity: 2 }] },
          { label: "B", items: [] },
        ],
      };
      expect(() => normalizer.normalize(emptyGroup)).toThrow(
        "Split ticket groups must both contain allocations",
      );
    });

    it("normalizes explicit split_ticket_groups with ad-hoc items using synthetic UUID", () => {
      const mockUuid = "00000000-0000-0000-0000-000000000001";
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [{ name: "Custom", unit_price: "10.00", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "20.00" }],
        split_ticket_groups: [
          { label: "Kitchen", items: [{ product_id: mockUuid, quantity: 1 }] },
          { label: "Bar", items: [{ product_id: mockUuid, quantity: 1 }] },
        ],
      };
      const result = normalizer.normalize(input, () => mockUuid);
      expect(result.splitTicketGroups).toEqual([
        { label: "Kitchen", items: [{ product_id: mockUuid, quantity: 1 }] },
        { label: "Bar", items: [{ product_id: mockUuid, quantity: 1 }] },
      ]);
    });

    it("validates item-level split_ticket: rejects missing split_ticket on some items", () => {
      const input: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            split_ticket: { group_1_quantity: 1, group_2_quantity: 1 },
          },
          { product_id: "prod-2", quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "30.00" }],
      };
      expect(() => normalizer.normalize(input)).toThrow(
        "Sale split ticket input must define split_ticket for every item when using item splits",
      );
    });

    it("validates item-level split_ticket: rejects non-integer or negative quantities", () => {
      const negativeQty: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            split_ticket: { group_1_quantity: -1, group_2_quantity: 3 },
          },
        ],
        payment_methods: [{ method: "cash", amount: "20.00" }],
      };
      expect(() => normalizer.normalize(negativeQty)).toThrow(
        "Split ticket allocation for product prod-1 must use non-negative integer quantities",
      );

      const fractionalQty: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            split_ticket: { group_1_quantity: 1.5, group_2_quantity: 0.5 },
          },
        ],
        payment_methods: [{ method: "cash", amount: "20.00" }],
      };
      expect(() => normalizer.normalize(fractionalQty)).toThrow(
        "Split ticket allocation for product prod-1 must use non-negative integer quantities",
      );
    });

    it("validates item-level split_ticket: rejects quantity sum mismatch", () => {
      const sumMismatch: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 3,
            split_ticket: { group_1_quantity: 1, group_2_quantity: 1 },
          },
        ],
        payment_methods: [{ method: "cash", amount: "30.00" }],
      };
      expect(() => normalizer.normalize(sumMismatch)).toThrow(
        "Split ticket allocation for product prod-1 must match the item quantity",
      );
    });

    it("validates item-level split_ticket: rejects when all allocations go to single group", () => {
      const allToGroup1: CreateSaleInput = {
        user_id: "user-1",
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            split_ticket: { group_1_quantity: 2, group_2_quantity: 0 },
          },
        ],
        payment_methods: [{ method: "cash", amount: "20.00" }],
      };
      expect(() => normalizer.normalize(allToGroup1)).toThrow(
        "Split ticket groups must both contain allocations",
      );
    });
  });
});
