import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupersededStatusToLabelPrintJobs1811000000000
  implements MigrationInterface
{
  name = "AddSupersededStatusToLabelPrintJobs1811000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update the partial unique index to exclude superseded jobs.
    // A superseded job is terminal and non-claimable — the unique constraint
    // only applies to active (pending/failed) auto jobs per product.
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_auto_one_active;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_label_print_jobs_auto_one_active
      ON label_print_jobs (product_id)
      WHERE source = 'auto' AND status IN ('pending', 'failed');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the original index (functionally identical; this is a no-op
    // semantics migration to clarify that superseded is excluded).
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_label_print_jobs_auto_one_active;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_label_print_jobs_auto_one_active
      ON label_print_jobs (product_id)
      WHERE source = 'auto' AND status IN ('pending', 'failed');
    `);
  }
}
