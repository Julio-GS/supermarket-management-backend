import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("inventory_balances")
export class InventoryBalanceEntity {
  @PrimaryColumn({ type: "uuid", name: "product_id" })
  product_id!: string;

  @Column({ type: "integer", name: "stock_actual", default: 0 })
  stock_actual!: number;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;
}
