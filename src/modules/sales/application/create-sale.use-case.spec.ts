import { Test, TestingModule } from "@nestjs/testing";
import { CreateSaleUseCase } from "./create-sale.use-case";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { SaleRepositoryPort } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Sale } from "../domain/sale.entity";
import { Product } from "../../products/domain/product.entity";

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
    items: [
      {
        id: "item-id",
        sale_id: "sale-id",
        product_id: "product-id",
        quantity: 1,
        unit_price: "121.00",
        subtotal: "121.00",
      },
    ],
    invoice_status: "none",
    cae: null,
    cae_vto: null,
    cbte_nro: null,
    cbte_tipo: null,
    pto_vta: null,
    invoice_requested_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("CreateSaleUseCase", () => {
  let useCase: CreateSaleUseCase;
  let products: jest.Mocked<ProductRepositoryPort>;
  let sales: jest.Mocked<SaleRepositoryPort>;
  let issueInvoice: { issue: jest.Mock };

  beforeEach(async () => {
    products = {
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findByBarcode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    };
    sales = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findPageByUser: jest.fn(),
      findByIdForUser: jest.fn(),
    };
    issueInvoice = {
      issue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSaleUseCase,
        { provide: ProductRepositoryPort, useValue: products },
        { provide: SaleRepositoryPort, useValue: sales },
        { provide: IssueArcaInvoiceUseCase, useValue: issueInvoice },
      ],
    }).compile();

    useCase = module.get(CreateSaleUseCase);
  });

  it("creates a non-fiscal sale when invoice_requested is not provided", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(buildSale({ total: "121.00" }));

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
    });

    expect(result.total).toBe("121.00");
    expect(result.invoice_status).toBe("none");
    expect(issueInvoice.issue).not.toHaveBeenCalled();
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_status: "none",
        cae: null,
        cbte_nro: null,
      }),
    );
  });

  it("defaults invoice_requested to false", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(buildSale());

    await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
    });

    expect(issueInvoice.issue).not.toHaveBeenCalled();
  });

  it("calls ARCA and persists invoice data when invoice_requested is true", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    issueInvoice.issue.mockResolvedValue({
      cae: "74154876254185",
      cae_vto: "20240111",
      cbte_nro: 1,
      cbte_tipo: 6,
      pto_vta: 1,
    });
    sales.create.mockResolvedValue(
      buildSale({
        invoice_status: "issued",
        cae: "74154876254185",
        cbte_nro: 1,
      }),
    );

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
      invoice_requested: true,
    });

    expect(issueInvoice.issue).toHaveBeenCalledWith([{ product, quantity: 1 }]);
    expect(result.invoice_status).toBe("issued");
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_status: "issued",
        cae: "74154876254185",
        cae_vto: "20240111",
        cbte_nro: 1,
        cbte_tipo: 6,
        pto_vta: 1,
        invoice_requested_at: expect.any(Date),
      }),
    );
  });

  it("blocks the sale when any product is not facturable and invoice is requested", async () => {
    const product = buildProduct({ facturable: false });
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        invoice_requested: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(issueInvoice.issue).not.toHaveBeenCalled();
    expect(sales.create).not.toHaveBeenCalled();
  });

  it("does not block non-fiscal sales for non-facturable products", async () => {
    const product = buildProduct({ facturable: false });
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(buildSale());

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
    });

    expect(result.invoice_status).toBe("none");
    expect(issueInvoice.issue).not.toHaveBeenCalled();
  });

  it("rejects unknown products before checking invoice eligibility", async () => {
    products.findByIdsForSale.mockResolvedValue([]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: "missing-id", quantity: 1 }],
        invoice_requested: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(issueInvoice.issue).not.toHaveBeenCalled();
    expect(sales.create).not.toHaveBeenCalled();
  });

  it("propagates ARCA failures and does not persist the sale", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    issueInvoice.issue.mockRejectedValue(new Error("ARCA timeout"));

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        invoice_requested: true,
      }),
    ).rejects.toThrow("ARCA timeout");

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("loads repeated sale products in one batch before processing items", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(buildSale({ total: "242.00" }));

    await useCase.execute({
      user_id: "user-id",
      items: [
        { product_id: product.id, quantity: 1 },
        { product_id: product.id, quantity: 1 },
      ],
    });

    expect(products.findByIdsForSale).toHaveBeenCalledWith([product.id]);
    expect(products.findById).not.toHaveBeenCalled();
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: "242.00" }),
    );
  });
});
