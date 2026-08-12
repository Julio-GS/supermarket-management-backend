import { Test, TestingModule } from "@nestjs/testing";
import { CreateProductUseCase } from "./create-product.use-case";
import { ProductRepositoryPort } from "./product.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { ProductCreateIdempotencyRepositoryPort } from "./product-create-idempotency.repository.port";
import { ProductCreatePayloadCanonicalizer } from "./product-create-payload-canonicalizer";
import { PrintJobRepositoryPort } from "../../label-printer/application/print-job.repository.port";
import { ConflictError, ValidationError } from "../../../shared/errors/domain.error";
import { Product } from "../domain/product.entity";
import { PrintJob } from "../../label-printer/domain/print-job.entity";

function buildProduct(overrides: Partial<Product> = {}): Product {
  const p = new Product();
  p.id = "prod-1";
  p.detalle = "Test Product";
  p.costo_neto = "100.00";
  p.costo_final = "200.00";
  p.iva = "21.00";
  p.cambio_costo = "2024-01-01";
  p.cambio_precio = "2024-01-01";
  p.etiqueta = "test";
  p.facturable = true;
  p.maneja_stock = false;
  p.codigos = ["TEST001"];
  p.pricing_mode = "fixed";
  p.is_protected = false;
  p.created_at = new Date("2026-07-01T00:00:00Z");
  p.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(p, overrides);
}

function buildPrintJob(overrides: Partial<PrintJob> = {}): PrintJob {
  const job = new PrintJob();
  job.id = "job-1";
  job.product_id = "prod-1";
  job.sku = "TEST001";
  job.product_name = "Test Product";
  job.sale_price = "200.00";
  job.status = "pending";
  job.source = "auto";
  job.created_at = new Date("2026-07-01T00:00:00Z");
  job.updated_at = new Date("2026-07-01T00:00:00Z");
  return Object.assign(job, overrides);
}

describe("CreateProductUseCase (idempotent)", () => {
  let useCase: CreateProductUseCase;
  let products: jest.Mocked<ProductRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let inventory: jest.Mocked<Pick<InventoryRepositoryPort, "createBalance">>;
  let idempotencyRepo: jest.Mocked<ProductCreateIdempotencyRepositoryPort>;
  let printJobRepo: jest.Mocked<Pick<PrintJobRepositoryPort, "create">>;
  let canonicalizer: ProductCreatePayloadCanonicalizer;
  let transactionRunnerRun: jest.Mock;

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
    } as any;
    cache = { getOrSet: jest.fn(), deleteByPrefix: jest.fn() };
    inventory = { createBalance: jest.fn() };
    idempotencyRepo = { findByKey: jest.fn(), create: jest.fn() } as any;
    printJobRepo = { create: jest.fn() } as any;
    canonicalizer = new ProductCreatePayloadCanonicalizer();

    transactionRunnerRun = jest.fn();
    const transactionRunner = { run: transactionRunnerRun };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateProductUseCase,
        { provide: ProductRepositoryPort, useValue: products },
        { provide: ReadCachePort, useValue: cache },
        { provide: InventoryRepositoryPort, useValue: inventory },
        { provide: TransactionRunnerPort, useValue: transactionRunner },
        { provide: ProductCreateIdempotencyRepositoryPort, useValue: idempotencyRepo },
        { provide: PrintJobRepositoryPort, useValue: printJobRepo },
        { provide: ProductCreatePayloadCanonicalizer, useValue: canonicalizer },
      ],
    }).compile();

    useCase = module.get(CreateProductUseCase);
    // Default: transaction passes work through
    transactionRunnerRun.mockImplementation((work: Function) => work({ query: jest.fn() }));
  });

  const baseInput = {
    detalle: "Yerba Mate",
    costo_neto: "100.00",
    costo_final: "200.00",
    iva: "21.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-01",
    etiqueta: "Almacén",
    facturable: true,
    maneja_stock: false,
    codigos: ["779000100"],
  };

  // ── Idempotency key validation ──────────────────────────────────────

  it("rejects empty idempotency key", async () => {
    await expect(
      useCase.execute(baseInput, ""),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.create).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only idempotency key", async () => {
    await expect(
      useCase.execute(baseInput, "   "),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.create).not.toHaveBeenCalled();
  });

  // ── Reserved code rejection preserved ───────────────────────────────

  it("rejects reserved codes before checking idempotency", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    await expect(
      useCase.execute({ ...baseInput, codigos: ["1"] }, "key-123"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.create).not.toHaveBeenCalled();
    expect(idempotencyRepo.findByKey).not.toHaveBeenCalled();
  });

  // ── Replay: same key + same payload ─────────────────────────────────

  it("replays stored response when same key and same payload hash", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    const storedResponse = {
      id: "prod-existing",
      detalle: "Yerba Mate",
      label_status: "pending",
      label_job: { id: "job-existing", quantity: 1 },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-abc",
      payload_version: 1,
      payload_hash: canonicalizer.canonicalize(baseInput).hash,
      product_id: "prod-existing",
      label_job_id: "job-existing",
      response_status: 201,
      response_body: storedResponse,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await useCase.execute(baseInput, "key-abc");

    expect(result).toBe(storedResponse);
    expect(products.create).not.toHaveBeenCalled();
    expect(printJobRepo.create).not.toHaveBeenCalled();
    expect(idempotencyRepo.create).not.toHaveBeenCalled();
    // Cache invalidation still runs on replay
    expect(cache.deleteByPrefix).toHaveBeenCalled();
  });

  it("replay does not invoke transaction runner for side-effect work", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    const storedResponse = { id: "prod-old", label_status: "not_required", label_job: null };

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-xyz",
      payload_version: 1,
      payload_hash: canonicalizer.canonicalize(baseInput).hash,
      product_id: "prod-old",
      label_job_id: null,
      response_status: 201,
      response_body: storedResponse,
      created_at: new Date(),
      updated_at: new Date(),
    });

    transactionRunnerRun.mockClear();
    await useCase.execute(baseInput, "key-xyz");

    // transactionRunner.run should be called (it wraps the logic),
    // but inside it only reads the idempotency record, no create/insert.
    // The key point: no product, job, or idempotency row is re-created.
    expect(products.create).not.toHaveBeenCalled();
    expect(printJobRepo.create).not.toHaveBeenCalled();
    expect(idempotencyRepo.create).not.toHaveBeenCalled();
  });

  // ── Replay after deletion ───────────────────────────────────────────

  it("replays stored response when product_id and label_job_id are null (post-deletion replay)", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    const storedResponse = {
      id: "prod-deleted",
      detalle: "Deleted Product",
      label_status: "pending",
      label_job: { id: "old-job", quantity: 1 },
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
    };

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-del",
      payload_version: 1,
      payload_hash: canonicalizer.canonicalize(baseInput).hash,
      product_id: null,
      label_job_id: null,
      response_status: 201,
      response_body: storedResponse,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await useCase.execute(baseInput, "key-del");
    expect(result).toBe(storedResponse);
    expect(products.create).not.toHaveBeenCalled();
  });

  // ── Conflict: same key + different payload ──────────────────────────

  it("throws conflict when same key but different payload hash", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);

    // Compute hash for a DIFFERENT payload
    const differentInput = { ...baseInput, costo_final: "999.00" };
    const differentHash = canonicalizer.canonicalize(differentInput).hash;

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-conflict",
      payload_version: 1,
      payload_hash: differentHash,
      product_id: "prod-other",
      label_job_id: null,
      response_status: 201,
      response_body: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      useCase.execute(baseInput, "key-conflict"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(products.create).not.toHaveBeenCalled();
  });

  it("conflict when same key but different hash (version mismatch)", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-v2",
      payload_version: 2, // different version
      payload_hash: canonicalizer.canonicalize(baseInput).hash,
      product_id: "prod-1",
      label_job_id: null,
      response_status: 201,
      response_body: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      useCase.execute(baseInput, "key-v2"),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // ── First creation: non-null costo_final ────────────────────────────

  it("atomic creation with label job when costo_final is non-null", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-new", costo_final: "200.00", codigos: ["779000100"] });
    const printJob = buildPrintJob({ id: "job-new", product_id: "prod-new", sku: "779000100" });

    products.create.mockResolvedValue(product);
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockResolvedValue({} as any);

    const result = await useCase.execute(baseInput, "key-new");

    expect(result).toHaveProperty("id", "prod-new");
    expect(result).toHaveProperty("label_status", "pending");
    expect(result).toHaveProperty("label_job");
    expect((result as any).label_job.id).toBe("job-new");
    expect((result as any).label_job.quantity).toBe(1);
    expect((result as any).label_job.sku).toBe("779000100");

    // Cache invalidated only after successful transaction
    expect(cache.deleteByPrefix).toHaveBeenCalled();
  });

  it("includes all product fields in the response for non-null costo_final", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({
      id: "prod-full",
      costo_final: "300.00",
      codigos: ["FULL001"],
      maneja_stock: true,
    });
    products.create.mockResolvedValue(product);
    const printJob = buildPrintJob({ id: "job-full", product_id: "prod-full", sale_price: "300.00", sku: "FULL001" });
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockResolvedValue({} as any);

    const result: any = await useCase.execute(
      { ...baseInput, costo_final: "300.00", maneja_stock: true, codigos: ["FULL001"] },
      "key-full",
    );

    expect(result.id).toBe("prod-full");
    expect(result.detalle).toBe("Test Product");
    expect(result.costo_final).toBe("300.00");
    expect(result.maneja_stock).toBe(true);
    expect(result.codigos).toEqual(["FULL001"]);
    expect(result.label_status).toBe("pending");
    expect(result.label_job.quantity).toBe(1);
    expect(result.label_job.sku).toBe("FULL001");
  });

  // ── First creation: null costo_final ────────────────────────────────

  it("creates product without label job when costo_final is null", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-no-label", costo_final: null });
    products.create.mockResolvedValue(product);
    idempotencyRepo.create.mockResolvedValue({} as any);

    const nullInput = { ...baseInput, costo_final: null as any };
    const result = await useCase.execute(nullInput, "key-nolabel");

    expect(result).toHaveProperty("id", "prod-no-label");
    expect(result).toHaveProperty("label_status", "not_required");
    expect(result).toHaveProperty("label_job", null);
    expect(printJobRepo.create).not.toHaveBeenCalled();
  });

  // ── Transaction rollback on failure ─────────────────────────────────

  it("label job creation failure rolls back product creation", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct();
    products.create.mockResolvedValue(product);
    printJobRepo.create.mockRejectedValue(new Error("DB error"));

    transactionRunnerRun.mockImplementation(async (work: Function) => {
      try {
        await work({ query: jest.fn() });
      } catch {
        throw new Error("DB error");
      }
    });

    await expect(
      useCase.execute(baseInput, "key-fail"),
    ).rejects.toThrow("DB error");
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
    expect(idempotencyRepo.create).not.toHaveBeenCalled();
  });

  it("idempotency insert failure rolls back product and job", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct();
    const printJob = buildPrintJob();
    products.create.mockResolvedValue(product);
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockRejectedValue(new Error("unique violation"));

    transactionRunnerRun.mockImplementation(async (work: Function) => {
      try {
        await work({ query: jest.fn() });
      } catch {
        throw new Error("unique violation");
      }
    });

    await expect(
      useCase.execute(baseInput, "key-duperr"),
    ).rejects.toThrow("unique violation");
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });

  // ── Stock management ────────────────────────────────────────────────

  it("creates stock balance when maneja_stock is true", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-stock", maneja_stock: true });
    const printJob = buildPrintJob({ id: "job-stock", product_id: "prod-stock" });
    products.create.mockResolvedValue(product);
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockResolvedValue({} as any);

    await useCase.execute(
      { ...baseInput, maneja_stock: true },
      "key-stock",
    );

    expect(inventory.createBalance).toHaveBeenCalledWith("prod-stock", 0, expect.anything());
  });

  it("does not create stock balance when maneja_stock is false", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-nostock", maneja_stock: false });
    const printJob = buildPrintJob({ id: "job-nostock", product_id: "prod-nostock" });
    products.create.mockResolvedValue(product);
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockResolvedValue({} as any);

    await useCase.execute(
      { ...baseInput, maneja_stock: false },
      "key-nostock",
    );

    expect(inventory.createBalance).not.toHaveBeenCalled();
  });

  // ── Barcode duplicate check ─────────────────────────────────────────

  it("rejects duplicate barcode before creating", async () => {
    products.existsAnyBarcode.mockResolvedValue(true);

    await expect(
      useCase.execute(baseInput, "key-dup"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(products.create).not.toHaveBeenCalled();
  });

  // ── Idempotency row persistence ─────────────────────────────────────

  it("persists idempotency row with correct product_id and label_job_id", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-idem" });
    const printJob = buildPrintJob({ id: "job-idem", product_id: "prod-idem" });
    products.create.mockResolvedValue(product);
    printJobRepo.create.mockResolvedValue(printJob);
    idempotencyRepo.create.mockResolvedValue({} as any);

    await useCase.execute(baseInput, "key-idem");

    expect(idempotencyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "key-idem",
        productId: "prod-idem",
        labelJobId: "job-idem",
        payloadVersion: 1,
      }),
          expect.anything(),
    );
  });

  it("persists idempotency row with null label_job_id for null costo_final", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);
    idempotencyRepo.findByKey.mockResolvedValue(null);

    const product = buildProduct({ id: "prod-nulljob", costo_final: null });
    products.create.mockResolvedValue(product);
    idempotencyRepo.create.mockResolvedValue({} as any);

    await useCase.execute({ ...baseInput, costo_final: null as any }, "key-nulljob");

    expect(idempotencyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "key-nulljob",
        productId: "prod-nulljob",
        labelJobId: null,
      }),
          expect.anything(),
    );
  });

  // ── Replay: null-costo_final ────────────────────────────────────────

  it("replays null-costo_final creation correctly", async () => {
    products.existsAnyBarcode.mockResolvedValue(false);

    const nullInput = { ...baseInput, costo_final: null as any };
    const hash = canonicalizer.canonicalize(nullInput).hash;
    const storedResponse = {
      id: "prod-nojob",
      detalle: "Yerba Mate",
      label_status: "not_required",
      label_job: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    idempotencyRepo.findByKey.mockResolvedValue({
      id: "idem-1",
      idempotency_key: "key-nojob",
      payload_version: 1,
      payload_hash: hash,
      product_id: "prod-nojob",
      label_job_id: null,
      response_status: 201,
      response_body: storedResponse,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await useCase.execute(nullInput, "key-nojob");
    expect(result).toBe(storedResponse);
    expect(products.create).not.toHaveBeenCalled();
    expect(printJobRepo.create).not.toHaveBeenCalled();
  });

      // RED: Advisory lock (Finding 1)
      it("acquires pg_advisory_xact_lock for idempotency key", async () => {
        products.existsAnyBarcode.mockResolvedValue(false);
        idempotencyRepo.findByKey.mockResolvedValue(null);
        const product = buildProduct({ id: "p1", costo_final: "200.00" });
        const printJob = buildPrintJob({ id: "j1", product_id: "p1" });
        products.create.mockResolvedValue(product);
        printJobRepo.create.mockResolvedValue(printJob);
        idempotencyRepo.create.mockResolvedValue({} as any);
        const r = { query: jest.fn() };
        transactionRunnerRun.mockImplementation(async (w: Function) => w(r));
        await useCase.execute(baseInput, "key-lock");
        expect(r.query).toHaveBeenCalledWith(
          expect.stringContaining("pg_advisory_xact_lock"),
          expect.arrayContaining([expect.stringContaining("product_create:")]),
        );
      });

      // RED: Duplicate idempotency race (Finding 2)
      it("retries replay route when idempotency create hits unique violation", async () => {
        products.existsAnyBarcode.mockResolvedValue(false);
        idempotencyRepo.findByKey.mockResolvedValue(null);
        const product = buildProduct({ id: "prod-race" });
        const printJob = buildPrintJob({ id: "job-race", product_id: "prod-race" });
        products.create.mockResolvedValue(product);
        printJobRepo.create.mockResolvedValue(printJob);
        idempotencyRepo.create.mockRejectedValueOnce(
          Object.assign(new Error("dup"), { code: "23505" }),
        );
        const stored = { id: "pw", label_status: "pending", label_job: { id: "jw", quantity: 1 } };
        let second = false;
        transactionRunnerRun.mockImplementation(async (w: Function) => {
          if (!second) { second = true; try { await w({ query: jest.fn() }); } catch(e) { throw e; } }
          idempotencyRepo.findByKey.mockResolvedValue({
            id: "iw", idempotency_key: "key-race", payload_version: 1,
            payload_hash: canonicalizer.canonicalize(baseInput).hash,
            product_id: "pw", label_job_id: "jw", response_status: 201,
            response_body: stored, created_at: new Date(), updated_at: new Date(),
          });
          return w({ query: jest.fn() });
        });
        const result = await useCase.execute(baseInput, "key-race");
        expect(result).toBe(stored);
        expect(transactionRunnerRun).toHaveBeenCalledTimes(2);
      });

      it("throws conflict when race winner has different payload", async () => {
        products.existsAnyBarcode.mockResolvedValue(false);
        idempotencyRepo.findByKey.mockResolvedValue(null);
        products.create.mockResolvedValue(buildProduct({ id: "pr2" }));
            printJobRepo.create.mockResolvedValue(buildPrintJob({ id: "j2", product_id: "pr2" }));
        idempotencyRepo.create.mockRejectedValueOnce(
          Object.assign(new Error("dup"), { code: "23505" }),
        );
        let second = false;
        transactionRunnerRun.mockImplementation(async (w: Function) => {
          if (!second) { second = true; try { await w({ query: jest.fn() }); } catch(e) { throw e; } }
          const dh = canonicalizer.canonicalize({ ...baseInput, costo_final: "999.00" }).hash;
          idempotencyRepo.findByKey.mockResolvedValue({
            id: "id", idempotency_key: "key-race2", payload_version: 1,
            payload_hash: dh, product_id: "pd", label_job_id: null,
            response_status: 201, response_body: {},
            created_at: new Date(), updated_at: new Date(),
          });
          return w({ query: jest.fn() });
        });
        await expect(useCase.execute(baseInput, "key-race2")).rejects.toBeInstanceOf(ConflictError);
      });

      it("does not retry on non-unique-violation errors", async () => {
        products.existsAnyBarcode.mockResolvedValue(false);
        idempotencyRepo.findByKey.mockResolvedValue(null);
        products.create.mockResolvedValue(buildProduct({ id: "poe" }));
        idempotencyRepo.create.mockRejectedValueOnce(new Error("conn refused"));
        transactionRunnerRun.mockImplementation(async (w: Function) => {
          try { await w({ query: jest.fn() }); } catch { throw new Error("conn refused"); }
        });
        await expect(useCase.execute(baseInput, "key-ne")).rejects.toThrow("conn refused");
        expect(transactionRunnerRun).toHaveBeenCalledTimes(1);
      });

      // RED: Barcode check runner-bound (Finding 4)
      it("calls existsAnyBarcode with the transaction runner", async () => {
        idempotencyRepo.findByKey.mockResolvedValue(null);
        const product = buildProduct({ id: "pb", costo_final: "200.00" });
        const printJob = buildPrintJob({ id: "jb", product_id: "pb" });
        products.create.mockResolvedValue(product);
        printJobRepo.create.mockResolvedValue(printJob);
        idempotencyRepo.create.mockResolvedValue({} as any);
        products.existsAnyBarcode.mockResolvedValue(false);
        const r = { query: jest.fn() };
        transactionRunnerRun.mockImplementation(async (w: Function) => w(r));
        await useCase.execute(baseInput, "key-br");
        expect(products.existsAnyBarcode.mock.calls[0][2]).toBe(r);
    });

    });
