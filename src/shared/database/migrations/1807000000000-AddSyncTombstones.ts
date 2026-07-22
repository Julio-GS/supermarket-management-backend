import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSyncTombstones1807000000000 implements MigrationInterface {
  name = "AddSyncTombstones1807000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_tombstones (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entity_id VARCHAR(36) NOT NULL,
        aggregate_type VARCHAR(50) NOT NULL,
        operation_type VARCHAR(50) NOT NULL,
        deleted_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_tombstones_entity
      ON sync_tombstones (aggregate_type, entity_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at
      ON sync_tombstones (deleted_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sync_tombstones_deleted_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sync_tombstones_entity;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sync_tombstones;`);
  }
}
