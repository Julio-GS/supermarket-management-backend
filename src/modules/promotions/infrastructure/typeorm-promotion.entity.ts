import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("promotions")
export class PromotionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name!: string;

  @Column({ type: "text", nullable: true, name: "description" })
  description?: string | null;

  @Column({ type: "varchar", length: 20, name: "scope", default: "product" })
  scope!: string;

  @Column({ type: "uuid", nullable: true, name: "product_id" })
  product_id?: string | null;

  @Column({ type: "varchar", length: 20 })
  type!: string;

  @Column({ type: "integer", nullable: true, name: "discount_percent" })
  discount_percent?: number | null;

  @Column({ type: "timestamptz", nullable: true, name: "start_date" })
  start_date?: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "end_date" })
  end_date?: Date | null;

  @Column({ type: "integer", array: true, nullable: true })
  weekdays?: number[] | null;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;
}
