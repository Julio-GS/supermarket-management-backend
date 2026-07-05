import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentMethodsToSales1790000000000
  implements MigrationInterface
{
  name = "AddPaymentMethodsToSales1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sale_payment_methods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        method varchar(20) NOT NULL,
        CONSTRAINT sale_payment_methods_method_check CHECK (method IN ('cash', 'transfer', 'card', 'qr')),
        CONSTRAINT sale_payment_methods_sale_id_method_key UNIQUE (sale_id, method)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sale_payment_methods_sale_id
      ON sale_payment_methods(sale_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS sale_payment_methods;
    `);
  }
}
