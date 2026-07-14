import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProviderPurchases1803000000000
  implements MigrationInterface
{
  name = "AddProviderPurchases1803000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS provider_purchases (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        provider_name VARCHAR(255) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_purchases_created_at
      ON provider_purchases(created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_provider_purchases_created_at;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS provider_purchases;
    `);
  }
}
