import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSpecialProductCodes1802000000000
  implements MigrationInterface
{
  name = "AddSpecialProductCodes1802000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Enable uuid-ossp so uuid_generate_v5 and uuid_nil are available
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 1. Add pricing_mode and is_protected columns; make cost/iva nullable
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS pricing_mode varchar(10) NOT NULL DEFAULT 'fixed',
        ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false,
        ALTER COLUMN costo_neto DROP NOT NULL,
        ALTER COLUMN costo_final DROP NOT NULL,
        ALTER COLUMN iva DROP NOT NULL;
    `);

    // 2. Seed the 9 protected special products (deterministic UUIDs via uuid_generate_v5)
    //    Each product is marked pricing_mode='manual', is_protected=true, facturable=false.
    //    Costs and IVA are NULL because these products have no fixed catalog price.
    const seedProducts: { detalle: string }[] = [
      { detalle: "Fiambre" },
      { detalle: "Pan" },
      { detalle: "Kiosco" },
      { detalle: "Perfumeria" },
      { detalle: "Carne" },
      { detalle: "Verdura" },
      { detalle: "Huevos" },
      { detalle: "Limpieza" },
      { detalle: "Bolsas" },
    ];

    for (let i = 0; i < seedProducts.length; i++) {
      const code = String(i + 1);
      const { detalle } = seedProducts[i];

      // Deterministic UUID via md5(uuid_nil || code) → v5-like stability
      await queryRunner.query(`
        INSERT INTO products (
          id, detalle, costo_neto, costo_final, iva,
          cambio_costo, cambio_precio, etiqueta,
          facturable, maneja_stock,
          pricing_mode, is_protected,
          created_at, updated_at
        ) VALUES (
          uuid_generate_v5(uuid_nil(), 'special-product-${code}'),
          '${detalle}',
          NULL, NULL, NULL,
          '', '', '',
          false, false,
          'manual', true,
          now(), now()
        )
        ON CONFLICT DO NOTHING;
      `);

      await queryRunner.query(`
        INSERT INTO product_barcodes (codigo, product_id)
        SELECT '${code}', id
        FROM products
        WHERE detalle = '${detalle}' AND pricing_mode = 'manual'
        ON CONFLICT DO NOTHING;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove seeded barcodes for codes 1-9
    await queryRunner.query(`
      DELETE FROM product_barcodes
      WHERE codigo IN ('1','2','3','4','5','6','7','8','9');
    `);

    // 2. Remove seeded protected products
    await queryRunner.query(`
      DELETE FROM products
      WHERE is_protected = true AND pricing_mode = 'manual';
    `);

    // 3. Drop columns and restore NOT NULL constraints
    await queryRunner.query(`
      ALTER TABLE products
        ALTER COLUMN costo_neto SET NOT NULL,
        ALTER COLUMN costo_final SET NOT NULL,
        ALTER COLUMN iva SET NOT NULL,
        DROP COLUMN IF EXISTS pricing_mode,
        DROP COLUMN IF EXISTS is_protected;
    `);
  }
}
