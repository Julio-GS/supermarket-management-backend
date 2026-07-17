export type StockMovementType = "sale" | "adjustment" | "initialization";

export class InventoryBalance {
  product_id!: string;
  stock_actual!: number;
  updated_at!: Date;
}

export class StockMovement {
  id!: string;
  product_id!: string;
  quantity!: number;
  type!: StockMovementType;
  reference_id!: string | null;
  previous_stock!: number;
  new_stock!: number;
  reason!: string | null;
  created_at!: Date;
}
