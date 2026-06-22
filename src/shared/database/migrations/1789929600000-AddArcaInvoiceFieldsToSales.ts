import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArcaInvoiceFieldsToSales1789929600000 implements MigrationInterface {
  name = "AddArcaInvoiceFieldsToSales1789929600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS invoice_status varchar(20) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS cae varchar(255) NULL,
      ADD COLUMN IF NOT EXISTS cae_vto varchar(20) NULL,
      ADD COLUMN IF NOT EXISTS cbte_nro integer NULL,
      ADD COLUMN IF NOT EXISTS cbte_tipo integer NULL,
      ADD COLUMN IF NOT EXISTS pto_vta integer NULL,
      ADD COLUMN IF NOT EXISTS invoice_requested_at timestamptz NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales
      DROP COLUMN IF EXISTS invoice_status,
      DROP COLUMN IF EXISTS cae,
      DROP COLUMN IF EXISTS cae_vto,
      DROP COLUMN IF EXISTS cbte_nro,
      DROP COLUMN IF EXISTS cbte_tipo,
      DROP COLUMN IF EXISTS pto_vta,
      DROP COLUMN IF EXISTS invoice_requested_at;
    `);
  }
}
