import { Injectable } from "@nestjs/common";
import { SaleRepositoryPort } from "./sale.repository.port";
import { Sale } from "../domain/sale.entity";

@Injectable()
export class ListSalesUseCase {
  constructor(private readonly sales: SaleRepositoryPort) {}

  async execute(user_id: string): Promise<Sale[]> {
    return this.sales.findByUser(user_id);
  }
}
