import { FixLabelPrintJobsTimestamptz1812000000000 } from "./1812000000000-FixLabelPrintJobsTimestamptz";

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

describe("FixLabelPrintJobsTimestamptz1812000000000", () => {
  let migration: FixLabelPrintJobsTimestamptz1812000000000;

  beforeEach(() => {
    migration = new FixLabelPrintJobsTimestamptz1812000000000();
  });

  describe("name", () => {
    it("is FixLabelPrintJobsTimestamptz1812000000000", () => {
      expect(migration.name).toBe("FixLabelPrintJobsTimestamptz1812000000000");
    });
  });

  describe("up", () => {
    it("alters exactly six timestamp columns to timestamptz", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      // Six ALTER COLUMN statements
      const alterMatches = sql.match(/ALTER COLUMN/g);
      expect(alterMatches).not.toBeNull();
      expect(alterMatches!.length).toBe(6);
      // All six target TIMESTAMPTZ
      const timestamptzMatches = sql.match(/SET DATA TYPE TIMESTAMPTZ/gi);
      expect(timestamptzMatches).not.toBeNull();
      expect(timestamptzMatches!.length).toBe(6);
    });

    it("converts created_at and updated_at using UTC origin", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toMatch(/created_at.*AT TIME ZONE\s+'UTC'/i);
      expect(sql).toMatch(/updated_at.*AT TIME ZONE\s+'UTC'/i);
    });

    it("converts lifecycle columns using America/Argentina/Buenos_Aires origin", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toMatch(/claimed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/lease_expires_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/completed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/failed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
    });

    it("does not insert, update, delete, or drop any rows or tables", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/INSERT\s+INTO/i);
      expect(sql).not.toMatch(/UPDATE\s+/i);
      expect(sql).not.toMatch(/DELETE\s+FROM/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/DROP\s+TABLE/i);
    });

    it("contains no reference to products", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/products/i);
    });

    it("preserves nullable columns as nullable (no SET NOT NULL)", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/SET\s+NOT\s+NULL/i);
    });

    it("preserves not-null columns as not-null (no DROP NOT NULL)", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/DROP\s+NOT\s+NULL/i);
    });

    it("preserves DEFAULT now() on created_at and updated_at", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/ALTER\s+COLUMN\s+created_at.*DROP\s+DEFAULT/i);
      expect(sql).not.toMatch(/ALTER\s+COLUMN\s+updated_at.*DROP\s+DEFAULT/i);
    });
  });

  describe("down", () => {
    it("alters exactly six timestamptz columns back to timestamp", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      const alterMatches = sql.match(/ALTER COLUMN/g);
      expect(alterMatches).not.toBeNull();
      expect(alterMatches!.length).toBe(6);
      // All six target TIMESTAMP (not timestamptz)
      const timestampMatches = sql.match(/SET DATA TYPE TIMESTAMP(?!TZ)/gi);
      expect(timestampMatches).not.toBeNull();
      expect(timestampMatches!.length).toBe(6);
    });

    it("reverses created_at and updated_at back at UTC wall-clock", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toMatch(/created_at.*AT TIME ZONE\s+'UTC'/i);
      expect(sql).toMatch(/updated_at.*AT TIME ZONE\s+'UTC'/i);
    });

    it("reverses lifecycle columns back at America/Argentina/Buenos_Aires wall-clock", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toMatch(/claimed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/lease_expires_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/completed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
      expect(sql).toMatch(/failed_at.*AT TIME ZONE\s+'America\/Argentina\/Buenos_Aires'/i);
    });

    it("does not insert, update, delete, or drop any rows or tables", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/INSERT\s+INTO/i);
      expect(sql).not.toMatch(/UPDATE\s+/i);
      expect(sql).not.toMatch(/DELETE\s+FROM/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/DROP\s+TABLE/i);
    });

    it("contains no reference to products", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/products/i);
    });

    it("reversible: up-then-down produces identical SQL shape for each column", async () => {
      const runnerUp = mockQueryRunner();
      const runnerDown = mockQueryRunner();

      await migration.up(runnerUp as any);
      await migration.down(runnerDown as any);

      const upSql = runnerUp.getQueries().join("\n");
      const downSql = runnerDown.getQueries().join("\n");

      // Same number of statements
      expect(runnerUp.getQueries().length).toBe(runnerDown.getQueries().length);

      // Same columns appear in both directions
      for (const col of [
        "created_at",
        "updated_at",
        "claimed_at",
        "lease_expires_at",
        "completed_at",
        "failed_at",
      ]) {
        expect(upSql).toContain(col);
        expect(downSql).toContain(col);
      }
    });
  });

  describe("entity alignment", () => {
    it("declares all six timestamp columns as timestamptz in the migration", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      const columns = [
        "created_at",
        "updated_at",
        "claimed_at",
        "lease_expires_at",
        "completed_at",
        "failed_at",
      ];
      for (const col of columns) {
        const colRegex = new RegExp(`ALTER\\s+COLUMN\\s+${col}\\s+SET\\s+DATA\\s+TYPE\\s+TIMESTAMPTZ`, "i");
        expect(sql).toMatch(colRegex);
      }
    });
  });
});
