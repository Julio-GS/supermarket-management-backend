import { ProductCreatePayloadCanonicalizer } from "./product-create-payload-canonicalizer";

describe("ProductCreatePayloadCanonicalizer", () => {
  const canonicalizer = new ProductCreatePayloadCanonicalizer();

  const baseInput = {
    detalle: "Yerba Mate",
    costo_neto: "1000.00",
    costo_final: "1500.00",
    iva: "210.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-15",
    etiqueta: "Almac\u00e9n",
    facturable: true,
    maneja_stock: true,
    codigos: ["779000100", "779000101"],
    pricing_mode: "fixed" as const,
    is_protected: false,
  };

  it("produces version 1 in the canonical output", () => {
    const result = canonicalizer.canonicalize(baseInput);
    expect(result.version).toBe(1);
    expect(result.hash).toHaveLength(64);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same input produces the same hash regardless of object property order", () => {
    const inputA = {
      detalle: "Yerba Mate",
      costo_neto: "1000.00",
      costo_final: "1500.00",
      iva: "210.00",
      cambio_costo: "2024-01-01",
      cambio_precio: "2024-01-15",
      etiqueta: "Almac\u00e9n",
      facturable: true,
      maneja_stock: true,
      codigos: ["779000100", "779000101"],
      pricing_mode: "fixed" as const,
      is_protected: false,
    };

    const inputB = {
      is_protected: false,
      etiqueta: "Almac\u00e9n",
      cambio_precio: "2024-01-15",
      facturable: true,
      iva: "210.00",
      maneja_stock: true,
      costo_final: "1500.00",
      codigos: ["779000100", "779000101"],
      detalle: "Yerba Mate",
      costo_neto: "1000.00",
      cambio_costo: "2024-01-01",
      pricing_mode: "fixed" as const,
    };

    const resultA = canonicalizer.canonicalize(inputA);
    const resultB = canonicalizer.canonicalize(inputB);
    expect(resultA.hash).toBe(resultB.hash);
  });

  it("different detalle produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, detalle: "Yerba Mate" });
    const b = canonicalizer.canonicalize({ ...baseInput, detalle: "Caf\u00e9" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different costo_final produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "2000.00" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("normalizes null costo_neto vs omitted costo_neto to the same hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_neto: null as any });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_neto: undefined as any });
    expect(a.hash).toBe(b.hash);
  });

  it("normalizes null costo_final vs omitted costo_final to the same hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: null as any });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: undefined as any });
    expect(a.hash).toBe(b.hash);
  });

  it("normalizes null iva vs omitted iva to the same hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, iva: null as any });
    const b = canonicalizer.canonicalize({ ...baseInput, iva: undefined as any });
    expect(a.hash).toBe(b.hash);
  });

  // RED tests for money normalization (Finding 3)
  it("normalizes semantically equivalent money values: '1500' === '1500.00'", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500" });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    expect(a.hash).toBe(b.hash);
  });

  it("normalizes semantically equivalent money values: '1500.0' === '1500.00'", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.0" });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    expect(a.hash).toBe(b.hash);
  });

  it("normalizes semantically equivalent money across all money fields", () => {
    const a = canonicalizer.canonicalize({
      ...baseInput,
      costo_neto: "1000",
      costo_final: "1500",
      iva: "210",
    });
    const b = canonicalizer.canonicalize({
      ...baseInput,
      costo_neto: "1000.00",
      costo_final: "1500.00",
      iva: "210.00",
    });
    expect(a.hash).toBe(b.hash);
  });

  it("money normalization preserves meaningful value differences", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "2000.00" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("money normalization preserves null vs non-null distinction", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: null as any });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("money normalization preserves cents differences", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.00" });
    const b = canonicalizer.canonicalize({ ...baseInput, costo_final: "1500.50" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("barcode order changes the hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, codigos: ["779000100", "779000101"] });
    const b = canonicalizer.canonicalize({ ...baseInput, codigos: ["779000101", "779000100"] });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different facturable flag produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, facturable: true });
    const b = canonicalizer.canonicalize({ ...baseInput, facturable: false });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different maneja_stock flag produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, maneja_stock: true });
    const b = canonicalizer.canonicalize({ ...baseInput, maneja_stock: false });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different pricing_mode produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, pricing_mode: "fixed" });
    const b = canonicalizer.canonicalize({ ...baseInput, pricing_mode: "manual" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different is_protected produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, is_protected: false });
    const b = canonicalizer.canonicalize({ ...baseInput, is_protected: true });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different cambio_costo produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, cambio_costo: "2024-01-01" });
    const b = canonicalizer.canonicalize({ ...baseInput, cambio_costo: "2024-06-01" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different cambio_precio produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, cambio_precio: "2024-01-15" });
    const b = canonicalizer.canonicalize({ ...baseInput, cambio_precio: "2024-02-01" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("different etiqueta produces different hash", () => {
    const a = canonicalizer.canonicalize({ ...baseInput, etiqueta: "Almac\u00e9n" });
    const b = canonicalizer.canonicalize({ ...baseInput, etiqueta: "L\u00e1cteos" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("hash is deterministic across calls", () => {
    const r1 = canonicalizer.canonicalize(baseInput);
    const r2 = canonicalizer.canonicalize(baseInput);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.version).toBe(r2.version);
  });

  it("includes all canonical fields in the hash", () => {
    const result = canonicalizer.canonicalize(baseInput);
    expect(result.version).toBe(1);
    expect(result.hash).toHaveLength(64);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("full input with only required fields (null costos, minimum codigos)", () => {
    const minimal = {
      detalle: "Pan",
      cambio_costo: "2024-01-01",
      cambio_precio: "2024-01-01",
      etiqueta: "Panader\u00eda",
      facturable: true,
      maneja_stock: false,
      codigos: ["PAN001"],
    };
    const result = canonicalizer.canonicalize(minimal);
    expect(result.version).toBe(1);
    expect(result.hash).toHaveLength(64);
  });
});
