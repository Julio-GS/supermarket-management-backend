import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { PromotionEntity } from "./typeorm-promotion.entity";
import {
  PromotionRepositoryPort,
  CreatePromotionInput,
  UpdatePromotionInput,
} from "../application/promotion.repository.port";
import { Promotion } from "../domain/promotion.entity";

@Injectable()
export class TypeOrmPromotionRepository extends PromotionRepositoryPort {
  constructor(
    @InjectRepository(PromotionEntity)
    private readonly promotionRepo: Repository<PromotionEntity>,
  ) {
    super();
  }

  async create(input: CreatePromotionInput): Promise<Promotion> {
    const entity = this.promotionRepo.create({
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      product_id: input.scope === "store" ? null : input.product_id ?? null,
      type: input.type,
      discount_percent: input.discount_percent ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      weekdays: input.weekdays ?? null,
    });

    const saved = await this.promotionRepo.save(entity);
    return this.toDomain(saved);
  }

  async update(
    id: string,
    input: UpdatePromotionInput,
  ): Promise<Promotion | null> {
    const existing = await this.promotionRepo.findOne({ where: { id } });
    if (!existing) return null;

    const updateData: Partial<PromotionEntity> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.scope !== undefined) updateData.scope = input.scope;
    if (input.product_id !== undefined) updateData.product_id = input.product_id;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.discount_percent !== undefined)
      updateData.discount_percent = input.discount_percent;
    if (input.start_date !== undefined) updateData.start_date = input.start_date;
    if (input.end_date !== undefined) updateData.end_date = input.end_date;
    if (input.weekdays !== undefined) updateData.weekdays = input.weekdays;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;

    if (Object.keys(updateData).length > 0) {
      await this.promotionRepo.update(id, updateData);
    }

    const refreshed = await this.promotionRepo.findOne({ where: { id } });
    return refreshed ? this.toDomain(refreshed) : null;
  }

  async findById(id: string): Promise<Promotion | null> {
    const entity = await this.promotionRepo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(): Promise<Promotion[]> {
    const entities = await this.promotionRepo.find({
      order: { created_at: "DESC" },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findActiveByProductIds(
    productIds: string[],
    now?: Date,
  ): Promise<Promotion[]> {
    if (productIds.length === 0) return [];

    const allPromotions = await this.promotionRepo.find({
      where: [
        { scope: "store" },
        { scope: "product", product_id: In(productIds) },
      ],
    });

    const referenceDate = now ?? new Date();

    return allPromotions
      .filter((entity) => entity.enabled)
      .filter((entity) => this.isScheduleActive(entity, referenceDate))
      .map((entity) => this.toDomain(entity));
  }

  async delete(id: string): Promise<void> {
    await this.promotionRepo.delete(id);
  }

  private isScheduleActive(
    entity: PromotionEntity,
    now: Date,
  ): boolean {
    const hasDateRange = entity.start_date && entity.end_date;
    const hasWeekdays = Array.isArray(entity.weekdays) && entity.weekdays.length > 0;

    if (hasDateRange) {
      return entity.start_date! <= now && entity.end_date! >= now;
    }

    if (hasWeekdays) {
      // JavaScript getDay(): 0=Sun, 1=Mon ... 6=Sat
      // Our weekdays use: 1=Mon, 2=Tue ... 7=Sun
      const jsDay = now.getDay();
      const ourDay = jsDay === 0 ? 7 : jsDay;
      return entity.weekdays!.includes(ourDay);
    }

    return false;
  }

  private toDomain(entity: PromotionEntity): Promotion {
    const promotion = new Promotion();
    promotion.id = entity.id;
    promotion.name = entity.name;
    promotion.description = entity.description ?? null;
    promotion.scope = entity.scope as Promotion["scope"];
    promotion.product_id = entity.product_id;
    promotion.type = entity.type as Promotion["type"];
    promotion.discount_percent = entity.discount_percent ?? null;
    promotion.start_date = entity.start_date ?? null;
    promotion.end_date = entity.end_date ?? null;
    promotion.weekdays = entity.weekdays ?? null;
    promotion.enabled = entity.enabled;
    promotion.created_at = entity.created_at;
    promotion.updated_at = entity.updated_at;
    return promotion;
  }
}
