import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  PromotionResponseDto,
} from "./promotion.dto";
import { CreatePromotionUseCase } from "../application/create-promotion.use-case";
import { UpdatePromotionUseCase } from "../application/update-promotion.use-case";
import { DeletePromotionUseCase } from "../application/delete-promotion.use-case";
import { ListPromotionsUseCase } from "../application/list-promotions.use-case";
import { Promotion } from "../domain/promotion.entity";

function toPromotionResponse(promotion: Promotion): PromotionResponseDto {
  return {
    id: promotion.id,
    name: promotion.name,
    description: promotion.description ?? null,
    scope: promotion.scope,
    product_id: promotion.product_id ?? null,
    type: promotion.type,
    discount_percent: promotion.discount_percent ?? null,
    start_date: promotion.start_date?.toISOString() ?? null,
    end_date: promotion.end_date?.toISOString() ?? null,
    weekdays: promotion.weekdays ?? null,
    enabled: promotion.enabled,
    created_at: promotion.created_at,
    updated_at: promotion.updated_at,
  };
}

function parseOptionalUpdateDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

@Controller("promotions")
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(
    private readonly createPromotion: CreatePromotionUseCase,
    private readonly updatePromotion: UpdatePromotionUseCase,
    private readonly deletePromotion: DeletePromotionUseCase,
    private readonly listPromotions: ListPromotionsUseCase,
  ) {}

  @Post()
  async create(
    @Body() dto: CreatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const promotion = await this.createPromotion.execute({
      name: dto.name,
      description: dto.description ?? null,
      scope: dto.scope,
      product_id: dto.product_id,
      type: dto.type,
      discount_percent: dto.discount_percent ?? null,
      start_date: dto.start_date ? new Date(dto.start_date) : null,
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      weekdays: dto.weekdays ?? null,
    });
    return toPromotionResponse(promotion);
  }

  @Get()
  async list(): Promise<PromotionResponseDto[]> {
    const promotions = await this.listPromotions.execute();
    return promotions.map(toPromotionResponse);
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const promotion = await this.updatePromotion.execute(id, {
      name: dto.name,
      description: dto.description,
      scope: dto.scope,
      product_id: dto.product_id,
      type: dto.type,
      discount_percent: dto.discount_percent,
      start_date: parseOptionalUpdateDate(dto.start_date),
      end_date: parseOptionalUpdateDate(dto.end_date),
      weekdays: dto.weekdays,
      enabled: dto.enabled,
    });
    return toPromotionResponse(promotion);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deletePromotion.execute(id);
  }
}
