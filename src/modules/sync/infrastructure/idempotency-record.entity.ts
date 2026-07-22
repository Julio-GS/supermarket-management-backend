import { Entity, Column, PrimaryColumn, CreateDateColumn } from "typeorm";

@Entity("sync_idempotency")
export class IdempotencyRecordEntity {
  @PrimaryColumn({ type: "varchar", length: 255 })
  idempotency_key!: string;

  @Column({ type: "varchar", length: 64 })
  operation_hash!: string;

  @Column({ type: "varchar", length: 50 })
  status!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  server_id?: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  server_version?: string | null;

  @Column({ type: "text", nullable: true })
  reason?: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
