import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSourceToLabelPrintJobs1809000000000
  implements MigrationInterface
{
  name = "AddSourceToLabelPrintJobs1809000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE label_print_jobs
      DROP COLUMN IF EXISTS source;
    `);
  }
}
