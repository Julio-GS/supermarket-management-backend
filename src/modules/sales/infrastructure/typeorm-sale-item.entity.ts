import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleTicketAllocationEntity } from "./typeorm-sale-ticket-allocation.entity";
import { SaleItemAppliedPromotion } from "../domain/sale.entity";

@Entity("sale_items")
export class SaleItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "sale_id" })
  sale_id!: string;

  @Column({ type: "uuid", name: "product_id" })
  product_id!: string;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "unit_price" })
  unit_price!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  subtotal!: string;

  @Column({
    type: "jsonb",
    name: "applied_promotions",
    default: () => "'[]'::jsonb",
  })
  applied_promotions!: SaleItemAppliedPromotion[];

  @Column({
    type: "numeric",
    precision: 12,
    scale: 2,
    name: "discount_amount",
    default: "0.00",
  })
  discount_amount!: string;

  @Column({ type: "uuid", nullable: true, name: "applied_promotion_id" })
  applied_promotion_id?: string | null;

  @Column({
    type: "varchar",
    length: 20,
    nullable: true,
    name: "applied_promotion_type",
  })
  applied_promotion_type?: string | null;

  @ManyToOne(() => SaleEntity, (sale) => sale.items)
  @JoinColumn({ name: "sale_id" })
  sale!: SaleEntity;

  @OneToMany(
    () => SaleTicketAllocationEntity,
    (allocation) => allocation.sale_item,
    {
      cascade: true,
    },
  )
  split_ticket_allocations!: SaleTicketAllocationEntity[];
}
