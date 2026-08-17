import { Test, TestingModule } from "@nestjs/testing";
import { CreateSaleUseCase } from "./create-sale.use-case";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { SaleRepositoryPort } from "./sale.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { PromotionResolverService } from "../../promotions/application/promotion-resolver.service";
import { Sale } from "../domain/sale.entity";
import { Product } from "../../products/domain/product.entity";

// WU-01 characterization baseline.
//
// These tests document behavior of the CURRENT monolithic CreateSaleUseCase
// that the existing `create-sale.use-case.spec.ts` does not explicitly lock:
//   1. the full collaborator call order (sale persisted before inventory);
//   2. deterministic lexicographic ordering of inventory deductions;
//   3. the exact `SaleRepositoryPort.create` payload shape (snake_case fields,
//      catalog item IVA omission when no invoice, no camelCase aliases).
//
// No production code is changed by this unit. These tests must pass against
// the existing monolith as-is; a failure means the characterization (or the
// spec/design) is wrong and must be surfaced via WU-01-GATE.

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-id",
    detalle: "Test Product",
    costo_neto: "100.00",
    costo_final: "121.00",
    iva: "21.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-01",
    etiqueta: "test",
    facturable: true,
    maneja_stock: false,
    codigos: ["123456"],
    pricing_mode: "fixed",
    is_protected: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-id",
    user_id: "user-id",
    total: "121.00",
    payment_methods: [{ method: "cash", amount: "121.00" }],
    split_ticket_groups: null,
    items: [],
    invoice_status: "none",
    manual_discount_amount: "0.00",
    manual_discount_modality: null,
    manual_discount_percentage: null,
    cae: null,
    cae_vto: null,
    cbte_nro: null,
    cbte_tipo: null,
    pto_vta: null,
    invoice_requested_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Sale;
}

function firstCallOrder(mock: {
  mock: { invocationCallOrder: number[] };
}): number {
  expect(mock).toHaveBeenCalled();
  return mock.mock.invocationCallOrder[0];
}

describe("CreateSaleUseCase — WU-01 characterization baseline", () => {
  let useCase: CreateSaleUseCase;
  let products: jest.Mocked<ProductRepositoryPort>;
  let sales: jest.Mocked<SaleRepositoryPort>;
  let inventory: jest.Mocked<Pick<InventoryRepositoryPort, "adjustBalance">>;
  let issueInvoice: { issue: jest.Mock };
  let promotionResolver: { resolveForSaleItems: jest.Mock };

  beforeEach(async () => {
    products = {
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findByBarcode: jest.fn(),
      findByCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    };
    sales = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findPageByUser: jest.fn(),
      findByIdForUser: jest.fn(),
      findByIdForUserForUpdate: jest.fn(),
      markInvoiceIssued: jest.fn(),
      transitionInvoiceStatus: jest.fn(),
    };
    inventory = {
      adjustBalance: jest.fn(),
    };
    issueInvoice = {
      issue: jest.fn(),
    };
    promotionResolver = {
      resolveForSaleItems: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSaleUseCase,
        { provide: ProductRepositoryPort, useValue: products },
        { provide: SaleRepositoryPort, useValue: sales },
        { provide: InventoryRepositoryPort, useValue: inventory },
        { provide: IssueArcaInvoiceUseCase, useValue: issueInvoice },
        { provide: PromotionResolverService, useValue: promotionResolver },
      ],
    }).compile();

    useCase = module.get(CreateSaleUseCase);
  });

  describe("collaboration order", () => {
    it("invokes collaborators in order: products → promotions → ARCA → sale create → inventory", async () => {
      const product = buildProduct({ id: "tracked-1", maneja_stock: true });
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([]);
      issueInvoice.issue.mockResolvedValue({
        cae: "74154876254185",
        cae_vto: "20240111",
        cbte_nro: 1,
        cbte_tipo: 6,
        pto_vta: 1,
      });
      sales.create.mockResolvedValue(buildSale({ id: "sale-order" }));
      inventory.adjustBalance.mockResolvedValue(undefined as never);

      await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        invoice_requested: true,
        payment_methods: [{ method: "cash", amount: "121.00" }],
      });

      const productsOrder = firstCallOrder(products.findByIdsForSale);
      const promotionsOrder = firstCallOrder(promotionResolver.resolveForSaleItems);
      const arcaOrder = firstCallOrder(issueInvoice.issue);
      const salesOrder = firstCallOrder(sales.create);
      const inventoryOrder = firstCallOrder(inventory.adjustBalance);

      expect(productsOrder).toBeLessThan(promotionsOrder);
      expect(promotionsOrder).toBeLessThan(arcaOrder);
      expect(arcaOrder).toBeLessThan(salesOrder);
      expect(salesOrder).toBeLessThan(inventoryOrder);
    });

    it("persists the sale before deducting stock (sale-first invariant)", async () => {
      const product = buildProduct({ id: "tracked-1", maneja_stock: true });
      products.findByIdsForSale.mockResolvedValue([product]);
      sales.create.mockResolvedValue(buildSale({ id: "sale-first" }));
      inventory.adjustBalance.mockResolvedValue(undefined as never);

      await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
      });

      expect(firstCallOrder(sales.create)).toBeLessThan(
        firstCallOrder(inventory.adjustBalance),
      );
    });
  });

  describe("inventory deduction ordering", () => {
    it("deducts stock in lexicographic product-UUID order regardless of input order", async () => {
      const zProduct = buildProduct({ id: "z-uuid", maneja_stock: true });
      const aProduct = buildProduct({ id: "a-uuid", maneja_stock: true });
      const mProduct = buildProduct({ id: "m-uuid", maneja_stock: true });
      products.findByIdsForSale.mockResolvedValue([zProduct, aProduct, mProduct]);
      sales.create.mockResolvedValue(buildSale({ id: "sale-sorted" }));
      inventory.adjustBalance.mockResolvedValue(undefined as never);

      await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: zProduct.id, quantity: 3 },
          { product_id: aProduct.id, quantity: 1 },
          { product_id: mProduct.id, quantity: 2 },
        ],
        payment_methods: [{ method: "cash", amount: "726.00" }],
      });

      expect(inventory.adjustBalance).toHaveBeenCalledTimes(3);
      expect(inventory.adjustBalance).toHaveBeenNthCalledWith(
        1,
        "a-uuid",
        -1,
        "sale",
        "sale-sorted",
      );
      expect(inventory.adjustBalance).toHaveBeenNthCalledWith(
        2,
        "m-uuid",
        -2,
        "sale",
        "sale-sorted",
      );
      expect(inventory.adjustBalance).toHaveBeenNthCalledWith(
        3,
        "z-uuid",
        -3,
        "sale",
        "sale-sorted",
      );
    });
  });

  describe("repository input shape", () => {
    it("passes the exact SaleCreateInput payload with snake_case fields and no camelCase alias", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      sales.create.mockResolvedValue(buildSale({ total: "121.00" }));

      await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
      });

      expect(sales.create).toHaveBeenCalledWith({
        user_id: "user-id",
        items: [
          {
            product_id: product.id,
            quantity: 1,
            unit_price: "121.00",
            subtotal: "121.00",
            discount_amount: "0.00",
            applied_promotions: [],
            applied_promotion_id: null,
            applied_promotion_type: null,
          },
        ],
        payment_methods: [{ method: "cash", amount: "121.00" }],
        split_ticket_groups: null,
        total: "121.00",
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

      const createPayload = sales.create.mock.calls[0][0];
      expect(Object.keys(createPayload).sort()).toEqual([
        "cae",
        "cae_vto",
        "cbte_nro",
        "cbte_tipo",
        "invoice_requested_at",
        "invoice_status",
        "items",
        "manual_discount_amount",
        "manual_discount_modality",
        "manual_discount_percentage",
        "payment_methods",
        "pto_vta",
        "split_ticket_groups",
        "total",
        "user_id",
      ]);
      expect(createPayload).not.toHaveProperty("caeVto");
    });

    it("omits name/description/iva for a catalog item when no invoice is requested", async () => {
      const product = buildProduct({ iva: "21.00" });
      products.findByIdsForSale.mockResolvedValue([product]);
      sales.create.mockResolvedValue(buildSale({ total: "121.00" }));

      await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
      });

      const item = sales.create.mock.calls[0][0].items[0];
      expect(item).not.toHaveProperty("name");
      expect(item).not.toHaveProperty("description");
      expect(item).not.toHaveProperty("iva");
      expect(Object.keys(item).sort()).toEqual([
        "applied_promotion_id",
        "applied_promotion_type",
        "applied_promotions",
        "discount_amount",
        "product_id",
        "quantity",
        "subtotal",
        "unit_price",
      ]);
    });
  });
});
