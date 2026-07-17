import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryControl1805000000000
  implements MigrationInterface
{
  name = "AddInventoryControl1805000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create inventory_balances table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_balances (
        product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        stock_actual INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Create stock_movements table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL,
        reference_id UUID,
        previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        reason VARCHAR(500),
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Create index for product-level movement queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
      ON stock_movements (product_id);
    `);

    // Conditional backfill: initialize stock for existing products with maneja_stock=true
    await queryRunner.query(`
      INSERT INTO inventory_balances (product_id, stock_actual)
      SELECT id, 2000
      FROM products
      WHERE maneja_stock = true;
    `);

    await queryRunner.query(`
      INSERT INTO stock_movements (product_id, quantity, type, previous_stock, new_stock, reason)
      SELECT id, 2000, 'initialization', 0, 2000, 'Migration backfill: initial stock'
      FROM products
      WHERE maneja_stock = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop stock_movements index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_stock_movements_product_id;
    `);

    // Drop stock_movements table
    await queryRunner.query(`
      DROP TABLE IF EXISTS stock_movements;
    `);

    // Drop inventory_balances table
    await queryRunner.query(`
      DROP TABLE IF EXISTS inventory_balances;
    `);
  }
}
