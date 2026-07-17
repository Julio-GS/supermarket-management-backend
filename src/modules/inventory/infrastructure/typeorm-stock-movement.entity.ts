import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("stock_movements")
export class StockMovementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "product_id" })
  product_id!: string;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "varchar", length: 20 })
  type!: string;

  @Column({ type: "uuid", name: "reference_id", nullable: true })
  reference_id!: string | null;

  @Column({ type: "integer", name: "previous_stock" })
  previous_stock!: number;

  @Column({ type: "integer", name: "new_stock" })
  new_stock!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;
}
