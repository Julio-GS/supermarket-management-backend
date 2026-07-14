import { Injectable } from "@nestjs/common";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class DeleteProviderPurchaseUseCase {
  constructor(
    private readonly repo: ProviderPurchaseRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Provider purchase not found");
    }

    await this.repo.delete(id);
    await this.cache.deleteByPrefix(REPORT_READ_CACHE_POLICY.prefix);
  }
}
