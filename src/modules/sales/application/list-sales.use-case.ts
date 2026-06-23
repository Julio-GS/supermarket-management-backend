import { Injectable } from "@nestjs/common";
import { SaleRepositoryPort } from "./sale.repository.port";
import { Sale } from "../domain/sale.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";

@Injectable()
export class ListSalesUseCase {
  constructor(private readonly sales: SaleRepositoryPort) {}

  async execute(user_id: string): Promise<Sale[]> {
    return this.sales.findByUser(user_id);
  }

  async executePage(
    user_id: string,
    options: PaginationOptions,
  ): Promise<Page<Sale>> {
    return this.sales.findPageByUser(user_id, options);
  }
}
