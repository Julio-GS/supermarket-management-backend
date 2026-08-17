import { Logger } from "@nestjs/common";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { PostPersistenceInventoryPolicy } from "./post-persistence-inventory-policy";
import {
  InventoryDeductionLine,
  ResolvedSaleLine,
  toInventoryDeductionLines,
} from "./create-sale.types";
import { Product } from "../../products/domain/product.entity";

describe("PostPersistenceInventoryPolicy", () => {
  let inventory: jest.Mocked<Pick<InventoryRepositoryPort, "adjustBalance">>;
  let policy: PostPersistenceInventoryPolicy;

  beforeEach(() => {
    jest.restoreAllMocks();
    inventory = { adjustBalance: jest.fn().mockResolvedValue(undefined as never) };
    policy = new PostPersistenceInventoryPolicy(inventory as unknown as InventoryRepositoryPort);
  });

  it("deducts stock for a single stock-managed catalog line", async () => {
    const lines: InventoryDeductionLine[] = [{ productId: "prod-1", quantity: 3, stockManaged: true }];
    await policy.deductAfterSalePersisted({ saleId: "sale-123", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(1);
    expect(inventory.adjustBalance).toHaveBeenCalledWith("prod-1", -3, "sale", "sale-123");
  });

  it("skips non-stock-managed catalog items and empty lines", async () => {
    const lines: InventoryDeductionLine[] = [{ productId: "unmanaged-1", quantity: 5, stockManaged: false }];
    await policy.deductAfterSalePersisted({ saleId: "sale-123", lines });
    await policy.deductAfterSalePersisted({ saleId: "sale-empty", lines: [] });

    expect(inventory.adjustBalance).not.toHaveBeenCalled();
  });

  it("skips lines with non-positive quantities (quantity <= 0)", async () => {
    const lines: InventoryDeductionLine[] = [
      { productId: "prod-zero", quantity: 0, stockManaged: true },
      { productId: "prod-neg", quantity: -2, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-non-positive", lines });

    expect(inventory.adjustBalance).not.toHaveBeenCalled();
  });

  it("aggregates duplicate product lines into a single adjustment", async () => {
    const lines: InventoryDeductionLine[] = [
      { productId: "prod-dup", quantity: 2, stockManaged: true },
      { productId: "prod-dup", quantity: 3, stockManaged: true },
      { productId: "prod-dup", quantity: 1, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-dup", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(1);
    expect(inventory.adjustBalance).toHaveBeenCalledWith("prod-dup", -6, "sale", "sale-dup");
  });

  it("filters unmanaged lines and aggregates only managed lines in a mixed list", async () => {
    const lines: InventoryDeductionLine[] = [
      { productId: "prod-managed-1", quantity: 2, stockManaged: true },
      { productId: "prod-unmanaged", quantity: 10, stockManaged: false },
      { productId: "prod-managed-1", quantity: 3, stockManaged: true },
      { productId: "prod-managed-2", quantity: 1, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-mixed", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(2);
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(1, "prod-managed-1", -5, "sale", "sale-mixed");
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(2, "prod-managed-2", -1, "sale", "sale-mixed");
  });

  it("calls adjustBalance in deterministic lexicographical order of product IDs", async () => {
    const lines: InventoryDeductionLine[] = [
      { productId: "prod-z", quantity: 1, stockManaged: true },
      { productId: "prod-a", quantity: 2, stockManaged: true },
      { productId: "prod-m", quantity: 3, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-order", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(3);
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(1, "prod-a", -2, "sale", "sale-order");
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(2, "prod-m", -3, "sale", "sale-order");
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(3, "prod-z", -1, "sale", "sale-order");
  });

  it("catches and logs errors without failing or throwing", async () => {
    const stockError = new Error("inventory connection failure");
    inventory.adjustBalance.mockRejectedValue(stockError);
    const loggerSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(jest.fn());

    const lines: InventoryDeductionLine[] = [{ productId: "prod-fail", quantity: 2, stockManaged: true }];
    await expect(policy.deductAfterSalePersisted({ saleId: "sale-fail", lines })).resolves.toBeUndefined();

    expect(inventory.adjustBalance).toHaveBeenCalledWith("prod-fail", -2, "sale", "sale-fail");
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deduct stock for product prod-fail after sale sale-fail"),
      stockError.stack,
    );
  });

  it("handles non-Error thrown values gracefully", async () => {
    inventory.adjustBalance.mockRejectedValue("string rejection error");
    const loggerSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(jest.fn());

    const lines: InventoryDeductionLine[] = [{ productId: "prod-string-err", quantity: 1, stockManaged: true }];
    await expect(policy.deductAfterSalePersisted({ saleId: "sale-str-err", lines })).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deduct stock for product prod-string-err after sale sale-str-err"),
      undefined,
    );
  });

  it("continues adjusting subsequent products when an earlier product fails", async () => {
    const stockError = new Error("first product failed");
    inventory.adjustBalance.mockRejectedValueOnce(stockError).mockResolvedValueOnce(undefined as never);
    const loggerSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(jest.fn());

    const lines: InventoryDeductionLine[] = [
      { productId: "prod-a", quantity: 2, stockManaged: true },
      { productId: "prod-b", quantity: 4, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-partial", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(2);
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(1, "prod-a", -2, "sale", "sale-partial");
    expect(inventory.adjustBalance).toHaveBeenNthCalledWith(2, "prod-b", -4, "sale", "sale-partial");
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deduct stock for product prod-a after sale sale-partial"),
      stockError.stack,
    );
  });

  it("logs errors for multiple failing products while allowing successful products through", async () => {
    const errA = new Error("err A");
    const errC = new Error("err C");
    inventory.adjustBalance
      .mockRejectedValueOnce(errA)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(errC);
    const loggerSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(jest.fn());

    const lines: InventoryDeductionLine[] = [
      { productId: "prod-a", quantity: 1, stockManaged: true },
      { productId: "prod-b", quantity: 2, stockManaged: true },
      { productId: "prod-c", quantity: 3, stockManaged: true },
    ];
    await policy.deductAfterSalePersisted({ saleId: "sale-multi-fail", lines });

    expect(inventory.adjustBalance).toHaveBeenCalledTimes(3);
    expect(loggerSpy).toHaveBeenCalledTimes(2);
    expect(loggerSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("Failed to deduct stock for product prod-a after sale sale-multi-fail"),
      errA.stack,
    );
    expect(loggerSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("Failed to deduct stock for product prod-c after sale sale-multi-fail"),
      errC.stack,
    );
  });

  describe("toInventoryDeductionLines helper", () => {
    const dummyProduct: Product = {
      id: "prod-1",
      detalle: "Test product",
      costo_neto: "80.00",
      costo_final: "100.00",
      iva: "21.00",
      cambio_costo: "2024-01-01",
      cambio_precio: "2024-01-01",
      etiqueta: "N",
      maneja_stock: true,
      facturable: true,
      codigos: ["123"],
      pricing_mode: "fixed",
      is_protected: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it("correctly maps resolved catalog fixed, manual, and ad-hoc lines", () => {
      const resolvedLines: ResolvedSaleLine[] = [
        {
          kind: "catalog-fixed",
          lineId: "prod-fixed-managed",
          originalIndex: 0,
          product: { ...dummyProduct, id: "prod-fixed-managed", maneja_stock: true },
          quantity: 3,
          unitPrice: "100.00",
          promotionEligible: true,
          stockManaged: true,
          facturable: true,
          ivaForPersistence: null,
        },
        {
          kind: "catalog-fixed",
          lineId: "prod-fixed-unmanaged",
          originalIndex: 1,
          product: { ...dummyProduct, id: "prod-fixed-unmanaged", maneja_stock: false },
          quantity: 2,
          unitPrice: "50.00",
          promotionEligible: true,
          stockManaged: false,
          facturable: true,
          ivaForPersistence: null,
        },
        {
          kind: "catalog-manual",
          lineId: "prod-manual-managed",
          originalIndex: 2,
          product: { ...dummyProduct, id: "prod-manual-managed", maneja_stock: true },
          quantity: 1,
          unitPrice: "75.00",
          lineTotal: "75.00",
          promotionEligible: false,
          stockManaged: true,
          facturable: true,
          ivaForPersistence: null,
        },
        {
          kind: "ad-hoc",
          lineId: "adhoc-uuid",
          originalIndex: 3,
          adHoc: { name: "Custom Item", description: null },
          quantity: 4,
          unitPrice: "30.00",
          promotionEligible: true,
          stockManaged: false,
          facturable: true,
          ivaForPersistence: "21.00",
        },
      ];

      const deductionLines = toInventoryDeductionLines(resolvedLines);

      expect(deductionLines).toEqual([
        { productId: "prod-fixed-managed", quantity: 3, stockManaged: true },
        { productId: "prod-fixed-unmanaged", quantity: 2, stockManaged: false },
        { productId: "prod-manual-managed", quantity: 1, stockManaged: true },
        { productId: "adhoc-uuid", quantity: 4, stockManaged: false },
      ]);
    });
  });
});
