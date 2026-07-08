import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromotionsAndSaleDiscounts1800000000000
  implements MigrationInterface
{
  name = "AddPromotionsAndSaleDiscounts1800000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        name varchar(255) NOT NULL DEFAULT '',
        description text,
        scope varchar(20) NOT NULL DEFAULT 'product',
        product_id uuid,
        type varchar(20) NOT NULL,
        discount_percent integer,
        start_date timestamptz,
        end_date timestamptz,
        weekdays integer[],
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE sale_items
      ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT '0.00',
      ADD COLUMN IF NOT EXISTS applied_promotion_id uuid,
      ADD COLUMN IF NOT EXISTS applied_promotion_type varchar(20),
      ADD COLUMN IF NOT EXISTS applied_promotions jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_items
      DROP COLUMN IF EXISTS discount_amount,
      DROP COLUMN IF EXISTS applied_promotion_id,
      DROP COLUMN IF EXISTS applied_promotion_type,
      DROP COLUMN IF EXISTS applied_promotions;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS promotions;
    `);
  }
}
