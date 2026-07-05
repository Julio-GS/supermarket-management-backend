import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";

@Entity("sale_ticket_allocations")
export class SaleTicketAllocationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "sale_id" })
  sale_id!: string;

  @Column({ type: "uuid", name: "sale_item_id" })
  sale_item_id!: string;

  @Column({ type: "varchar", length: 100, name: "ticket_group_label" })
  ticket_group_label!: string;

  @Column({ type: "integer" })
  quantity!: number;

  @ManyToOne(() => SaleEntity, (sale) => sale.split_ticket_allocations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sale_id" })
  sale!: SaleEntity;

  @ManyToOne(() => SaleItemEntity, (saleItem) => saleItem.split_ticket_allocations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sale_item_id" })
  sale_item!: SaleItemEntity;
}
