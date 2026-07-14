import { Injectable } from "@nestjs/common";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ProviderPurchase } from "../domain/provider-purchase.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { ValidationError } from "../../../shared/errors/domain.error";

export interface CreateProviderPurchaseCommand {
  provider_name: string;
  amount: string;
  payment_method?: string;
}

@Injectable()
export class CreateProviderPurchaseUseCase {
  constructor(
    private readonly repo: ProviderPurchaseRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(command: CreateProviderPurchaseCommand): Promise<ProviderPurchase> {
    const providerName = command.provider_name.trim();

    if (!providerName) {
      throw new ValidationError("provider_name is required");
    }

    if (!command.amount || Number(command.amount) <= 0) {
      throw new ValidationError("amount must be a positive number");
    }

    const result = await this.repo.create({
      provider_name: providerName,
      amount: command.amount,
      payment_method: command.payment_method?.trim() || undefined,
    });

    await this.cache.deleteByPrefix(REPORT_READ_CACHE_POLICY.prefix);

    return result;
  }
}
