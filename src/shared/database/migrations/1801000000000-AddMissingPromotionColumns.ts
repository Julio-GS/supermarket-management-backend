import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingPromotionColumns1801000000000
  implements MigrationInterface
{
  name = "AddMissingPromotionColumns1801000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add name column if missing (was absent in the original promotions table)
    await queryRunner.query(`
      ALTER TABLE promotions
        ADD COLUMN IF NOT EXISTS name varchar(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS scope varchar(20) NOT NULL DEFAULT 'product';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE promotions
        DROP COLUMN IF EXISTS name,
        DROP COLUMN IF EXISTS description,
        DROP COLUMN IF EXISTS scope;
    `);
  }
}
