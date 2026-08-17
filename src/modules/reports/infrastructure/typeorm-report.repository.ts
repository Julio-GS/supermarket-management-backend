import { Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import { ReportRepositoryPort } from "../application/report.repository.port";
import {
  FiscalReportGrouping,
  ReportAggregateData,
} from "../domain/report.entity";
import { Money } from "../../../shared/money/money.helper";
import type { PaymentMethod } from "../../sales/domain/sale.entity";


interface FiscalGroupingRow {
  issued_amount?: string | number | null;
  issued_count?: string | number | null;
  none_amount?: string | number | null;
  none_count?: string | number | null;
  incident_amount?: string | number | null;
  incident_count?: string | number | null;
}

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
    const [totalResult, paymentResult, topProductsResult, fiscalResult] =
      await Promise.all([
        this.queryTotalCollected(startsAt, endsAt),
        this.queryPaymentMethodBreakdown(startsAt, endsAt),
        this.queryTopProducts(startsAt, endsAt),
        this.queryFiscalGrouping(startsAt, endsAt),
      ]);
    return {
      totalCollectedAmount: totalResult ?? "0.00",
      paymentMethodBreakdown: paymentResult,
      topProducts: topProductsResult,
      fiscal: fiscalResult,
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
        "SUM(spm.amount::numeric)::text",
        "amount",
      )
      .from("sale_payment_methods", "spm")
      .innerJoin("sales", "sales", "sales.id = spm.sale_id")
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
  ): Promise<{ productId: string; detalle: string; units_sold: number }[]> {
    const results = await this.em
      .createQueryBuilder()
      .select("si.product_id", "productId")
      .addSelect("COALESCE(p.detalle, si.name, si.description, 'Ad-hoc item')", "detalle")
      .addSelect("SUM(si.quantity)::int", "units_sold")
      .from("sale_items", "si")
      .innerJoin("sales", "sales", "sales.id = si.sale_id")
      .leftJoin("products", "p", "p.id = si.product_id")
      .where("sales.created_at >= :startsAt", { startsAt })
      .andWhere("sales.created_at <= :endsAt", { endsAt })
      .groupBy("si.product_id")
      .addGroupBy("p.detalle")
      .addGroupBy("si.name")
      .addGroupBy("si.description")
      .orderBy("units_sold", "DESC")
      .getRawMany<{
        productId: string;
        detalle: string;
        units_sold: number;
      }>();

    return results.map((r) => ({
      productId: r.productId,
      detalle: r.detalle,
      units_sold: Number(r.units_sold) || 0,
    }));
  }

  private async queryFiscalGrouping(
    startsAt: Date,
    endsAt: Date,
  ): Promise<FiscalReportGrouping> {
    const row = await this.em
      .createQueryBuilder()
      .select(
        "COALESCE(SUM(CASE WHEN sales.invoice_status = 'issued' THEN sales.total ELSE 0 END), 0)::numeric(12,2)::text",
        "issued_amount",
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE sales.invoice_status = 'issued')::int",
        "issued_count",
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN sales.invoice_status = 'none' THEN sales.total ELSE 0 END), 0)::numeric(12,2)::text",
        "none_amount",
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE sales.invoice_status = 'none')::int",
        "none_count",
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN sales.invoice_status IN ('issuing', 'failed', 'ambiguous') THEN sales.total ELSE 0 END), 0)::numeric(12,2)::text",
        "incident_amount",
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE sales.invoice_status IN ('issuing', 'failed', 'ambiguous'))::int",
        "incident_count",
      )
      .from("sales", "sales")
      .where("sales.created_at >= :startsAt", { startsAt })
      .andWhere("sales.created_at <= :endsAt", { endsAt })
      .getRawOne<FiscalGroupingRow>();

    return this.mapFiscalGrouping(row);
  }

  private mapFiscalGrouping(row?: FiscalGroupingRow): FiscalReportGrouping {
    return {
      issued: {
        amount: this.formatAmount(row?.issued_amount),
        sale_count: this.toCount(row?.issued_count),
      },
      none: {
        amount: this.formatAmount(row?.none_amount),
        sale_count: this.toCount(row?.none_count),
      },
      incident: {
        amount: this.formatAmount(row?.incident_amount),
        sale_count: this.toCount(row?.incident_count),
      },
    };
  }

  private formatAmount(raw: unknown): string {
    return Money.toString(Money.parse(String(raw ?? "0")));
  }

  private toCount(raw: unknown): number {
    return Number(raw) || 0;
  }
}
