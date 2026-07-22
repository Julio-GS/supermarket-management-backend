import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from "typeorm";

@Entity("sync_tombstones")
export class SyncTombstoneEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 36 })
  entity_id!: string;

  @Index()
  @Column({ type: "varchar", length: 50 })
  aggregate_type!: string;

  @Column({ type: "varchar", length: 50 })
  operation_type!: string;

  @CreateDateColumn()
  deleted_at!: Date;
}
