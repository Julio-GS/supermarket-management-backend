import { QueryRunner } from "typeorm";
import { AddSpecialProductCodes1802000000000 } from "./1802000000000-AddSpecialProductCodes";

describe("AddSpecialProductCodes1802000000000", () => {
  it("adds pricing_mode, is_protected, makes costs/iva nullable, and seeds 9 special products with barcodes on up", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddSpecialProductCodes1802000000000();

    await migration.up(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    // Should have at least: uuid-ossp extension, alter table, 9 product INSERTs, 9 barcode INSERTs
    expect(sqlStatements.length).toBeGreaterThanOrEqual(1 + 1 + 9 + 9);

    // First statement: enable uuid-ossp extension
    const extensionSQL = sqlStatements[0];
    expect(extensionSQL).toContain(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Second statement: alter products table
    const alterSQL = sqlStatements[1];
    expect(alterSQL).toContain("ALTER TABLE products");
    expect(alterSQL).toContain("pricing_mode");
    expect(alterSQL).toContain("'fixed'");
    expect(alterSQL).toContain("is_protected");
    expect(alterSQL).toContain("ALTER COLUMN costo_neto");
    expect(alterSQL).toContain("DROP NOT NULL");
    expect(alterSQL).toContain("ALTER COLUMN costo_final");
    expect(alterSQL).toContain("DROP NOT NULL");
    expect(alterSQL).toContain("ALTER COLUMN iva");
    expect(alterSQL).toContain("DROP NOT NULL");

    // Check each product INSERT contains the expected name and pricing_mode 'manual'
    const productInserts = sqlStatements.filter(
      (s) =>
        s.includes("INSERT INTO products") &&
        s.includes("pricing_mode"),
    );
    expect(productInserts).toHaveLength(9);

    const expectedNames = [
      "Fiambre", "Pan", "Kiosco", "Perfumeria", "Carne",
      "Verdura", "Huevos", "Limpieza", "Bolsas",
    ];
    for (const name of expectedNames) {
      const found = productInserts.some((s) => s.includes(`'${name}'`));
      expect(found).toBe(true);
    }

    // Each product INSERT must include pricing_mode='manual', is_protected=true
    for (const sql of productInserts) {
      expect(sql).toContain("'manual'");
      expect(sql).toContain("true");
      expect(sql).toContain("NULL"); // at least for costo_neto
    }

    // Check barcode inserts reference codes 1-9
    const barcodeInserts = sqlStatements.filter((s) =>
      s.includes("INSERT INTO product_barcodes"),
    );
    expect(barcodeInserts).toHaveLength(9);

    // Each barcode INSERT references one of codes 1-9
    for (let i = 1; i <= 9; i++) {
      const code = String(i);
      const found = barcodeInserts.some(
        (s) => s.includes(`'${code}'`) || s.includes(`\${code}`),
      );
      expect(found).toBe(true);
    }
  });

  it("drops columns and seeded rows on down (reversible)", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddSpecialProductCodes1802000000000();

    await migration.down(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    // Should contain a delete for seeded barcodes, seeded products, and alter to drop columns
    expect(sqlStatements.length).toBeGreaterThanOrEqual(2);

    // Should delete barcodes for codes 1-9
    const deleteBarcodeSQL = sqlStatements.find((s) =>
      s.includes("DELETE FROM product_barcodes"),
    );
    expect(deleteBarcodeSQL).toBeDefined();
    if (deleteBarcodeSQL) {
      expect(deleteBarcodeSQL).toContain("codigo");
      expect(deleteBarcodeSQL).toContain("1");
      expect(deleteBarcodeSQL).toContain("9");
    }

    // Should delete seeded products
    const deleteProductSQL = sqlStatements.find((s) =>
      s.includes("DELETE FROM products"),
    );
    expect(deleteProductSQL).toBeDefined();
    if (deleteProductSQL) {
      expect(deleteProductSQL).toContain("is_protected = true");
      expect(deleteProductSQL).toContain("pricing_mode = 'manual'");
    }

    // Should drop pricing_mode and is_protected columns and restore NOT NULL
    const alterSQL = sqlStatements.find(
      (s) => s.includes("ALTER TABLE products") && s.includes("DROP COLUMN"),
    );
    expect(alterSQL).toBeDefined();
    if (alterSQL) {
      expect(alterSQL).toContain("pricing_mode");
      expect(alterSQL).toContain("is_protected");
      expect(alterSQL).toContain("SET NOT NULL");
    }
  });

  it("rollback delete of seeded products would fail if sale_items reference them (FK protection)", async () => {
    // The product_barcodes table has ON DELETE CASCADE from products,
    // but sale_items has a foreign key to products without CASCADE.
    // Therefore, if any sale_items reference a seeded special product,
    // the rollback's DELETE FROM products will fail with a FK violation.
    // This test confirms the down() SQL does NOT include CASCADE or
    // TRUNCATE — it produces plain DELETEs that PostgreSQL would reject
    // when referenced rows exist.
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddSpecialProductCodes1802000000000();

    await migration.down(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    const deleteProductSQL = sqlStatements.find((s) =>
      s.includes("DELETE FROM products"),
    );
    expect(deleteProductSQL).toBeDefined();
    // Must NOT cascade — plain DELETE protects referential integrity
    expect(deleteProductSQL).not.toContain("CASCADE");
    expect(deleteProductSQL).not.toContain("TRUNCATE");
    // The WHERE clause targets only seeded protected products
    expect(deleteProductSQL).toContain("is_protected = true");
  });
});
