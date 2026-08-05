import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLabelPrintJobs1808000000000
  implements MigrationInterface
{
  name = "AddLabelPrintJobs1808000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS label_print_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        sku VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        sale_price NUMERIC(12, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        claimed_by VARCHAR(100),
        claimed_at TIMESTAMP,
        lease_expires_at TIMESTAMP,
        completed_at TIMESTAMP,
        failed_at TIMESTAMP,
        fail_reason VARCHAR(500),
        idempotency_key VARCHAR(100) UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_label_print_jobs_status
      ON label_print_jobs (status)
      WHERE status IN ('pending', 'failed');
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_label_print_jobs_claimed_by
      ON label_print_jobs (claimed_by)
      WHERE claimed_by IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_label_print_jobs_lease_expires
      ON label_print_jobs (lease_expires_at)
      WHERE lease_expires_at IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_label_print_jobs_idempotency_key
      ON label_print_jobs (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_status;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_claimed_by;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_lease_expires;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_idempotency_key;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS label_print_jobs;
    `);
  }
}
