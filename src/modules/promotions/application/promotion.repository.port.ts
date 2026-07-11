import {
  Promotion,
  PromotionScope,
  PromotionType,
} from "../domain/promotion.entity";

export interface CreatePromotionInput {
  name: string;
  description?: string | null;
  scope?: PromotionScope;
  product_id?: string | null;
  type: PromotionType;
  discount_percent?: number | null;
  start_date?: Date | null;
  end_date?: Date | null;
  weekdays?: number[] | null;
}

export interface UpdatePromotionInput {
  name?: string;
  description?: string | null;
  scope?: PromotionScope;
  product_id?: string | null;
  type?: PromotionType;
  discount_percent?: number | null;
  start_date?: Date | null;
  end_date?: Date | null;
  weekdays?: number[] | null;
  enabled?: boolean;
}

export abstract class PromotionRepositoryPort {
  abstract create(input: CreatePromotionInput): Promise<Promotion>;
  abstract update(
    id: string,
    input: UpdatePromotionInput,
  ): Promise<Promotion | null>;
  abstract findById(id: string): Promise<Promotion | null>;
  abstract findAll(): Promise<Promotion[]>;
  abstract findActiveByProductIds(
    productIds: string[],
    now?: Date,
  ): Promise<Promotion[]>;
  abstract delete(id: string): Promise<void>;
}
