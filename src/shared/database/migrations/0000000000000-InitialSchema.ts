import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1750000000000 implements MigrationInterface {
  name = "InitialSchema1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(50) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        detalle varchar(255) NOT NULL,
        costo_neto numeric(12,2) NOT NULL,
        costo_final numeric(12,2) NOT NULL,
        iva numeric(5,2) NOT NULL,
        cambio_costo varchar(50) NOT NULL,
        cambio_precio varchar(50) NOT NULL,
        etiqueta varchar(100) NOT NULL,
        facturable boolean NOT NULL,
        maneja_stock boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_barcodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        codigo varchar(100) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id
      ON product_barcodes(product_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total numeric(12,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity integer NOT NULL CHECK (quantity > 0),
        unit_price numeric(12,2) NOT NULL,
        subtotal numeric(12,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS sale_items;");
    await queryRunner.query("DROP TABLE IF EXISTS sales;");
    await queryRunner.query("DROP TABLE IF EXISTS product_barcodes;");
    await queryRunner.query("DROP TABLE IF EXISTS products;");
    await queryRunner.query("DROP TABLE IF EXISTS users;");
  }
}
