import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("product_create_idempotency_keys")
@Index("uq_product_create_idempotency_key", ["idempotency_key"], { unique: true })
@Index("idx_product_create_idem_product_id", ["product_id"], {
  where: "product_id IS NOT NULL",
})
@Index("idx_product_create_idem_label_job_id", ["label_job_id"], {
  where: "label_job_id IS NOT NULL",
})
export class ProductCreateIdempotencyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, name: "idempotency_key" })
  idempotency_key!: string;

  @Column({ type: "integer", name: "payload_version", default: 1 })
  payload_version!: number;

  @Column({ type: "char", length: 64, name: "payload_hash" })
  payload_hash!: string;

  @Column({ type: "uuid", nullable: true, name: "product_id" })
  product_id!: string | null;

  @Column({ type: "uuid", nullable: true, name: "label_job_id" })
  label_job_id!: string | null;

  @Column({ type: "integer", name: "response_status", default: 201 })
  response_status!: number;

  @Column({ type: "jsonb", name: "response_body" })
  response_body!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updated_at!: Date;
}
