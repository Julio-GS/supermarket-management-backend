import { Injectable } from "@nestjs/common";
import { PromotionRepositoryPort } from "./promotion.repository.port";
import { Promotion } from "../domain/promotion.entity";

@Injectable()
export class ListPromotionsUseCase {
  constructor(private readonly promoRepo: PromotionRepositoryPort) {}

  async execute(): Promise<Promotion[]> {
    return this.promoRepo.findAll();
  }
}
