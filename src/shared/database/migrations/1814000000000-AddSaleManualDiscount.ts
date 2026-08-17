import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSaleManualDiscount1814000000000 implements MigrationInterface {
  name = "AddSaleManualDiscount1814000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS manual_discount_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS manual_discount_modality varchar(20),
      ADD COLUMN IF NOT EXISTS manual_discount_percentage numeric(5,2);
    `);

    await queryRunner.query(`
      ALTER TABLE sales
      ADD CONSTRAINT chk_sales_manual_discount_modality
      CHECK (
        manual_discount_modality IS NULL
        OR manual_discount_modality IN ('fixed', 'percentage')
      );
    `);

    await queryRunner.query(`
      ALTER TABLE sales
      ADD CONSTRAINT chk_sales_manual_discount_amount_non_negative
      CHECK (
        manual_discount_amount IS NULL
        OR manual_discount_amount >= 0
      );
    `);

    await queryRunner.query(`
      ALTER TABLE sales
      ADD CONSTRAINT chk_sales_manual_discount_percentage_range
      CHECK (
        manual_discount_percentage IS NULL
        OR (
          manual_discount_percentage >= 0
          AND manual_discount_percentage <= 100
        )
      );
    `);

    await queryRunner.query(`
      ALTER TABLE sales
      ADD CONSTRAINT chk_sales_manual_discount_shape
      CHECK (
        (
          manual_discount_amount IS NULL
          AND manual_discount_modality IS NULL
          AND manual_discount_percentage IS NULL
        )
        OR (
          manual_discount_amount = 0
          AND manual_discount_modality IS NULL
          AND manual_discount_percentage IS NULL
        )
        OR (
          manual_discount_amount > 0
          AND manual_discount_modality = 'fixed'
          AND manual_discount_percentage IS NULL
        )
        OR (
          manual_discount_amount > 0
          AND manual_discount_modality = 'percentage'
          AND manual_discount_percentage IS NOT NULL
        )
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales
      DROP CONSTRAINT IF EXISTS chk_sales_manual_discount_shape,
      DROP CONSTRAINT IF EXISTS chk_sales_manual_discount_percentage_range,
      DROP CONSTRAINT IF EXISTS chk_sales_manual_discount_amount_non_negative,
      DROP CONSTRAINT IF EXISTS chk_sales_manual_discount_modality;
    `);

    await queryRunner.query(`
      ALTER TABLE sales
      DROP COLUMN IF EXISTS manual_discount_amount,
      DROP COLUMN IF EXISTS manual_discount_modality,
      DROP COLUMN IF EXISTS manual_discount_percentage;
    `);
  }
}
