import { Injectable } from "@nestjs/common";
import { SaleRepositoryPort } from "./sale.repository.port";
import { Sale } from "../domain/sale.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class GetSaleUseCase {
  constructor(private readonly sales: SaleRepositoryPort) {}

  async execute(id: string, user_id: string): Promise<Sale> {
    const sale = await this.sales.findByIdForUser(id, user_id);
    if (!sale) {
      throw new NotFoundError("Sale not found");
    }
    return sale;
  }
}
