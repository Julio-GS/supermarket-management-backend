import { Injectable } from "@nestjs/common";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ProviderPurchase } from "../domain/provider-purchase.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

export interface UpdateProviderPurchaseCommand {
  provider_name?: string;
  amount?: string;
  payment_method?: string | null;
}

@Injectable()
export class UpdateProviderPurchaseUseCase {
  constructor(
    private readonly repo: ProviderPurchaseRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(
    id: string,
    command: UpdateProviderPurchaseCommand,
  ): Promise<ProviderPurchase> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Provider purchase not found");
    }

    const providerName = command.provider_name?.trim();

    if (command.provider_name !== undefined && !providerName) {
      throw new ValidationError("provider_name is required");
    }

    const result = await this.repo.update(id, {
      provider_name: providerName,
      amount: command.amount,
      payment_method: command.payment_method !== undefined
        ? command.payment_method?.trim() ?? null
        : undefined,
    });

    await this.cache.deleteByPrefix(REPORT_READ_CACHE_POLICY.prefix);

    return result;
  }
}
