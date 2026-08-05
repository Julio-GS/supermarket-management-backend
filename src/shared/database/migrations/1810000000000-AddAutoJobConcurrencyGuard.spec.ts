import { AddAutoJobConcurrencyGuard1810000000000 } from "./1810000000000-AddAutoJobConcurrencyGuard";

describe("AddAutoJobConcurrencyGuard1810000000000", () => {
  let migration: AddAutoJobConcurrencyGuard1810000000000;
  let mockRunner: {
    query: jest.Mock;
  };

  beforeEach(() => {
    migration = new AddAutoJobConcurrencyGuard1810000000000();
    mockRunner = { query: jest.fn().mockResolvedValue(undefined) };
  });

  describe("name", () => {
    it("is AddAutoJobConcurrencyGuard1810000000000", () => {
      expect(migration.name).toBe("AddAutoJobConcurrencyGuard1810000000000");
    });
  });

  describe("up", () => {
    it("creates the partial unique index for active auto jobs per product", async () => {
      await migration.up(mockRunner as any);

      const sql = mockRunner.query.mock.calls[0]?.[0] as string;
      expect(sql).toMatch(/CREATE UNIQUE INDEX/);
      expect(sql).toMatch(/IF NOT EXISTS/);
      expect(sql).toMatch(/idx_label_print_jobs_auto_one_active/);
      expect(sql).toMatch(/ON label_print_jobs\s*\(product_id\)/);
      expect(sql).toMatch(/WHERE\s+source\s*=\s*'auto'/);
      expect(sql).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'failed'\s*\)/);
    });

    it("only indexes rows with source='auto' AND status IN ('pending','failed')", async () => {
      await migration.up(mockRunner as any);

      const sql = mockRunner.query.mock.calls[0]?.[0] as string;
      // Must contain both conditions in the WHERE clause
      expect(sql).toMatch(/source\s*=\s*'auto'/);
      expect(sql).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'failed'\s*\)/);
      // The WHERE connects them with AND
      expect(sql).toMatch(/AND/);
    });

    it("excludes superseded status from the partial unique index", async () => {
      await migration.up(mockRunner as any);

      const sql = mockRunner.query.mock.calls[0]?.[0] as string;
      // superseded must not appear in the WHERE clause
      expect(sql).not.toMatch(/superseded/);
    });
  });

  describe("down", () => {
    it("drops the partial unique index", async () => {
      await migration.down(mockRunner as any);

      const sql = mockRunner.query.mock.calls[0]?.[0] as string;
      expect(sql).toMatch(/DROP INDEX/);
      expect(sql).toMatch(/IF EXISTS/);
      expect(sql).toMatch(/idx_label_print_jobs_auto_one_active/);
    });

    it("only drops the index, no other artifacts", async () => {
      await migration.down(mockRunner as any);

      // Single query, no ALTER TABLE or other DDL
      expect(mockRunner.query).toHaveBeenCalledTimes(1);
      const sql = mockRunner.query.mock.calls[0]?.[0] as string;
      expect(sql).not.toMatch(/ALTER/);
      expect(sql).not.toMatch(/DROP COLUMN/);
    });
  });
});
