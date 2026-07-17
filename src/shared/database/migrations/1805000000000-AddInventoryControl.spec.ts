import { AddInventoryControl1805000000000 } from "./1805000000000-AddInventoryControl";

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

describe("AddInventoryControl1805000000000", () => {
  let migration: AddInventoryControl1805000000000;

  beforeEach(() => {
    migration = new AddInventoryControl1805000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe("AddInventoryControl1805000000000");
  });

  describe("up", () => {
    it("creates inventory_balances and stock_movements tables", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS inventory_balances");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS stock_movements");
    });

    it("backfills only products with maneja_stock=true", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      // Balance backfill filtered by maneja_stock
      expect(sql).toContain("WHERE maneja_stock = true");
      // Initialization movements also filtered
      const whereMatches = (sql.match(/WHERE maneja_stock = true/g) ?? []);
      expect(whereMatches.length).toBe(2);
    });

    it("inserts initialization movements with correct stock values", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("'initialization'");
      expect(sql).toContain("0, 2000");
      expect(sql).toContain("Migration backfill: initial stock");
    });

    it("creates the product_id index on stock_movements", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idx_stock_movements_product_id");
    });

    it("creates tables before inserting data", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const queries = runner.getQueries();
      const createIdx = queries.findIndex((q) => q.includes("CREATE TABLE"));
      const insertIdx = queries.findIndex((q) => q.includes("INSERT INTO"));
      expect(createIdx).toBeLessThan(insertIdx);
    });
  });

  describe("down", () => {
    it("drops the index and both inventory tables", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("DROP INDEX IF EXISTS idx_stock_movements_product_id");
      expect(sql).toContain("DROP TABLE IF EXISTS stock_movements");
      expect(sql).toContain("DROP TABLE IF EXISTS inventory_balances");
    });

    it("drops child table before parent", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const queries = runner.getQueries();
      const movementsIdx = queries.findIndex((q) =>
        q.includes("DROP TABLE") && q.includes("stock_movements"),
      );
      const balancesIdx = queries.findIndex((q) =>
        q.includes("DROP TABLE") && q.includes("inventory_balances"),
      );
      expect(movementsIdx).toBeLessThan(balancesIdx);
    });
  });
});
