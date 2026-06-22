import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { ProductBarcodeEntity } from "./typeorm-product-barcode.entity";

@Entity("products")
export class ProductEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  detalle!: string;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "costo_neto" })
  costo_neto!: string;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "costo_final" })
  costo_final!: string;

  @Column({ type: "numeric", precision: 5, scale: 2 })
  iva!: string;

  @Column({ type: "varchar", length: 50, name: "cambio_costo" })
  cambio_costo!: string;

  @Column({ type: "varchar", length: 50, name: "cambio_precio" })
  cambio_precio!: string;

  @Column({ type: "varchar", length: 100 })
  etiqueta!: string;

  @Column({ type: "boolean", name: "facturable" })
  facturable!: boolean;

  @Column({ type: "boolean", name: "maneja_stock" })
  maneja_stock!: boolean;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;

  @OneToMany(() => ProductBarcodeEntity, (barcode) => barcode.product, {
    cascade: true,
  })
  barcodes!: ProductBarcodeEntity[];
}
