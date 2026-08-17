import * as path from "path";
import {
  analyzeMigrationFile,
  detectForbiddenProductUserDml,
  detectForbiddenSaleBackfill,
  FORBIDDEN_PRODUCTS_DML_MESSAGE,
  FORBIDDEN_SALE_BACKFILL_MESSAGE,
  FORBIDDEN_USERS_DML_MESSAGE,
  normalizeSql,
  readMigrationSourceFiles,
} from "./migration-safety.util";
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

describe("migration-safety harness", () => {
  describe("forbidden products/users DML", () => {
    it.each([
      ["INSERT INTO products", FORBIDDEN_PRODUCTS_DML_MESSAGE],
      ["UPDATE products", FORBIDDEN_PRODUCTS_DML_MESSAGE],
      ["DELETE FROM products", FORBIDDEN_PRODUCTS_DML_MESSAGE],
      ['INSERT INTO "products"', FORBIDDEN_PRODUCTS_DML_MESSAGE],
      ["INSERT INTO users", FORBIDDEN_USERS_DML_MESSAGE],
      ["UPDATE users", FORBIDDEN_USERS_DML_MESSAGE],
      ["DELETE FROM users", FORBIDDEN_USERS_DML_MESSAGE],
    ])("flags %s", (sql, expected) => {
      expect(detectForbiddenProductUserDml(sql)).toContain(expected);
    });
    it("does not flag DML against non-protected tables", () => {
      expect(
        detectForbiddenProductUserDml("INSERT INTO product_barcodes"),
      ).toEqual([]);
    });
  });
  describe("forbidden sale manual-discount backfill", () => {
    it.each([
      "UPDATE sales SET manual_discount_amount = 0 WHERE manual_discount_amount IS NULL",
      "UPDATE sales SET manual_discount_modality = NULL",
      "UPDATE sales SET manual_discount_percentage = 0",
    ])("flags %s", (sql) => {
      expect(detectForbiddenSaleBackfill(sql)).toEqual([
        FORBIDDEN_SALE_BACKFILL_MESSAGE,
      ]);
    });
    it("allows additive ADD COLUMN for manual discount fields", () => {
      expect(
        detectForbiddenSaleBackfill(
          "ALTER TABLE sales ADD COLUMN manual_discount_amount numeric(12,2)",
        ),
      ).toEqual([]);
    });
  });
  describe("normalizeSql", () => {
    it("strips comments so they never trigger forbidden DML", () => {
      const source =
        "// INSERT INTO products\n/* DELETE FROM users */\nALTER TABLE products ADD COLUMN x text;";
      expect(detectForbiddenProductUserDml(normalizeSql(source))).toEqual([]);
    });
    it("collapses whitespace so split statements are still detected", () => {
      const source = "UPDATE sales SET\nmanual_discount_amount = 0";
      expect(detectForbiddenSaleBackfill(normalizeSql(source))).toEqual([
        FORBIDDEN_SALE_BACKFILL_MESSAGE,
      ]);
    });
  });
  describe("analyzeMigrationFile", () => {
    it("flags a new migration with sale backfill", () => {
      const file = {
        fileName: "1814000000000-AddSaleManualDiscount.ts",
        source: "UPDATE sales SET manual_discount_amount = 0 WHERE id = 1",
      };
      expect(analyzeMigrationFile(file)).toContain(
        FORBIDDEN_SALE_BACKFILL_MESSAGE,
      );
    });
    it("only allowlists the pre-existing product seed migration", () => {
      const seed = {
        fileName: "1802000000000-AddSpecialProductCodes.ts",
        source:
          "INSERT INTO products (...) VALUES (...) ON CONFLICT DO NOTHING",
      };
      const fresh = {
        fileName: "1814000000000-AddSaleManualDiscount.ts",
        source: "INSERT INTO products (...) VALUES (...)",
      };
      expect(analyzeMigrationFile(seed)).not.toContain(
        FORBIDDEN_PRODUCTS_DML_MESSAGE,
      );
      expect(analyzeMigrationFile(fresh)).toContain(
        FORBIDDEN_PRODUCTS_DML_MESSAGE,
      );
    });
  });
  describe("real migrations directory", () => {
    it("excludes spec fixtures and finds no forbidden DML in any migration", () => {
      const files = readMigrationSourceFiles(MIGRATIONS_DIR);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.fileName).not.toMatch(/\.spec\.ts$/);
      }
      const violations = files.flatMap((file) =>
        analyzeMigrationFile(file).map(
          (message) => `${file.fileName}: ${message}`,
        ),
      );
      expect(violations).toEqual([]);
    });
  });

  describe("new sale manual discount migration", () => {
    it("is schema-only: nullable columns, no defaults, no backfill", () => {
      const files = readMigrationSourceFiles(MIGRATIONS_DIR);
      const migration = files.find(
        (f) => f.fileName === "1814000000000-AddSaleManualDiscount.ts",
      );
      expect(migration).toBeDefined();
      const sql = normalizeSql(migration!.source);
      expect(sql).toContain("manual_discount_amount");
      expect(sql).toContain("manual_discount_modality");
      expect(sql).toContain("manual_discount_percentage");
      expect(sql).not.toMatch(/DEFAULT\s+['"]?0/i);
      expect(analyzeMigrationFile(migration!)).toEqual([]);
    });
  });

  describe("new blocked-for-review migration", () => {
    it("is schema-only and uses timestamptz for blocked_at", () => {
      const files = readMigrationSourceFiles(MIGRATIONS_DIR);
      const migration = files.find(
        (f) => f.fileName === "1815000000000-AddBlockedForReviewToLabelPrintJobs.ts",
      );
      expect(migration).toBeDefined();
      const sql = normalizeSql(migration!.source);
      expect(sql).toContain("blocked_reason varchar(500)");
      expect(sql).toContain("blocked_by varchar(100)");
      expect(sql).toContain("blocked_at timestamptz");
      expect(analyzeMigrationFile(migration!)).toEqual([]);
    });
  });
});
