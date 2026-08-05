import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoJobConcurrencyGuard1810000000000
  implements MigrationInterface
{
  name = "AddAutoJobConcurrencyGuard1810000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index: at most one active auto job per product.
    // "Active" means status is pending or failed (both are claimable).
    // Manual jobs (source != 'auto') and completed/claimed jobs are excluded,
    // so multiple manual jobs and historical auto jobs coexist freely.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_label_print_jobs_auto_one_active
      ON label_print_jobs (product_id)
      WHERE source = 'auto' AND status IN ('pending', 'failed');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_auto_one_active;
    `);
  }
}
