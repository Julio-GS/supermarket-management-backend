import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBlockedForReviewToLabelPrintJobs1815000000000
  implements MigrationInterface
{
  name = "AddBlockedForReviewToLabelPrintJobs1815000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      ADD COLUMN IF NOT EXISTS blocked_reason varchar(500),
      ADD COLUMN IF NOT EXISTS blocked_by varchar(100),
      ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
    `);

    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      ADD CONSTRAINT chk_label_print_jobs_blocked_audit
      CHECK (
        (
          status <> 'blocked_for_review'
          AND blocked_reason IS NULL
          AND blocked_by IS NULL
          AND blocked_at IS NULL
        )
        OR (
          status = 'blocked_for_review'
          AND blocked_reason IS NOT NULL
          AND blocked_by IS NOT NULL
          AND blocked_at IS NOT NULL
        )
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      DROP CONSTRAINT IF EXISTS chk_label_print_jobs_blocked_audit;
    `);

    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      DROP COLUMN IF EXISTS blocked_reason,
      DROP COLUMN IF EXISTS blocked_by,
      DROP COLUMN IF EXISTS blocked_at;
    `);
  }
}
