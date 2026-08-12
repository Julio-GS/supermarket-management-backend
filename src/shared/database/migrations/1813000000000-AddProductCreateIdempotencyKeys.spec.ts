import { AddProductCreateIdempotencyKeys1813000000000 } from "./1813000000000-AddProductCreateIdempotencyKeys";

describe("AddProductCreateIdempotencyKeys1813000000000", () => {
  let migration: AddProductCreateIdempotencyKeys1813000000000;
  let mockRunner: {
    query: jest.Mock;
  };

  beforeEach(() => {
    migration = new AddProductCreateIdempotencyKeys1813000000000();
    mockRunner = { query: jest.fn().mockResolvedValue(undefined) };
  });

  describe("name", () => {
    it("is AddProductCreateIdempotencyKeys1813000000000", () => {
      expect(migration.name).toBe(
        "AddProductCreateIdempotencyKeys1813000000000",
      );
    });
  });

  describe("up", () => {
    it("creates the product_create_idempotency_keys table with all required columns", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      // Table creation
      expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS product_create_idempotency_keys/);

      // Required columns
      expect(allSql).toMatch(/id\s+UUID\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
      expect(allSql).toMatch(/idempotency_key\s+VARCHAR\(100\)\s+NOT NULL/i);
      expect(allSql).toMatch(/payload_version\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i);
      expect(allSql).toMatch(/payload_hash\s+CHAR\(64\)\s+NOT NULL/i);
      expect(allSql).toMatch(/product_id\s+UUID\s+NULL/i);
      expect(allSql).toMatch(/label_job_id\s+UUID\s+NULL/i);
      expect(allSql).toMatch(/response_status\s+INTEGER\s+NOT NULL\s+DEFAULT\s+201/i);
      expect(allSql).toMatch(/response_body\s+JSONB\s+NOT NULL/i);
      expect(allSql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
      expect(allSql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
    });

    it("includes the unique constraint on idempotency_key", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CONSTRAINT\s+uq_product_create_idempotency_key\s+UNIQUE\s*\(idempotency_key\)/i);
    });

    it("includes nullable foreign keys with ON DELETE SET NULL", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      // FK to products
      expect(allSql).toMatch(/CONSTRAINT\s+fk_product_create_idempotency_product\s+FOREIGN KEY\s*\(product_id\)\s+REFERENCES\s+products\s*\(id\)\s+ON DELETE SET NULL/i);
      // FK to label_print_jobs
      expect(allSql).toMatch(/CONSTRAINT\s+fk_product_create_idempotency_label_job\s+FOREIGN KEY\s*\(label_job_id\)\s+REFERENCES\s+label_print_jobs\s*\(id\)\s+ON DELETE SET NULL/i);
    });

    it("includes the payload_hash hex check constraint", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CONSTRAINT\s+chk_product_create_idempotency_hash\s+CHECK\s*\(payload_hash\s+~\s+'\\?\^\[0-9a-f\]\{64\}\$\\?'\)/i);
    });

    it("includes the response_status = 201 check constraint", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CONSTRAINT\s+chk_product_create_idempotency_response_status\s+CHECK\s*\(response_status\s*=\s*201\)/i);
    });

    it("includes the label_response check constraint allowing not_required and pending", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CONSTRAINT\s+chk_product_create_idempotency_label_response\s+CHECK\s*\(/i);
      expect(allSql).toMatch(/'not_required'/);
      expect(allSql).toMatch(/'pending'/);
    });

    it("label_response check does NOT require label_job_id IS NOT NULL for pending (allows replay after job deletion)", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      const labelResponseStart = allSql.indexOf("chk_product_create_idempotency_label_response");
      const labelResponseEnd = allSql.indexOf(")", labelResponseStart + 60);
      const constraintSql = allSql.substring(labelResponseStart, labelResponseEnd + 1);

      // Must NOT assert label_job_id IS NOT NULL for pending
      expect(constraintSql).not.toMatch(/label_job_id\s+IS\s+NOT\s+NULL/i);
    });

    it("up contains no INSERT, UPDATE, DELETE, or ALTER TABLE referencing products or users", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).not.toMatch(/INSERT\s+INTO\s+products/i);
      expect(allSql).not.toMatch(/INSERT\s+INTO\s+users/i);
      expect(allSql).not.toMatch(/UPDATE\s+products/i);
      expect(allSql).not.toMatch(/UPDATE\s+users/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+products/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+users/i);
      expect(allSql).not.toMatch(/ALTER\s+TABLE\s+products/i);
      expect(allSql).not.toMatch(/ALTER\s+TABLE\s+users/i);
    });

    it("creates the unique index on idempotency_key", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_product_create_idem_key/i);
      expect(allSql).toMatch(/ON\s+product_create_idempotency_keys\s*\(idempotency_key\)/i);
    });

    it("creates a partial index on product_id where not null", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CREATE INDEX IF NOT EXISTS idx_product_create_idem_product_id/i);
      expect(allSql).toMatch(/ON\s+product_create_idempotency_keys\s*\(product_id\)/i);
      expect(allSql).toMatch(/WHERE\s+product_id\s+IS\s+NOT\s+NULL/i);
    });

    it("creates a partial index on label_job_id where not null", async () => {
      await migration.up(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).toMatch(/CREATE INDEX IF NOT EXISTS idx_product_create_idem_label_job_id/i);
      expect(allSql).toMatch(/ON\s+product_create_idempotency_keys\s*\(label_job_id\)/i);
      expect(allSql).toMatch(/WHERE\s+label_job_id\s+IS\s+NOT\s+NULL/i);
    });
  });

  describe("down", () => {
    it("drops the new indexes and table only", async () => {
      await migration.down(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      // Drop indexes
      expect(allSql).toMatch(/DROP INDEX IF EXISTS idx_product_create_idem_key/i);
      expect(allSql).toMatch(/DROP INDEX IF EXISTS idx_product_create_idem_product_id/i);
      expect(allSql).toMatch(/DROP INDEX IF EXISTS idx_product_create_idem_label_job_id/i);

      // Drop table
      expect(allSql).toMatch(/DROP TABLE IF EXISTS product_create_idempotency_keys/i);
    });

    it("down contains no INSERT, UPDATE, DELETE, or ALTER TABLE referencing products or users", async () => {
      await migration.down(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).not.toMatch(/INSERT\s+INTO\s+products/i);
      expect(allSql).not.toMatch(/INSERT\s+INTO\s+users/i);
      expect(allSql).not.toMatch(/UPDATE\s+products/i);
      expect(allSql).not.toMatch(/UPDATE\s+users/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+products/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+users/i);
      expect(allSql).not.toMatch(/ALTER\s+TABLE\s+products/i);
      expect(allSql).not.toMatch(/ALTER\s+TABLE\s+users/i);
    });

    it("down does not mention product_create_idempotency_keys FKs in ALTER TABLE products or label_print_jobs", async () => {
      await migration.down(mockRunner as any);

      const allSql = mockRunner.query.mock.calls.map((c: string[]) => c[0]).join("\n");

      expect(allSql).not.toMatch(/ALTER\s+TABLE\s+label_print_jobs/i);
    });
  });
});
