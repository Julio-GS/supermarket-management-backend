import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAmountToSalePaymentMethods1793000000000
  implements MigrationInterface
{
  name = "AddAmountToSalePaymentMethods1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_payment_methods
      ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT '0.00';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_payment_methods
      DROP COLUMN IF EXISTS amount;
    `);
  }
}
