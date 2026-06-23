import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
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
      .send({ items: [{ product_id: product.body.id, quantity: 3 }] })
      .expect(201);

    expect(res.body.total).toBe("300.00");
    expect(res.body.items[0].subtotal).toBe("300.00");
    expect(res.body.items[0].unit_price).toBe("100.00");
    expect(res.body.invoice_status).toBe("none");
    expect(createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("/sales (POST) rejects unknown products", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { product_id: "00000000-0000-0000-0000-000000000000", quantity: 1 },
        ],
      })
      .expect(404);
  });

  it("/sales (POST) rejects empty items", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [] })
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
      })
      .expect(400);

    expect(createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });
});
