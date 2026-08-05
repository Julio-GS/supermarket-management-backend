import { AddSupersededStatusToLabelPrintJobs1811000000000 } from "./1811000000000-AddSupersededStatusToLabelPrintJobs";

describe("AddSupersededStatusToLabelPrintJobs1811000000000", () => {
  let migration: AddSupersededStatusToLabelPrintJobs1811000000000;
  let mockRunner: {
    query: jest.Mock;
  };

  beforeEach(() => {
    migration = new AddSupersededStatusToLabelPrintJobs1811000000000();
    mockRunner = { query: jest.fn().mockResolvedValue(undefined) };
  });

  describe("name", () => {
    it("is AddSupersededStatusToLabelPrintJobs1811000000000", () => {
      expect(migration.name).toBe(
        "AddSupersededStatusToLabelPrintJobs1811000000000",
      );
    });
  });

  describe("up", () => {
    it("drops the old index and recreates it with the same predicate (superseded already excluded)", async () => {
      await migration.up(mockRunner as any);

      const calls = mockRunner.query.mock.calls;
      expect(calls).toHaveLength(2);

      // First call: DROP INDEX
      const dropSql = calls[0][0] as string;
      expect(dropSql).toMatch(/DROP INDEX/);
      expect(dropSql).toMatch(/IF EXISTS/);
      expect(dropSql).toMatch(/idx_label_print_jobs_auto_one_active/);

      // Second call: CREATE INDEX
      const createSql = calls[1][0] as string;
      expect(createSql).toMatch(/CREATE UNIQUE INDEX/);
      expect(createSql).toMatch(/IF NOT EXISTS/);
      expect(createSql).toMatch(/idx_label_print_jobs_auto_one_active/);
    });

    it("recreated index excludes superseded from the WHERE clause", async () => {
      await migration.up(mockRunner as any);

      const createSql = mockRunner.query.mock.calls[1][0] as string;
      expect(createSql).toMatch(/source = 'auto'/);
      expect(createSql).toMatch(/status IN \('pending', 'failed'\)/);
      // superseded must not appear — it is terminal and non-claimable
      expect(createSql).not.toMatch(/superseded/);
    });

    it("recreated index still scoped to (product_id) with auto source", async () => {
      await migration.up(mockRunner as any);

      const createSql = mockRunner.query.mock.calls[1][0] as string;
      expect(createSql).toMatch(/ON label_print_jobs\s*\(product_id\)/);
      expect(createSql).toMatch(/WHERE\s+source\s*=\s*'auto'/);
    });
  });

  describe("down", () => {
    it("drops and recreates the index identically (semantic no-op)", async () => {
      await migration.down(mockRunner as any);

      const calls = mockRunner.query.mock.calls;
      expect(calls).toHaveLength(2);

      const dropSql = calls[0][0] as string;
      expect(dropSql).toMatch(/DROP INDEX/);
      expect(dropSql).toMatch(/idx_label_print_jobs_auto_one_active/);

      const createSql = calls[1][0] as string;
      expect(createSql).toMatch(/CREATE UNIQUE INDEX/);
      expect(createSql).toMatch(/idx_label_print_jobs_auto_one_active/);
      expect(createSql).toMatch(/status IN \('pending', 'failed'\)/);
      expect(createSql).not.toMatch(/superseded/);
    });
  });
});
