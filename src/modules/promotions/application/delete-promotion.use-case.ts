import { Injectable } from "@nestjs/common";
import { PromotionRepositoryPort } from "./promotion.repository.port";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class DeletePromotionUseCase {
  constructor(private readonly promoRepo: PromotionRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Promotion ${id} not found`);
    }

    await this.promoRepo.delete(id);
  }
}
