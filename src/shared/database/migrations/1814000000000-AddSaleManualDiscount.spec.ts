import { AddSaleManualDiscount1814000000000 } from "./1814000000000-AddSaleManualDiscount";

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

describe("AddSaleManualDiscount1814000000000", () => {
  let migration: AddSaleManualDiscount1814000000000;

  beforeEach(() => {
    migration = new AddSaleManualDiscount1814000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe("AddSaleManualDiscount1814000000000");
  });

  describe("up", () => {
    it("adds nullable columns without defaults or backfill", async () => {
      const runner = mockQueryRunner();
      await migration.up(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain(
        "ADD COLUMN IF NOT EXISTS manual_discount_amount numeric(12,2)",
      );
      expect(sql).toContain(
        "ADD COLUMN IF NOT EXISTS manual_discount_modality varchar(20)",
      );
      expect(sql).toContain(
        "ADD COLUMN IF NOT EXISTS manual_discount_percentage numeric(5,2)",
      );
      expect(sql).not.toContain("DEFAULT");
      expect(sql).not.toMatch(/UPDATE\s+sales/i);
    });

    it("adds modality, amount, percentage, and shape constraints", async () => {
      const runner = mockQueryRunner();
      await migration.up(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("chk_sales_manual_discount_modality");
      expect(sql).toContain("chk_sales_manual_discount_amount_non_negative");
      expect(sql).toContain("chk_sales_manual_discount_percentage_range");
      expect(sql).toContain("chk_sales_manual_discount_shape");
    });
  });

  describe("down", () => {
    it("drops only the new constraints and columns", async () => {
      const runner = mockQueryRunner();
      await migration.down(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("chk_sales_manual_discount_shape");
      expect(sql).toContain("DROP COLUMN IF EXISTS manual_discount_amount");
      expect(sql).toContain("DROP COLUMN IF EXISTS manual_discount_modality");
      expect(sql).toContain("DROP COLUMN IF EXISTS manual_discount_percentage");
      expect(sql).not.toMatch(/UPDATE\s+|INSERT\s+INTO|DELETE\s+FROM/i);
    });
  });
});
