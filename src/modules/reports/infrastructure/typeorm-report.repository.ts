import { Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import { ReportRepositoryPort } from "../application/report.repository.port";
import { ReportAggregateData } from "../domain/report.entity";
import { PaymentMethod } from "../../sales/domain/sale.entity";

@Injectable()
export class TypeOrmReportRepository extends ReportRepositoryPort {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {
    super();
  }

  async getBusinessReport(
    startsAt: Date,
    endsAt: Date,
  ): Promise<ReportAggregateData> {
    const [totalResult, paymentResult, topProductsResult] = await Promise.all([
      this.queryTotalCollected(startsAt, endsAt),
      this.queryPaymentMethodBreakdown(startsAt, endsAt),
      this.queryTopProducts(startsAt, endsAt),
    ]);

    return {
      totalCollectedAmount: totalResult ?? "0.00",
      paymentMethodBreakdown: paymentResult,
      topProducts: topProductsResult,
    };
  }

  private async queryTotalCollected(
    startsAt: Date,
    endsAt: Date,
  ): Promise<string> {
    const result = await this.em
      .createQueryBuilder()
      .select("COALESCE(SUM(sales.total), '0')", "amount")
      .from("sales", "sales")
      .where("sales.created_at >= :startsAt", { startsAt })
      .andWhere("sales.created_at <= :endsAt", { endsAt })
      .getRawOne<{ amount: string }>();

    return result?.amount ?? "0.00";
  }

  private async queryPaymentMethodBreakdown(
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ method: PaymentMethod; amount: string }[]> {
    const results = await this.em
      .createQueryBuilder()
      .select("spm.method", "method")
      .addSelect(
        "SUM(sales.total::numeric / COALESCE(pmc.method_count, 1))::text",
        "amount",
      )
      .from("sales", "sales")
      .innerJoin("sale_payment_methods", "spm", "spm.sale_id = sales.id")
      .innerJoin(
        (subQuery) =>
          subQuery
            .select("spm2.sale_id", "sale_id")
            .addSelect("COUNT(*)::int", "method_count")
            .from("sale_payment_methods", "spm2")
            .groupBy("spm2.sale_id"),
        "pmc",
        "pmc.sale_id = sales.id",
      )
      .where("sales.created_at >= :startsAt", { startsAt })
      .andWhere("sales.created_at <= :endsAt", { endsAt })
      .groupBy("spm.method")
      .orderBy("amount", "DESC")
      .getRawMany<{ method: string; amount: string }>();

    return results.map((r) => ({
      method: r.method as PaymentMethod,
      amount: r.amount ?? "0.00",
    }));
  }

  private async queryTopProducts(
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ productId: string; detalle: string; unitsSold: number }[]> {
    const results = await this.em
      .createQueryBuilder()
      .select("si.product_id", "productId")
      .addSelect("p.detalle", "detalle")
      .addSelect("SUM(si.quantity)::int", "unitsSold")
      .from("sale_items", "si")
      .innerJoin("sales", "sales", "sales.id = si.sale_id")
      .innerJoin("products", "p", "p.id = si.product_id")
      .where("sales.created_at >= :startsAt", { startsAt })
      .andWhere("sales.created_at <= :endsAt", { endsAt })
      .groupBy("si.product_id")
      .addGroupBy("p.detalle")
      .orderBy("unitsSold", "DESC")
      .getRawMany<{
        productId: string;
        detalle: string;
        unitsSold: number;
      }>();

    return results.map((r) => ({
      productId: r.productId,
      detalle: r.detalle,
      unitsSold: Number(r.unitsSold) || 0,
    }));
  }
}
