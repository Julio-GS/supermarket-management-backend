import { Test, TestingModule } from "@nestjs/testing";
import { CreateSaleInput, CreateSaleUseCase } from "./create-sale.use-case";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { SaleRepositoryPort } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { PromotionResolverService } from "../../promotions/application/promotion-resolver.service";
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
    items: [
      {
        id: "item-id",
        sale_id: "sale-id",
        product_id: "product-id",
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
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Sale;
}

describe("CreateSaleUseCase", () => {
  let useCase: CreateSaleUseCase;
  let products: jest.Mocked<ProductRepositoryPort>;
  let sales: jest.Mocked<SaleRepositoryPort>;
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
    };
    issueInvoice = {
      issue: jest.fn(),
    };
    promotionResolver = {
      resolveForSaleItems: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSaleUseCase,
        { provide: ProductRepositoryPort, useValue: products },
        { provide: SaleRepositoryPort, useValue: sales },
        { provide: IssueArcaInvoiceUseCase, useValue: issueInvoice },
        { provide: PromotionResolverService, useValue: promotionResolver },
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
      payment_methods: [{ method: "cash", amount: "121.00" }],
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
      payment_methods: [{ method: "cash", amount: "121.00" }],
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
      payment_methods: [{ method: "cash", amount: "121.00" }],
    });

    expect(issueInvoice.issue).toHaveBeenCalledWith([
      { line_total: "121.00", iva_rate: "21.00" },
    ]);
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
        payment_methods: [{ method: "cash", amount: "121.00" }],
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
      payment_methods: [{ method: "cash", amount: "121.00" }],
    });

    expect(result.invoice_status).toBe("none");
    expect(issueInvoice.issue).not.toHaveBeenCalled();
  });

  it("persists a single payment method for a sale", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(
      buildSale({ payment_methods: [{ method: "cash", amount: "100.00" }] }),
    );

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
      payment_methods: [{ method: "cash", amount: "100.00" }],
    });

    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_methods: [{ method: "cash", amount: "100.00" }],
      }),
    );
    expect(result.payment_methods).toEqual([{ method: "cash", amount: "100.00" }]);
  });

  it("persists multiple payment methods for a sale", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);
    sales.create.mockResolvedValue(
      buildSale({
        payment_methods: [
          { method: "cash", amount: "80.00" },
          { method: "card", amount: "41.00" },
        ],
      }),
    );

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
      payment_methods: [
        { method: "cash", amount: "80.00" },
        { method: "card", amount: "41.00" },
      ],
    });

    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_methods: [
          { method: "cash", amount: "80.00" },
          { method: "card", amount: "41.00" },
        ],
      }),
    );
    expect(result.payment_methods).toEqual([
      { method: "cash", amount: "80.00" },
      { method: "card", amount: "41.00" },
    ]);
  });

  it("persists explicit split ticket groups and returns them", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    const splitTicketGroups = [
      { label: "A", items: [{ product_id: product.id, quantity: 2 }] },
      { label: "B", items: [{ product_id: product.id, quantity: 1 }] },
    ];
    const expectedResponseGroups = [
      {
        label: "A",
        items: [
          {
            product_id: product.id,
            quantity: 2,
            unit_price: "121.00",
            subtotal: "242.00",
          },
        ],
      },
      {
        label: "B",
        items: [
          {
            product_id: product.id,
            quantity: 1,
            unit_price: "121.00",
            subtotal: "121.00",
          },
        ],
      },
    ];
    sales.create.mockResolvedValue(
      buildSale({
        total: "363.00",
        split_ticket_groups: expectedResponseGroups,
      }),
    );

    const result = await useCase.execute({
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 3 }],
      payment_methods: [{ method: "cash", amount: "363.00" }],
      split_ticket_groups: splitTicketGroups,
    });

    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({ split_ticket_groups: splitTicketGroups }),
    );
    expect(result.split_ticket_groups).toEqual(expectedResponseGroups);
  });

  it("derives split ticket groups from item-level split allocations", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    const expectedResponseGroups = [
      {
        label: "A",
        items: [
          {
            product_id: product.id,
            quantity: 1,
            unit_price: "121.00",
            subtotal: "121.00",
          },
        ],
      },
      {
        label: "B",
        items: [
          {
            product_id: product.id,
            quantity: 3,
            unit_price: "121.00",
            subtotal: "363.00",
          },
        ],
      },
    ];
    sales.create.mockResolvedValue(
      buildSale({
        total: "484.00",
        split_ticket_groups: expectedResponseGroups,
      }),
    );

    const result = await useCase.execute({
      user_id: "user-id",
      items: [
        {
          product_id: product.id,
          quantity: 4,
          split_ticket: {
            group_1_quantity: 1,
            group_2_quantity: 3,
          },
        },
      ],
      payment_methods: [{ method: "cash", amount: "484.00" }],
    });

    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        split_ticket_groups: [
          { label: "A", items: [{ product_id: product.id, quantity: 1 }] },
          { label: "B", items: [{ product_id: product.id, quantity: 3 }] },
        ],
      }),
    );
    expect(result.split_ticket_groups).toEqual(expectedResponseGroups);
  });

  it("rejects split ticket groups with invalid group counts", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: product.id, quantity: 1 }] },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate split ticket labels", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: product.id, quantity: 1 }] },
          { label: "A", items: [{ product_id: product.id, quantity: 0 }] },
        ],
      } as unknown as CreateSaleInput),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects split ticket allocations that do not match item quantities", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 3 }],
        payment_methods: [{ method: "cash", amount: "363.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: product.id, quantity: 2 }] },
          { label: "B", items: [{ product_id: product.id, quantity: 2 }] },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects split ticket allocations for unknown products", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
        split_ticket_groups: [
          { label: "A", items: [{ product_id: product.id, quantity: 1 }] },
          {
            label: "B",
            items: [{ product_id: "00000000-0000-0000-0000-000000000999", quantity: 1 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects missing payment methods before persisting the sale", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    await expect(
      useCase.execute(
        {
          user_id: "user-id",
          items: [{ product_id: product.id, quantity: 1 }],
          payment_methods: [],
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported payment methods", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    const input = {
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
      payment_methods: [
        { method: "cash", amount: "50.00" },
        { method: "bitcoin", amount: "71.00" },
      ],
    } as unknown as CreateSaleInput;

    await expect(
      useCase.execute(input),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate payment methods", async () => {
    const product = buildProduct();
    products.findByIdsForSale.mockResolvedValue([product]);

    const input = {
      user_id: "user-id",
      items: [{ product_id: product.id, quantity: 1 }],
      payment_methods: [
        { method: "cash", amount: "60.00" },
        { method: "cash", amount: "61.00" },
      ],
    } as CreateSaleInput;

    await expect(
      useCase.execute(input),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sales.create).not.toHaveBeenCalled();
  });

  it("rejects unknown products before checking invoice eligibility", async () => {
    products.findByIdsForSale.mockResolvedValue([]);

    await expect(
      useCase.execute({
        user_id: "user-id",
        items: [{ product_id: "missing-id", quantity: 1 }],
        invoice_requested: true,
        payment_methods: [{ method: "cash", amount: "121.00" }],
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
        payment_methods: [{ method: "cash", amount: "121.00" }],
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
      payment_methods: [{ method: "cash", amount: "242.00" }],
    });

    expect(products.findByIdsForSale).toHaveBeenCalledWith([product.id]);
    expect(products.findById).not.toHaveBeenCalled();
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: "242.00" }),
    );
  });

  describe("manual (special-code) products", () => {
    it("accepts a manual product with line_total and quantity 1", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
        iva: null,
        codigos: ["1"],
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "350.00",
          items: [
            {
              id: "item-manual",
              sale_id: "sale-id",
              product_id: manualProduct.id,
              quantity: 1,
              unit_price: "350.00",
              subtotal: "350.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [
          {
            product_id: manualProduct.id,
            quantity: 1,
            line_total: "350.00",
          },
        ],
        payment_methods: [{ method: "cash", amount: "350.00" }],
      });

      expect(result.total).toBe("350.00");
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[0].unit_price).toBe("350.00");
      expect(result.items[0].subtotal).toBe("350.00");
      expect(result.items[0].discount_amount).toBe("0.00");
      expect(result.items[0].applied_promotions).toEqual([]);
      // Manual items must skip promotion resolution
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith([]);
    });

    it("rejects manual product when line_total is missing", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct]);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [{ product_id: manualProduct.id, quantity: 1 }],
          payment_methods: [{ method: "cash", amount: "100.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects manual product when line_total is zero or negative", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct]);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [
            {
              product_id: manualProduct.id,
              quantity: 1,
              line_total: "0.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "0.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [
            {
              product_id: manualProduct.id,
              quantity: 1,
              line_total: "-50.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "50.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects manual product when quantity is not 1", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct]);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [
            {
              product_id: manualProduct.id,
              quantity: 3,
              line_total: "500.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "500.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects fixed product when line_total is provided", async () => {
      const fixedProduct = buildProduct({ pricing_mode: "fixed" });
      products.findByIdsForSale.mockResolvedValue([fixedProduct]);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [
            {
              product_id: fixedProduct.id,
              quantity: 1,
              line_total: "500.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "500.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects invoice for a non-facturable manual product", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct]);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [
            {
              product_id: manualProduct.id,
              quantity: 1,
              line_total: "200.00",
            },
          ],
          invoice_requested: true,
          payment_methods: [{ method: "cash", amount: "200.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(issueInvoice.issue).not.toHaveBeenCalled();
      expect(sales.create).not.toHaveBeenCalled();
    });

    it("skips promotions for manual line items", async () => {
      const manualProduct = buildProduct({
        pricing_mode: "manual",
        is_protected: true,
        facturable: false,
        costo_final: null,
        codigos: ["1"],
      });
      const fixedProduct = buildProduct({
        id: "fixed-id",
        pricing_mode: "fixed",
        codigos: ["FIXED-001"],
      });
      products.findByIdsForSale.mockResolvedValue([manualProduct, fixedProduct]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "471.00",
          items: [
            {
              id: "item-manual",
              sale_id: "sale-id",
              product_id: manualProduct.id,
              quantity: 1,
              unit_price: "350.00",
              subtotal: "350.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
            {
              id: "item-fixed",
              sale_id: "sale-id",
              product_id: fixedProduct.id,
              quantity: 1,
              unit_price: "121.00",
              subtotal: "121.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: manualProduct.id, quantity: 1, line_total: "350.00" },
          { product_id: fixedProduct.id, quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "471.00" }],
      });

      expect(result.total).toBe("471.00");
      // Manual item must be skipped; only fixed items go to promotion resolver
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith([
        { productId: fixedProduct.id, unitPrice: "121.00", quantity: 1 },
      ]);
    });
  });

  describe("promotion resolution", () => {
    it("applies percentage discount and passes discount fields to repository", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue(
        [
          {
            promotionId: "promo-10",
            type: "percentage",
            discountAmount: "12.10",
            applied_promotions: [
              {
                promotion_id: "promo-10",
                promotion_scope: "product",
                promotion_type: "percentage",
                discount_amount: "12.10",
              },
            ],
          },
        ],
      );
      sales.create.mockResolvedValue(
        buildSale({ total: "108.90", items: [{ id: "item-id", sale_id: "sale-id", product_id: product.id, quantity: 1, unit_price: "121.00", subtotal: "108.90", discount_amount: "12.10", applied_promotions: [{ promotion_id: "promo-10", promotion_scope: "product", promotion_type: "percentage", discount_amount: "12.10" }] }] }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "108.90" }],
      });

      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith(
        [{ productId: product.id, unitPrice: "121.00", quantity: 1 }],
      );
      expect(sales.create).toHaveBeenCalledWith(
        expect.objectContaining({
          total: "108.90",
          items: expect.arrayContaining([
            expect.objectContaining({
              product_id: product.id,
              subtotal: "108.90",
              discount_amount: "12.10",
              applied_promotion_id: "promo-10",
              applied_promotion_type: "percentage",
              applied_promotions: [
                {
                  promotion_id: "promo-10",
                  promotion_scope: "product",
                  promotion_type: "percentage",
                  discount_amount: "12.10",
                },
              ],
            }),
          ]),
        }),
      );
      expect(result.items[0].discount_amount).toBe("12.10");
    });

    it("applies 2x1 discount to sale", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue(
        [
          {
            promotionId: "promo-2x1",
            type: "two_x_one",
            discountAmount: "121.00",
            applied_promotions: [
              {
                promotion_id: "promo-2x1",
                promotion_scope: "product",
                promotion_type: "two_x_one",
                discount_amount: "121.00",
              },
            ],
          },
        ],
      );
      sales.create.mockResolvedValue(
        buildSale({
          total: "242.00",
          items: [
            { id: "item-1", sale_id: "sale-id", product_id: product.id, quantity: 3, unit_price: "121.00", subtotal: "242.00", discount_amount: "121.00", applied_promotions: [{ promotion_id: "promo-2x1", promotion_scope: "product", promotion_type: "two_x_one", discount_amount: "121.00" }] },
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 3 }],
        payment_methods: [{ method: "cash", amount: "242.00" }],
      });

      expect(result.total).toBe("242.00");
      expect(result.items[0].discount_amount).toBe("121.00");
    });

    it("leaves items unchanged when no promotion applies", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null]);
      sales.create.mockResolvedValue(buildSale({ total: "121.00" }));

      await useCase.execute({
        user_id: "user-id",
        items: [{ product_id: product.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "121.00" }],
      });

      expect(sales.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              subtotal: "121.00",
              discount_amount: "0.00",
              applied_promotion_id: null,
              applied_promotions: [],
            }),
          ]),
        }),
      );
    });

    it("handles mixed items with and without promotions", async () => {
      const productA = buildProduct({ id: "prod-a" });
      const productB = buildProduct({ id: "prod-b" });
      products.findByIdsForSale.mockResolvedValue([productA, productB]);
      promotionResolver.resolveForSaleItems.mockResolvedValue(
        [
          { promotionId: "p1", type: "percentage", discountAmount: "10.00", applied_promotions: [{ promotion_id: "p1", promotion_scope: "product", promotion_type: "percentage", discount_amount: "10.00" }] },
          null,
        ],
      );
      sales.create.mockResolvedValue(
        buildSale({
          total: "290.00",
          items: [
            { id: "item-a", sale_id: "sale-id", product_id: "prod-a", quantity: 1, unit_price: "100.00", subtotal: "90.00", discount_amount: "10.00", applied_promotions: [{ promotion_id: "p1", promotion_scope: "product", promotion_type: "percentage", discount_amount: "10.00" }] },
            { id: "item-b", sale_id: "sale-id", product_id: "prod-b", quantity: 1, unit_price: "200.00", subtotal: "200.00", discount_amount: "0.00", applied_promotions: [] },
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: "prod-a", quantity: 1 },
          { product_id: "prod-b", quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "290.00" }],
      });

      expect(result.total).toBe("290.00");
      expect(result.items).toHaveLength(2);
    });
  });

  describe("ad-hoc (non-catalog) items", () => {
    it("accepts mixed catalog and ad-hoc items in a single sale", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null, null]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "621.00",
          items: [
            {
              id: "item-catalog",
              sale_id: "sale-id",
              product_id: product.id,
              quantity: 1,
              unit_price: "121.00",
              subtotal: "121.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: expect.any(String) as unknown as string,
              name: "Alfajor",
              iva: "21.00",
              quantity: 2,
              unit_price: "250.00",
              subtotal: "500.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: product.id, quantity: 1 },
          { name: "Alfajor", unit_price: "250.00", quantity: 2 },
        ],
        payment_methods: [{ method: "cash", amount: "621.00" }],
      });

      expect(result.total).toBe("621.00");
      expect(result.items).toHaveLength(2);
      // Catalog item unchanged
      expect(result.items[0].product_id).toBe(product.id);
      // Ad-hoc item has a synthetic product_id
      expect(result.items[1].product_id).toBeTruthy();
      expect(result.items[1].name).toBe("Alfajor");
      expect(result.items[1].iva).toBe("21.00");
    });

    it("creates a sale with only ad-hoc items", async () => {
      products.findByIdsForSale.mockResolvedValue([]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "500.00",
          items: [
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: "synthetic-uuid",
              name: "Servicio técnico",
              iva: "21.00",
              quantity: 1,
              unit_price: "500.00",
              subtotal: "500.00",
              discount_amount: "0.00",
              applied_promotions: [],
            } as any,
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [
          { name: "Servicio técnico", unit_price: "500.00", quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "500.00" }],
      });

      expect(result.total).toBe("500.00");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Servicio técnico");
    });

    it("rejects ad-hoc item with missing name", async () => {
      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [{ unit_price: "100.00", quantity: 1, name: "" } as any],
          payment_methods: [{ method: "cash", amount: "100.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects ad-hoc item with missing unit_price", async () => {
      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [{ name: "Alfajor", quantity: 1, unit_price: "" } as any],
          payment_methods: [{ method: "cash", amount: "100.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("rejects ad-hoc item with zero or negative unit_price", async () => {
      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [{ name: "Alfajor", unit_price: "0.00", quantity: 1 }],
          payment_methods: [{ method: "cash", amount: "0.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        useCase.execute({
          user_id: "user-id",
          items: [{ name: "Alfajor", unit_price: "-10.00", quantity: 1 }],
          payment_methods: [{ method: "cash", amount: "10.00" }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(sales.create).not.toHaveBeenCalled();
    });

    it("uses 21% IVA for ad-hoc items in invoice requests", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null, null]);
      issueInvoice.issue.mockResolvedValue({
        cae: "74154876254185",
        cae_vto: "20240111",
        cbte_nro: 1,
        cbte_tipo: 6,
        pto_vta: 1,
      });
      sales.create.mockResolvedValue(
        buildSale({ invoice_status: "issued", cae: "74154876254185" }),
      );

      await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: product.id, quantity: 1 },
          { name: "Alfajor", unit_price: "250.00", quantity: 2 },
        ],
        invoice_requested: true,
        payment_methods: [{ method: "cash", amount: "621.00" }],
      });

      // Ad-hoc item should use fixed 21% IVA
      expect(issueInvoice.issue).toHaveBeenCalledWith(
        expect.arrayContaining([
          { line_total: "121.00", iva_rate: "21.00" },
          { line_total: "500.00", iva_rate: "21.00" },
        ]),
      );
    });

    it("includes ad-hoc items in promotion resolution for store promotions", async () => {
      const product = buildProduct();
      products.findByIdsForSale.mockResolvedValue([product]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([null, null]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "621.00",
          items: [
            {
              id: "item-catalog",
              sale_id: "sale-id",
              product_id: product.id,
              quantity: 1,
              unit_price: "121.00",
              subtotal: "121.00",
              discount_amount: "0.00",
              applied_promotions: [],
            },
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: expect.any(String) as unknown as string,
              name: "Alfajor",
              quantity: 2,
              unit_price: "250.00",
              subtotal: "500.00",
              discount_amount: "0.00",
              applied_promotions: [],
            } as any,
          ],
        }),
      );

      await useCase.execute({
        user_id: "user-id",
        items: [
          { product_id: product.id, quantity: 1 },
          { name: "Alfajor", unit_price: "250.00", quantity: 2 },
        ],
        payment_methods: [{ method: "cash", amount: "621.00" }],
      });

      // Both catalog and ad-hoc items should be passed to promotion resolver
      expect(promotionResolver.resolveForSaleItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ productId: product.id, unitPrice: "121.00", quantity: 1 }),
          expect.objectContaining({ unitPrice: "250.00", quantity: 2 }),
        ]),
      );
    });

    it("applies store-wide promotion discount to ad-hoc items", async () => {
      products.findByIdsForSale.mockResolvedValue([]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([
        {
          promotionId: "store-promo-10",
          type: "percentage",
          discountAmount: "50.00",
          applied_promotions: [
            {
              promotion_id: "store-promo-10",
              promotion_scope: "store",
              promotion_type: "percentage",
              discount_amount: "50.00",
            },
          ],
        },
      ]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "450.00",
          items: [
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: "synthetic-uuid",
              name: "Alfajor",
              iva: "21.00",
              quantity: 2,
              unit_price: "250.00",
              subtotal: "450.00",
              discount_amount: "50.00",
              applied_promotions: [
                {
                  promotion_id: "store-promo-10",
                  promotion_scope: "store",
                  promotion_type: "percentage",
                  discount_amount: "50.00",
                },
              ],
            } as any,
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [{ name: "Alfajor", unit_price: "250.00", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "450.00" }],
      });

      expect(result.total).toBe("450.00");
      expect(result.items[0].discount_amount).toBe("50.00");
      // Only store promotions applied
      expect(result.items[0].applied_promotions).toEqual([
        expect.objectContaining({ promotion_scope: "store" }),
      ]);
    });

    it("filters out product-scoped promotions for ad-hoc items", async () => {
      products.findByIdsForSale.mockResolvedValue([]);
      promotionResolver.resolveForSaleItems.mockResolvedValue([
        {
          promotionId: "product-promo-1",
          type: "percentage",
          discountAmount: "25.00",
          applied_promotions: [
            {
              promotion_id: "product-promo-1",
              promotion_scope: "product",
              promotion_type: "percentage",
              discount_amount: "25.00",
            },
            {
              promotion_id: "store-promo-10",
              promotion_scope: "store",
              promotion_type: "percentage",
              discount_amount: "20.00",
            },
          ],
        },
      ]);
      sales.create.mockResolvedValue(
        buildSale({
          total: "480.00",
          items: [
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: "synthetic-uuid",
              name: "Alfajor",
              iva: "21.00",
              quantity: 2,
              unit_price: "250.00",
              subtotal: "480.00",
              discount_amount: "20.00",
              applied_promotions: [
                {
                  promotion_id: "store-promo-10",
                  promotion_scope: "store",
                  promotion_type: "percentage",
                  discount_amount: "20.00",
                },
              ],
            } as any,
          ],
        }),
      );

      const result = await useCase.execute({
        user_id: "user-id",
        items: [{ name: "Alfajor", unit_price: "250.00", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "480.00" }],
      });

      // Product-scoped promotion should be filtered out
      expect(result.items[0].applied_promotions).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ promotion_scope: "product" }),
        ]),
      );
      // Store promotion should remain
      expect(result.items[0].applied_promotions).toEqual([
        expect.objectContaining({ promotion_scope: "store" }),
      ]);
      // Discount should only be the store portion
      expect(result.items[0].discount_amount).toBe("20.00");
    });

    it("does not fetch product catalog for ad-hoc items", async () => {
      sales.create.mockResolvedValue(
        buildSale({
          total: "500.00",
          items: [
            {
              id: "item-adhoc",
              sale_id: "sale-id",
              product_id: "synthetic-uuid",
              name: "Alfajor",
              iva: "21.00",
              quantity: 2,
              unit_price: "250.00",
              subtotal: "500.00",
              discount_amount: "0.00",
              applied_promotions: [],
            } as any,
          ],
        }),
      );
      promotionResolver.resolveForSaleItems.mockResolvedValue([null]);

      await useCase.execute({
        user_id: "user-id",
        items: [{ name: "Alfajor", unit_price: "250.00", quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "500.00" }],
      });

      // findByIdsForSale should not be called when there are only ad-hoc items
      expect(products.findByIdsForSale).not.toHaveBeenCalled();
    });
  });
});
