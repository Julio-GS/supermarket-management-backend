import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdhocSaleItems1804000000000
  implements MigrationInterface
{
  name = "AddAdhocSaleItems1804000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint on sale_items.product_id -> products(id)
    await queryRunner.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT conname INTO fk_name
        FROM pg_constraint
        WHERE conrelid = 'sale_items'::regclass
          AND confrelid = 'products'::regclass
          AND contype = 'f';
        IF fk_name IS NOT NULL THEN
          EXECUTE 'ALTER TABLE sale_items DROP CONSTRAINT ' || fk_name;
        END IF;
      END $$;
    `);

    // Make product_id nullable (ad-hoc items will use synthetic UUIDs or null)
    await queryRunner.query(`
      ALTER TABLE sale_items
      ALTER COLUMN product_id DROP NOT NULL;
    `);

    // Add columns for ad-hoc (non-catalog) items
    await queryRunner.query(`
      ALTER TABLE sale_items
      ADD COLUMN IF NOT EXISTS name varchar(255),
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS iva numeric(5,2);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove ad-hoc columns
    await queryRunner.query(`
      ALTER TABLE sale_items
      DROP COLUMN IF EXISTS name,
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS iva;
    `);

    // Restore NOT NULL on product_id (only safe if no ad-hoc rows exist)
    await queryRunner.query(`
      ALTER TABLE sale_items
      ALTER COLUMN product_id SET NOT NULL;
    `);

    // Restore FK constraint
    await queryRunner.query(`
      ALTER TABLE sale_items
      ADD CONSTRAINT sale_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    `);
  }
}
