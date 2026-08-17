import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("label_print_jobs")
@Index("idx_label_print_jobs_status", ["status"], {
  where: "status IN ('pending', 'failed')",
})
@Index("idx_label_print_jobs_claimed_by", ["claimed_by"], {
  where: "claimed_by IS NOT NULL",
})
@Index("idx_label_print_jobs_lease_expires", ["lease_expires_at"], {
  where: "lease_expires_at IS NOT NULL",
})
@Index("idx_label_print_jobs_idempotency_key", ["idempotency_key"], {
  where: "idempotency_key IS NOT NULL",
})
export class PrintJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "product_id" })
  product_id!: string;

  @Column({ type: "varchar", length: 100 })
  sku!: string;

  @Column({ type: "varchar", length: 255, name: "product_name" })
  product_name!: string;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "sale_price" })
  sale_price!: string;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: string;

  @Column({ type: "varchar", length: 100, nullable: true, name: "claimed_by" })
  claimed_by!: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "claimed_at" })
  claimed_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "lease_expires_at" })
  lease_expires_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "completed_at" })
  completed_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "failed_at" })
  failed_at!: Date | null;

  @Column({ type: "varchar", length: 500, nullable: true, name: "fail_reason" })
  fail_reason!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true, name: "blocked_reason" })
  blocked_reason!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, name: "blocked_by" })
  blocked_by!: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "blocked_at" })
  blocked_at!: Date | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    unique: true,
    name: "idempotency_key",
  })
  idempotency_key!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true, default: null })
  source!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updated_at!: Date;
}
