import { Injectable, Logger } from "@nestjs/common";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { InventoryDeductionLine } from "./create-sale.types";

export interface DeductAfterSalePersistedInput {
  saleId: string;
  lines: InventoryDeductionLine[];
}

@Injectable()
export class PostPersistenceInventoryPolicy {
  private readonly logger = new Logger(PostPersistenceInventoryPolicy.name);

  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async deductAfterSalePersisted(
    input: DeductAfterSalePersistedInput,
  ): Promise<void> {
    const { saleId, lines } = input;
    const managedDeductions = new Map<string, number>();

    for (const line of lines) {
      if (!line.stockManaged || line.quantity <= 0) continue;
      const current = managedDeductions.get(line.productId) ?? 0;
      managedDeductions.set(line.productId, current + line.quantity);
    }

    const sortedProductIds = [...managedDeductions.keys()].sort();
    for (const productId of sortedProductIds) {
      const totalDeduction = managedDeductions.get(productId)!;
      try {
        await this.inventory.adjustBalance(
          productId,
          -totalDeduction,
          "sale",
          saleId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to deduct stock for product ${productId} after sale ${saleId}; sale was persisted and will be returned`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
