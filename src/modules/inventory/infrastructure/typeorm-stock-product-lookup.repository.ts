import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  StockProductLookupPort,
  StockProductLookupResult,
} from "../application/stock-product-lookup.port";

@Injectable()
export class TypeOrmStockProductLookupRepository extends StockProductLookupPort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async findById(id: string): Promise<StockProductLookupResult | null> {
    const rows: Array<{ id: string; maneja_stock: boolean }> =
      await this.dataSource.query(
        "SELECT id, maneja_stock FROM products WHERE id = $1",
        [id],
      );

    if (rows.length === 0) return null;

    return { id: rows[0].id, maneja_stock: rows[0].maneja_stock };
  }
}
