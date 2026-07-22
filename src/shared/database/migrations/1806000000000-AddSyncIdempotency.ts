import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSyncIdempotency1806000000000
  implements MigrationInterface
{
  name = "AddSyncIdempotency1806000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_idempotency (
        idempotency_key VARCHAR(255) PRIMARY KEY,
        operation_hash VARCHAR(64) NOT NULL,
        status VARCHAR(50) NOT NULL,
        server_id VARCHAR(36),
        server_version VARCHAR(100),
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_idempotency_status
      ON sync_idempotency (status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sync_idempotency_status;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS sync_idempotency;
    `);
  }
}
