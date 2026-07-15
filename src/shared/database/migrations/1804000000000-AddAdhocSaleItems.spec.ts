import { AddAdhocSaleItems1804000000000 } from "./1804000000000-AddAdhocSaleItems";

function mockQueryRunner() {
  const queries: string[] = [];
  return {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      return Promise.resolve();
    }),
    getQueries: () => queries,
  };
}

describe("AddAdhocSaleItems1804000000000", () => {
  let migration: AddAdhocSaleItems1804000000000;

  beforeEach(() => {
    migration = new AddAdhocSaleItems1804000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe("AddAdhocSaleItems1804000000000");
  });

  describe("up", () => {
    it("drops the product_id FK, makes it nullable, and adds ad-hoc columns", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      // Drop FK dynamically
      expect(sql).toContain("ALTER TABLE sale_items DROP CONSTRAINT");
      // Make product_id nullable
      expect(sql).toContain("ALTER COLUMN product_id DROP NOT NULL");
      // Add ad-hoc columns
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS name varchar(255)");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS description text");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS iva numeric(5,2)");
    });

    it("runs the FK drop before the NOT NULL change", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const queries = runner.getQueries();
      const fkIdx = queries.findIndex((q) => q.includes("DROP CONSTRAINT"));
      const notNullIdx = queries.findIndex((q) => q.includes("DROP NOT NULL"));
      expect(fkIdx).toBeLessThan(notNullIdx);
    });
  });

  describe("down", () => {
    it("drops ad-hoc columns, restores NOT NULL, and recreates the FK", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("DROP COLUMN IF EXISTS name");
      expect(sql).toContain("DROP COLUMN IF EXISTS description");
      expect(sql).toContain("DROP COLUMN IF EXISTS iva");
      expect(sql).toContain("ALTER COLUMN product_id SET NOT NULL");
      expect(sql).toContain("ADD CONSTRAINT sale_items_product_id_fkey");
      expect(sql).toContain("FOREIGN KEY (product_id) REFERENCES products(id)");
    });

    it("removes columns before restoring constraints", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const queries = runner.getQueries();
      const dropColIdx = queries.findIndex((q) => q.includes("DROP COLUMN"));
      const fkIdx = queries.findIndex((q) => q.includes("FOREIGN KEY"));
      expect(dropColIdx).toBeLessThan(fkIdx);
    });
  });
});
