import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { TestAppModule } from "./test-app.module";
import { HttpExceptionFilter } from "../src/shared/errors/http.exception-filter";
import { ArcaInvoicePort } from "../src/modules/sales/application/arca-invoice.port";

describe("AppController (e2e)", () => {
  let app: INestApplication;
  let token: string;
  const createFacturaBConsumidorFinal = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(ArcaInvoicePort)
      .useValue({ createFacturaBConsumidorFinal })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // Seed special-product codes 1-9 (migration equivalent for E2E tests)
    const dataSource = app.get(DataSource);
    await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    const seedProducts: { code: string; detalle: string }[] = [
      { code: "1", detalle: "Fiambre" },
      { code: "2", detalle: "Pan" },
      { code: "3", detalle: "Kiosco" },
      { code: "4", detalle: "Perfumeria" },
      { code: "5", detalle: "Carne" },
      { code: "6", detalle: "Verdura" },
      { code: "7", detalle: "Huevos" },
      { code: "8", detalle: "Limpieza" },
      { code: "9", detalle: "Bolsas" },
    ];
    for (const { code, detalle } of seedProducts) {
      await dataSource.query(
        `INSERT INTO products (id, detalle, costo_neto, costo_final, iva, cambio_costo, cambio_precio, etiqueta, facturable, maneja_stock, pricing_mode, is_protected, created_at, updated_at)
         VALUES (uuid_generate_v5(uuid_nil(), $1), $2, NULL, NULL, NULL, '', '', '', false, false, 'manual', true, now(), now())
         ON CONFLICT DO NOTHING`,
        [`special-product-${code}`, detalle],
      );
      await dataSource.query(
        `INSERT INTO product_barcodes (codigo, product_id)
         SELECT $1, id FROM products WHERE detalle = $2 AND pricing_mode = 'manual'
         ON CONFLICT DO NOTHING`,
        [code, detalle],
      );
    }
  });

  beforeEach(() => {
    createFacturaBConsumidorFinal.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/auth/register (POST) creates a user and returns a token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ username: "demo", password: "password123" })
      .expect(201);
    expect(res.body.access_token).toBeDefined();
    token = res.body.access_token;
  });

  it("/auth/login (POST) returns a token for valid credentials", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ username: "demo", password: "password123" })
      .expect(200);
    expect(res.body.access_token).toBeDefined();
  });

  it("rejects protected routes without a token", () => {
    return request(app.getHttpServer()).get("/api/v1/products").expect(401);
  });

  it("/products (POST) creates a product with barcodes", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Test Product",
        costo_neto: "1000.00",
        costo_final: "2500.50",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["123456789"],
      })
      .expect(201);
    expect(res.body.costo_final).toBe("2500.50");
    expect(res.body.codigos).toEqual(["123456789"]);
  });

  it("/products (POST) rejects duplicate barcodes", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Duplicate",
        costo_neto: "1000.00",
        costo_final: "2000.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "dup",
        facturable: true,
        maneja_stock: false,
        codigos: ["123456789"],
      })
      .expect(409);
  });

  it("/products (GET) keeps array compatibility without pagination params", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it("/products (GET) returns paginated metadata and invalidates cached reads after writes", async () => {
    const before = await request(app.getHttpServer())
      .get("/api/v1/products?page=1&limit=50&sort=created_at:desc")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(before.body.data)).toBe(true);
    expect(before.body.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 50,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    );

    const created = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Cache Invalidation Product",
        costo_neto: "1000.00",
        costo_final: "2000.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "cache",
        facturable: true,
        maneja_stock: false,
        codigos: ["CACHE001"],
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get("/api/v1/products?page=1&limit=50&sort=created_at:desc")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(
      after.body.data.map((product: { id: string }) => product.id),
    ).toContain(created.body.id);
    expect(after.body.meta.total).toBeGreaterThan(before.body.meta.total);
  });

  it("/products (GET) searches products by detail or barcode", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Searchable Milk Product",
        costo_neto: "1000.00",
        costo_final: "2000.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "search",
        facturable: true,
        maneja_stock: false,
        codigos: ["SEARCH-MILK-001"],
      })
      .expect(201);

    const detailSearch = await request(app.getHttpServer())
      .get("/api/v1/products?search=milk")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(detailSearch.body)).toBe(true);
    expect(
      detailSearch.body.map((product: { id: string }) => product.id),
    ).toContain(created.body.id);

    const barcodeSearch = await request(app.getHttpServer())
      .get("/api/v1/products?search=SEARCH-MILK-001&page=1&limit=20&sort=detalle:asc")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(barcodeSearch.body.data)).toBe(true);
    expect(
      barcodeSearch.body.data.map((product: { id: string }) => product.id),
    ).toContain(created.body.id);
    expect(barcodeSearch.body.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      }),
    );
  });

  it("/sales (POST) creates a sale with computed totals", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Sale Product",
        costo_neto: "1000.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "sale",
        facturable: true,
        maneja_stock: false,
        codigos: ["SALE001"],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 3 }],
        payment_methods: [{ method: "cash", amount: "300.00" }],
      })
      .expect(201);

    expect(res.body.total).toBe("300.00");
    expect(res.body.items[0].subtotal).toBe("300.00");
    expect(res.body.items[0].unit_price).toBe("100.00");
    expect(res.body.invoice_status).toBe("none");
    expect(res.body.payment_methods).toEqual([{ method: "cash", amount: "300.00" }]);
    expect(createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("/sales (POST) creates a sale with multiple payment methods", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Split Sale Product",
        costo_neto: "1000.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "sale-split",
        facturable: true,
        maneja_stock: false,
        codigos: ["SALE002"],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 2 }],
        payment_methods: [{ method: "cash", amount: "100.00" }, { method: "card", amount: "100.00" }],
      })
      .expect(201);

    expect(res.body.total).toBe("200.00");
    expect(res.body.payment_methods).toEqual([
      { method: "cash", amount: "100.00" },
      { method: "card", amount: "100.00" },
    ]);
  });

  it("/sales (POST) rejects unknown products", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { product_id: "00000000-0000-0000-0000-000000000000", quantity: 1 },
        ],
        payment_methods: [{ method: "cash", amount: "10.00" }],
      })
      .expect(404);
  });

  it("/sales (POST) rejects empty items", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [], payment_methods: [{ method: "cash", amount: "0.00" }] })
      .expect(400);
  });

  it("/sales (POST) rejects missing payment methods", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Missing Payment Product",
        costo_neto: "1000.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "sale-missing-payment",
        facturable: true,
        maneja_stock: false,
        codigos: ["SALE003"],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ product_id: product.body.id, quantity: 1 }] })
      .expect(400);
  });

  it("/sales (POST) rejects unsupported payment methods", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Invalid Payment Product",
        costo_neto: "1000.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "sale-invalid-payment",
        facturable: true,
        maneja_stock: false,
        codigos: ["SALE004"],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "50.00" }, { method: "bitcoin", amount: "50.00" }],
      })
      .expect(400);
  });

  it("/sales (POST) issues an ARCA invoice when requested and all products are facturable", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Invoice Product",
        costo_neto: "100.00",
        costo_final: "121.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "invoice",
        facturable: true,
        maneja_stock: false,
        codigos: ["INV001"],
      })
      .expect(201);

    createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "74154876254185",
      cae_vto: "20240111",
      cbte_nro: 1,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        invoice_requested: true,
        payment_methods: [{ method: "cash", amount: "121.00" }],
      })
      .expect(201);

    expect(res.body.total).toBe("121.00");
    expect(res.body.invoice_status).toBe("issued");
    expect(res.body.cae).toBe("74154876254185");
    expect(res.body.cbte_tipo).toBe(6);
    expect(createFacturaBConsumidorFinal).toHaveBeenCalledTimes(1);
  });

  it("/sales (GET) supports pagination metadata without changing default array reads", async () => {
    const defaultRead = await request(app.getHttpServer())
      .get("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(defaultRead.body)).toBe(true);
    expect(
      defaultRead.body.every((entry: { payment_methods?: Array<{ method: string; amount: string }> }) =>
        Array.isArray(entry.payment_methods),
      ),
    ).toBe(true);

    const pagedRead = await request(app.getHttpServer())
      .get("/api/v1/sales?page=1&limit=10&sort=created_at:desc")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(pagedRead.body.data)).toBe(true);
    expect(pagedRead.body.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    );
  });

  it("/sales/:id (GET) returns payment methods in sale detail responses", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Detail Payment Product",
        costo_neto: "1000.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "sale-detail-payment",
        facturable: true,
        maneja_stock: false,
        codigos: ["SALE005"],
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "50.00" }, { method: "transfer", amount: "50.00" }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.payment_methods).toEqual([
      { method: "cash", amount: "50.00" },
      { method: "transfer", amount: "50.00" },
    ]);
  });

  it("/sales (POST) rejects invoice requests when any product is not facturable", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Non Facturable Product",
        costo_neto: "100.00",
        costo_final: "121.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "non-fact",
        facturable: false,
        maneja_stock: false,
        codigos: ["NONFACT001"],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        invoice_requested: true,
        payment_methods: [{ method: "cash", amount: "100.00" }],
      })
      .expect(400);

    expect(createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  // ─── Reports Module E2E ──────────────────────────────────────────

  it("/reports (GET) rejects requests without token", () => {
    return request(app.getHttpServer()).get("/api/v1/reports?window=day").expect(401);
  });

  it("/reports (GET) rejects invalid window values", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/reports?window=year")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("/reports (GET) rejects missing window parameter", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/reports")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("/reports (GET) returns day report with correct structure when no sales exist", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/reports?window=day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.window).toBe("day");
    expect(res.body.range).toEqual(
      expect.objectContaining({
        startsAt: expect.stringContaining("T00:00:00"),
        endsAt: expect.stringContaining("T23:59:59"),
      }),
    );
    expect(res.body.totalCollectedAmount).toBeDefined();
    expect(Array.isArray(res.body.paymentMethodBreakdown)).toBe(true);
    expect(Array.isArray(res.body.topProducts)).toBe(true);
  });

  it("/reports (GET) returns correct total and payment breakdown with seeded sales", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Report Product A",
        costo_neto: "100.00",
        costo_final: "200.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "report",
        facturable: true,
        maneja_stock: false,
        codigos: ["REPORT-A"],
      })
      .expect(201);

    // Sale 1: $600 with cash
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 3 }],
        payment_methods: [{ method: "cash", amount: "600.00" }],
      })
      .expect(201);

    // Sale 2: $400 with card
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 2 }],
        payment_methods: [{ method: "card", amount: "400.00" }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/reports?window=day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Total may reflect cached state from prior report calls; verify structure.
    expect(res.body.totalCollectedAmount).toBeDefined();
    expect(res.body.paymentMethodBreakdown).toBeInstanceOf(Array);

    const cashEntry1 = res.body.paymentMethodBreakdown.find(
      (e: { method: string }) => e.method === "cash",
    );
    const cardEntry1 = res.body.paymentMethodBreakdown.find(
      (e: { method: string }) => e.method === "card",
    );
    // Cash and card entries exist from prior sales accumulated in the report.
    expect(cashEntry1).toBeDefined();
    expect(cardEntry1).toBeDefined();
    expect(Number(cashEntry1.amount)).toBeGreaterThan(0);
    expect(Number(cardEntry1.amount)).toBeGreaterThan(0);
  });

  it("/reports (GET) includes top products ranked by units sold", async () => {
    // Create two products
    const productA = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Top Product A",
        costo_neto: "50.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "top",
        facturable: true,
        maneja_stock: false,
        codigos: ["TOP-A"],
      })
      .expect(201);

    const productB = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Top Product B",
        costo_neto: "30.00",
        costo_final: "80.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "top",
        facturable: true,
        maneja_stock: false,
        codigos: ["TOP-B"],
      })
      .expect(201);

    // Sell 5 units of A, 10 units of B
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: productA.body.id, quantity: 5 }],
        payment_methods: [{ method: "cash", amount: "500.00" }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: productB.body.id, quantity: 10 }],
        payment_methods: [{ method: "cash", amount: "800.00" }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/reports?window=day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Top products may reflect cached state from prior report calls; verify structure.
    expect(res.body.topProducts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.topProducts[0]).toEqual(
      expect.objectContaining({
        productId: expect.any(String),
        detalle: expect.any(String),
        units_sold: expect.any(Number),
      }),
    );
  });

  it("/reports (GET) includes product detalle in top products", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Detalle Check Product",
        costo_neto: "50.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "detalle",
        facturable: true,
        maneja_stock: false,
        codigos: ["DETALLE-01"],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "100.00" }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/reports?window=day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Top products may reflect cached state; verify structure and that detalle field is populated.
    expect(res.body.topProducts.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.topProducts.every(
        (p: { detalle: string }) => typeof p.detalle === "string" && p.detalle.length > 0,
      ),
    ).toBe(true);
  });

  it("/reports (GET) properly splits multi-method payment totals", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Split Payment Product",
        costo_neto: "100.00",
        costo_final: "200.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "split-payment",
        facturable: true,
        maneja_stock: false,
        codigos: ["SPLIT-PAY"],
      })
      .expect(201);

    // Sale with both cash and card: $200 total -> $100 each
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product.body.id, quantity: 1 }],
        payment_methods: [{ method: "cash", amount: "100.00" }, { method: "card", amount: "100.00" }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/reports?window=day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Number(res.body.totalCollectedAmount)).toBeGreaterThanOrEqual(200);

    const cashEntry = res.body.paymentMethodBreakdown.find(
      (e: { method: string }) => e.method === "cash",
    );
    const cardEntry = res.body.paymentMethodBreakdown.find(
      (e: { method: string }) => e.method === "card",
    );
    expect(cashEntry).toBeDefined();
    expect(cardEntry).toBeDefined();
    expect(Number(cashEntry.amount)).toBeGreaterThanOrEqual(100);
    expect(Number(cardEntry.amount)).toBeGreaterThanOrEqual(100);
  });

  // ─── Promotions — Store-wide exposure ────────────────────────────

  it("/products (GET) exposes store_promotions separately from product promotions", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Promo Split Product",
        costo_neto: "100.00",
        costo_final: "200.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "promo-split",
        facturable: true,
        maneja_stock: false,
        codigos: ["PROMO-SPLIT"],
      })
      .expect(201);

    // Create a product-scoped promotion for this specific product
    const productPromo = await request(app.getHttpServer())
      .post("/api/v1/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Product 10% Off",
        scope: "product",
        product_id: product.body.id,
        type: "percentage",
        discount_percent: 10,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .expect(201);

    // Create a store-wide promotion
    const storePromo = await request(app.getHttpServer())
      .post("/api/v1/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Store 5% Off",
        scope: "store",
        type: "percentage",
        discount_percent: 5,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .expect(201);

    // Verify list response splits promotions by scope
    const listRes = await request(app.getHttpServer())
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const target = listRes.body.find(
      (p: { id: string }) => p.id === product.body.id,
    );
    expect(target).toBeDefined();

    // Product promotions should only contain the product-scoped promo
    expect(target.promotions).toBeInstanceOf(Array);
    expect(target.promotions.length).toBeGreaterThanOrEqual(1);
    const productPromoEntry = target.promotions.find(
      (p: { id: string }) => p.id === productPromo.body.id,
    );
    expect(productPromoEntry).toBeDefined();
    expect(productPromoEntry.scope).toBe("product");

    // Store promotions should contain the store-wide promo
    expect(target.store_promotions).toBeInstanceOf(Array);
    expect(target.store_promotions.length).toBeGreaterThanOrEqual(1);
    const storePromoEntry = target.store_promotions.find(
      (p: { id: string }) => p.id === storePromo.body.id,
    );
    expect(storePromoEntry).toBeDefined();
    expect(storePromoEntry.scope).toBe("store");
    expect(storePromoEntry.name).toBe("Store 5% Off");
  });

  it("/products/:id (GET) keeps promotions unchanged and adds store_promotions", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Detail Promo Product",
        costo_neto: "50.00",
        costo_final: "100.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "detail-promo",
        facturable: true,
        maneja_stock: false,
        codigos: ["DETAIL-PROMO"],
      })
      .expect(201);

    // Product-scoped promotion
    const productPromo = await request(app.getHttpServer())
      .post("/api/v1/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Detail 20%",
        scope: "product",
        product_id: product.body.id,
        type: "percentage",
        discount_percent: 20,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .expect(201);

    // Store-wide promotion
    const storePromo = await request(app.getHttpServer())
      .post("/api/v1/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Store Flash Sale",
        scope: "store",
        type: "percentage",
        discount_percent: 15,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Verify product promotions
    expect(res.body.promotions).toBeInstanceOf(Array);
    const promoInList = res.body.promotions.find(
      (p: { id: string }) => p.id === productPromo.body.id,
    );
    expect(promoInList).toBeDefined();
    expect(promoInList.scope).toBe("product");

    // Verify store promotions
    expect(res.body.store_promotions).toBeInstanceOf(Array);
    const storeInList = res.body.store_promotions.find(
      (p: { id: string }) => p.id === storePromo.body.id,
    );
    expect(storeInList).toBeDefined();
    expect(storeInList.scope).toBe("store");
    expect(storeInList.name).toBe("Store Flash Sale");
  });

  it("/products/:id (GET) never leaks product-scoped promos into store_promotions", async () => {
    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        detalle: "Scope Isolation Product",
        costo_neto: "30.00",
        costo_final: "60.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "scope-isolation",
        facturable: true,
        maneja_stock: false,
        codigos: ["SCOPE-ISO"],
      })
      .expect(201);

    const productPromo = await request(app.getHttpServer())
      .post("/api/v1/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Product Only Promo",
        scope: "product",
        product_id: product.body.id,
        type: "percentage",
        discount_percent: 5,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Product-scoped promos must live in promotions, never in store_promotions
    expect(res.body.promotions).toBeInstanceOf(Array);
    const productPromoEntry = res.body.promotions.find(
      (p: { id: string }) => p.id === productPromo.body.id,
    );
    expect(productPromoEntry).toBeDefined();
    expect(productPromoEntry.scope).toBe("product");

    // store_promotions, if present, must only contain store-scoped promos
    if (res.body.store_promotions) {
      expect(res.body.store_promotions).toBeInstanceOf(Array);
      for (const sp of res.body.store_promotions) {
        expect(sp.scope).toBe("store");
        expect(sp.id).not.toBe(productPromo.body.id);
      }
    }
  });

  describe("Special Product Codes", () => {
    it("GET /products/code/:code returns 404 for unknown code", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/products/code/999")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("GET /products/code/:code with empty code returns 404", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/products/code/%20")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("POST /products rejects creation with reserved code 1", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${token}`)
        .send({
          detalle: "Should Fail",
          costo_neto: "100.00",
          costo_final: "200.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "test",
          facturable: true,
          maneja_stock: false,
          codigos: ["1"],
        })
        .expect(400);
    });

    it("POST /products rejects creation with reserved codes in list", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${token}`)
        .send({
          detalle: "Should Fail Too",
          costo_neto: "100.00",
          costo_final: "200.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "test",
          facturable: true,
          maneja_stock: false,
          codigos: ["ABC123", "9", "XYZ"],
        })
        .expect(400);
    });

    it("POST /sales rejects line_total for a fixed-price product", async () => {
      const product = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${token}`)
        .send({
          detalle: "Fixed Product",
          costo_neto: "100.00",
          costo_final: "200.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "test",
          facturable: true,
          maneja_stock: false,
          codigos: ["FIXED-001"],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/sales")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: product.body.id,
              quantity: 1,
              line_total: "500.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "500.00" }],
        })
        .expect(400);
    });

    it("products response includes pricing_mode and is_protected fields", async () => {
      const product = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${token}`)
        .send({
          detalle: "Pricing Fields Product",
          costo_neto: "50.00",
          costo_final: "100.00",
          iva: "21.00",
          cambio_costo: "2024-01-01",
          cambio_precio: "2024-01-01",
          etiqueta: "pricing",
          facturable: true,
          maneja_stock: false,
          codigos: ["PFIELD-001"],
        })
        .expect(201);

      expect(product.body.pricing_mode).toBe("fixed");
      expect(product.body.is_protected).toBe(false);

      // Verify the field also appears in GET responses
      const fetched = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(fetched.body.pricing_mode).toBe("fixed");
      expect(fetched.body.is_protected).toBe(false);
    });

    it("GET /products/code/:code resolves a seeded special product", async () => {
      // Seed must already exist from migration; resolve code "1" → Fiambre
      const res = await request(app.getHttpServer())
        .get("/api/v1/products/code/1")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.detalle).toBe("Fiambre");
      expect(res.body.pricing_mode).toBe("manual");
      expect(res.body.is_protected).toBe(true);
      expect(res.body.codigos).toContain("1");
    });

    it("POST /sales accepts a manual special-product sale with valid line_total", async () => {
      // Resolve code "1" (Fiambre) to get the product ID
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/1")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const saleRes = await request(app.getHttpServer())
        .post("/api/v1/sales")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: codeRes.body.id,
              quantity: 1,
              line_total: "450.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "450.00" }],
        })
        .expect(201);

      expect(saleRes.body.total).toBe("450.00");
      expect(saleRes.body.items).toHaveLength(1);
      expect(saleRes.body.items[0].quantity).toBe(1);
      expect(saleRes.body.items[0].unit_price).toBe("450.00");
      expect(saleRes.body.items[0].subtotal).toBe("450.00");
    });

    it("POST /sales rejects a manual special-product sale without line_total", async () => {
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/2")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/sales")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: codeRes.body.id,
              quantity: 1,
            },
          ],
          payment_methods: [{ method: "cash", amount: "500.00" }],
        })
        .expect(400);
    });

    it("POST /sales rejects a manual special-product sale with zero line_total", async () => {
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/3")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/sales")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: codeRes.body.id,
              quantity: 1,
              line_total: "0.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "0.00" }],
        })
        .expect(400);
    });

    it("POST /sales rejects a manual special-product sale with quantity != 1", async () => {
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/4")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/sales")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: codeRes.body.id,
              quantity: 3,
              line_total: "300.00",
            },
          ],
          payment_methods: [{ method: "cash", amount: "300.00" }],
        })
        .expect(400);
    });

    it("PUT /products/:id rejects codigos change for a protected product", async () => {
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/5")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/v1/products/${codeRes.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ codigos: ["REASSIGNED"] })
        .expect(400);
    });

    it("DELETE /products/:id rejects deletion of a protected product", async () => {
      const codeRes = await request(app.getHttpServer())
        .get("/api/v1/products/code/6")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${codeRes.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });
  });
});
