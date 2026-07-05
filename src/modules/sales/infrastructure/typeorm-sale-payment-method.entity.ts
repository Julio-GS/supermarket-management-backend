import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { SaleEntity } from "./typeorm-sale.entity";
import { PaymentMethod } from "../domain/sale.entity";

@Entity("sale_payment_methods")
export class SalePaymentMethodEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "sale_id" })
  sale_id!: string;

  @Column({ type: "varchar", length: 20 })
  method!: PaymentMethod;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @ManyToOne(() => SaleEntity, (sale) => sale.payment_methods, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sale_id" })
  sale!: SaleEntity;
}
