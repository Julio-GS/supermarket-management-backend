import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReportReadIndexes1792000000000
  implements MigrationInterface
{
  name = "AddReportReadIndexes1792000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_created_at
      ON sales(created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sales_created_at;
    `);
  }
}
