export const PromotionType = {
  PERCENTAGE: "percentage",
  TWO_X_ONE: "two_x_one",
} as const;

export type PromotionType = (typeof PromotionType)[keyof typeof PromotionType];

export const PROMOTION_TYPES = Object.values(PromotionType) as PromotionType[];

export const PromotionScope = {
  PRODUCT: "product",
  STORE: "store",
} as const;

export type PromotionScope =
  (typeof PromotionScope)[keyof typeof PromotionScope];

export const PROMOTION_SCOPES = Object.values(
  PromotionScope,
) as PromotionScope[];

export class Promotion {
  id!: string;
  name!: string;
  description?: string | null;
  scope!: PromotionScope;
  product_id?: string | null;
  type!: PromotionType;
  discount_percent?: number | null;
  start_date?: Date | null;
  end_date?: Date | null;
  weekdays?: number[] | null;
  enabled!: boolean;
  created_at!: Date;
  updated_at!: Date;
}
