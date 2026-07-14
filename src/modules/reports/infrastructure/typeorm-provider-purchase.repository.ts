import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ProviderPurchaseRepositoryPort,
  CreateProviderPurchaseInput,
  UpdateProviderPurchaseInput,
} from "../application/provider-purchase.repository.port";
import { ProviderPurchase } from "../domain/provider-purchase.entity";
import { TypeOrmProviderPurchaseEntity } from "./typeorm-provider-purchase.entity";

@Injectable()
export class TypeOrmProviderPurchaseRepository extends ProviderPurchaseRepositoryPort {
  constructor(
    @InjectRepository(TypeOrmProviderPurchaseEntity)
    private readonly repo: Repository<TypeOrmProviderPurchaseEntity>,
  ) {
    super();
  }

  async create(input: CreateProviderPurchaseInput): Promise<ProviderPurchase> {
    const entity = this.repo.create({
      provider_name: input.provider_name,
      amount: input.amount,
      payment_method: input.payment_method ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findAll(): Promise<ProviderPurchase[]> {
    const entities = await this.repo.find({
      order: { created_at: "DESC" },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string): Promise<ProviderPurchase | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async update(
    id: string,
    input: UpdateProviderPurchaseInput,
  ): Promise<ProviderPurchase> {
    await this.repo.update(id, {
      ...(input.provider_name !== undefined && {
        provider_name: input.provider_name,
      }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.payment_method !== undefined && {
        payment_method: input.payment_method,
      }),
    });
    const updated = await this.repo.findOneBy({ id });
    return this.toDomain(updated!);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async aggregateByProvider(
    startsAt: Date,
    endsAt: Date,
  ): Promise<{
    totalAmount: string;
    purchaseCount: number;
    paymentMethodBreakdown: { method: string; amount: string }[];
  }> {
    const totalResult = await this.repo
      .createQueryBuilder("pp")
      .select("COALESCE(SUM(pp.amount::numeric), '0')", "amount")
      .where("pp.created_at >= :startsAt", { startsAt })
      .andWhere("pp.created_at <= :endsAt", { endsAt })
      .getRawOne<{ amount: string }>();

    const countResult = await this.repo
      .createQueryBuilder("pp")
      .select("COUNT(*)", "count")
      .where("pp.created_at >= :startsAt", { startsAt })
      .andWhere("pp.created_at <= :endsAt", { endsAt })
      .getRawOne<{ count: string }>();

    const paymentResults = await this.repo
      .createQueryBuilder("pp")
      .select("COALESCE(pp.payment_method, 'unknown')", "method")
      .addSelect("SUM(pp.amount::numeric)::text", "amount")
      .where("pp.created_at >= :startsAt", { startsAt })
      .andWhere("pp.created_at <= :endsAt", { endsAt })
      .groupBy("pp.payment_method")
      .orderBy("amount", "DESC")
      .getRawMany<{ method: string; amount: string }>();

    return {
      totalAmount: totalResult?.amount ?? "0.00",
      purchaseCount: Number(countResult?.count) || 0,
      paymentMethodBreakdown: paymentResults.map((r) => ({
        method: r.method,
        amount: r.amount ?? "0.00",
      })),
    };
  }

  private toDomain(entity: TypeOrmProviderPurchaseEntity): ProviderPurchase {
    return {
      id: entity.id,
      provider_name: entity.provider_name,
      amount: entity.amount,
      payment_method: entity.payment_method,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }
}
