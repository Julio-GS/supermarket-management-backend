import { ProviderPurchase } from "../domain/provider-purchase.entity";

export interface CreateProviderPurchaseInput {
  provider_name: string;
  amount: string;
  payment_method?: string;
}

export interface UpdateProviderPurchaseInput {
  provider_name?: string;
  amount?: string;
  payment_method?: string | null;
}

export abstract class ProviderPurchaseRepositoryPort {
  abstract create(input: CreateProviderPurchaseInput): Promise<ProviderPurchase>;
  abstract findAll(): Promise<ProviderPurchase[]>;
  abstract findById(id: string): Promise<ProviderPurchase | null>;
  abstract update(
    id: string,
    input: UpdateProviderPurchaseInput,
  ): Promise<ProviderPurchase>;
  abstract delete(id: string): Promise<void>;
  abstract aggregateByProvider(
    startsAt: Date,
    endsAt: Date,
  ): Promise<{
    totalAmount: string;
    purchaseCount: number;
    paymentMethodBreakdown: { method: string; amount: string }[];
  }>;
}
