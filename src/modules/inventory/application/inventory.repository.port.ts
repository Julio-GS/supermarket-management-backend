import { InventoryBalance, StockMovement, StockMovementType } from "../domain/inventory.entity";
import { QueryRunner } from "typeorm";

export interface StockAdjustInput {
  product_id: string;
  quantity: number;
  reason?: string;
}

export abstract class InventoryRepositoryPort {
  abstract findBalance(productId: string): Promise<InventoryBalance | null>;
  abstract findAllBalances(): Promise<InventoryBalance[]>;
  abstract findBalancesByIds(productIds: string[]): Promise<Map<string, InventoryBalance>>;
  abstract createBalance(
    productId: string,
    stockActual: number,
    runner?: QueryRunner,
  ): Promise<InventoryBalance>;
  abstract adjustBalance(
    productId: string,
    delta: number,
    type: StockMovementType,
    referenceId?: string,
    reason?: string,
  ): Promise<StockMovement>;
  abstract findMovementsByProduct(productId: string): Promise<StockMovement[]>;
}
