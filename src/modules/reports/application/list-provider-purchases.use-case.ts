import { Injectable } from "@nestjs/common";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ProviderPurchase } from "../domain/provider-purchase.entity";

@Injectable()
export class ListProviderPurchasesUseCase {
  constructor(
    private readonly repo: ProviderPurchaseRepositoryPort,
  ) {}

  async execute(): Promise<ProviderPurchase[]> {
    return this.repo.findAll();
  }
}
