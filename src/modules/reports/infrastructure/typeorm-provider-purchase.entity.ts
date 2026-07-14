import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("provider_purchases")
export class TypeOrmProviderPurchaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "provider_name", type: "varchar", length: 255 })
  provider_name!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: "payment_method", type: "varchar", length: 50, nullable: true })
  payment_method!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;
}
