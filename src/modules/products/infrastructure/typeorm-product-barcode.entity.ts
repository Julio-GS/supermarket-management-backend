import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ProductEntity } from "./typeorm-product.entity";

@Entity("product_barcodes")
export class ProductBarcodeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "product_id" })
  product_id!: string;

  @Column({ type: "varchar", length: 100, unique: true })
  codigo!: string;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;

  @ManyToOne(() => ProductEntity, (product) => product.barcodes)
  @JoinColumn({ name: "product_id" })
  product!: ProductEntity;
}
