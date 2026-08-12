import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductCreateIdempotencyKeys1813000000000
  implements MigrationInterface
{
  name = "AddProductCreateIdempotencyKeys1813000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_create_idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key VARCHAR(100) NOT NULL,
        payload_version INTEGER NOT NULL DEFAULT 1,
        payload_hash CHAR(64) NOT NULL,
        product_id UUID NULL,
        label_job_id UUID NULL,
        response_status INTEGER NOT NULL DEFAULT 201,
        response_body JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_product_create_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT fk_product_create_idempotency_product
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        CONSTRAINT fk_product_create_idempotency_label_job
          FOREIGN KEY (label_job_id) REFERENCES label_print_jobs(id) ON DELETE SET NULL,
        CONSTRAINT chk_product_create_idempotency_hash
          CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT chk_product_create_idempotency_response_status
          CHECK (response_status = 201),
        CONSTRAINT chk_product_create_idempotency_label_response
          CHECK (response_body->>'label_status' IN ('not_required', 'pending'))
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_create_idem_key
      ON product_create_idempotency_keys (idempotency_key);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_create_idem_product_id
      ON product_create_idempotency_keys (product_id)
      WHERE product_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_create_idem_label_job_id
      ON product_create_idempotency_keys (label_job_id)
      WHERE label_job_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_product_create_idem_key;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_product_create_idem_product_id;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_product_create_idem_label_job_id;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS product_create_idempotency_keys;`,
    );
  }
}
