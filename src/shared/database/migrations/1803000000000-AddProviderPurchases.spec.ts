import { AddProviderPurchases1803000000000 } from "./1803000000000-AddProviderPurchases";

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

describe("AddProviderPurchases1803000000000", () => {
  let migration: AddProviderPurchases1803000000000;

  beforeEach(() => {
    migration = new AddProviderPurchases1803000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe("AddProviderPurchases1803000000000");
  });

  describe("up", () => {
    it("creates the provider_purchases table and index", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS provider_purchases");
      expect(sql).toContain("id UUID PRIMARY KEY DEFAULT uuid_generate_v4()");
      expect(sql).toContain("provider_name VARCHAR(255) NOT NULL");
      expect(sql).toContain("amount NUMERIC(12,2) NOT NULL");
      expect(sql).toContain("payment_method VARCHAR(50)");
      expect(sql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(sql).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_provider_purchases_created_at");
      expect(sql).toContain("ON provider_purchases(created_at)");
    });

    it("does NOT include NOT NULL on payment_method column", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      // payment_method should be nullable - no NOT NULL after it
      const payMethodLine = sql
        .split("\n")
        .find((line) => line.includes("payment_method"));
      expect(payMethodLine).toBeDefined();
      expect(payMethodLine!).not.toMatch(/payment_method.*NOT NULL/);
    });
  });

  describe("down", () => {
    it("drops the index and table in reverse order", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("DROP INDEX IF EXISTS idx_provider_purchases_created_at");
      expect(sql).toContain("DROP TABLE IF EXISTS provider_purchases");

      // Index must be dropped before the table
      const idxPos = sql.indexOf("DROP INDEX");
      const tablePos = sql.indexOf("DROP TABLE");
      expect(idxPos).toBeLessThan(tablePos);
    });
  });
});
