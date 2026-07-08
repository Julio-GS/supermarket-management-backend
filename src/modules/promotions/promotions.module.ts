import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PromotionsController } from "./presentation/promotions.controller";
import { PromotionRepositoryPort } from "./application/promotion.repository.port";
import { TypeOrmPromotionRepository } from "./infrastructure/typeorm-promotion.repository";
import { PromotionEntity } from "./infrastructure/typeorm-promotion.entity";
import { CreatePromotionUseCase } from "./application/create-promotion.use-case";
import { UpdatePromotionUseCase } from "./application/update-promotion.use-case";
import { DisablePromotionUseCase } from "./application/disable-promotion.use-case";
import { ListPromotionsUseCase } from "./application/list-promotions.use-case";
import { PromotionResolverService } from "./application/promotion-resolver.service";

@Module({
  imports: [TypeOrmModule.forFeature([PromotionEntity])],
  controllers: [PromotionsController],
  providers: [
    {
      provide: PromotionRepositoryPort,
      useClass: TypeOrmPromotionRepository,
    },
    CreatePromotionUseCase,
    UpdatePromotionUseCase,
    DisablePromotionUseCase,
    ListPromotionsUseCase,
    PromotionResolverService,
  ],
  exports: [PromotionRepositoryPort, PromotionResolverService],
})
export class PromotionsModule {}
