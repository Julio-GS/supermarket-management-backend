import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { SaleItemEntity } from "./typeorm-sale-item.entity";

@Entity("sales")
export class SaleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  user_id!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  total!: string;

  @Column({
    type: "varchar",
    length: 20,
    name: "invoice_status",
    default: "none",
  })
  invoice_status!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  cae!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true, name: "cae_vto" })
  cae_vto!: string | null;

  @Column({ type: "integer", nullable: true, name: "cbte_nro" })
  cbte_nro!: number | null;

  @Column({ type: "integer", nullable: true, name: "cbte_tipo" })
  cbte_tipo!: number | null;

  @Column({ type: "integer", nullable: true, name: "pto_vta" })
  pto_vta!: number | null;

  @Column({ type: "timestamptz", nullable: true, name: "invoice_requested_at" })
  invoice_requested_at!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;

  @OneToMany(() => SaleItemEntity, (item) => item.sale, { cascade: true })
  items!: SaleItemEntity[];
}
