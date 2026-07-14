import { Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { Money } from "../../../shared/money/money.helper";
import { ValidationError } from "../../../shared/errors/domain.error";
import {
  ArcaInvoicePort,
  ArcaVoucherInput,
  ArcaInvoiceResult,
} from "./arca-invoice.port";

export interface InvoiceableItem {
  line_total: string;
  iva_rate: string;
}

const IVA_RATE_TO_ARCA_ID: Record<string, number> = {
  "0": 3,
  "0.00": 3,
  "10.5": 4,
  "10.50": 4,
  "21": 5,
  "21.00": 5,
  "27": 6,
  "27.00": 6,
  "5": 7,
  "5.00": 7,
  "2.5": 8,
  "2.50": 8,
};

function ivaRateKey(rate: string): string {
  return Money.toString(Money.parse(rate));
}

function mapIvaRateToArcaId(rate: string): number {
  const id = IVA_RATE_TO_ARCA_ID[ivaRateKey(rate)];
  if (id === undefined) {
    throw new ValidationError(
      `Unsupported IVA rate for ARCA invoicing: ${rate}`,
    );
  }
  return id;
}

@Injectable()
export class IssueArcaInvoiceUseCase {
  constructor(private readonly arcaInvoice: ArcaInvoicePort) {}

  async issue(items: InvoiceableItem[]): Promise<ArcaInvoiceResult> {
    if (!items || items.length === 0) {
      throw new ValidationError("Cannot issue an invoice for an empty sale");
    }

    let total = Money.zero();
    let impNeto = Money.zero();
    let impIva = Money.zero();
    const bucketMap = new Map<
      number,
      { id: number; baseImp: Decimal; importe: Decimal }
    >();

    for (const item of items) {
      const { line_total, iva_rate } = item;

      const lineFinal = Money.parse(line_total);
      const ivaRate = Money.parse(iva_rate);

      // net = total / (1 + rate/100)
      const divisor = Money.add(new Decimal(1), Money.parse(iva_rate).div(100));
      const lineNet = lineFinal.div(divisor);
      const lineIva = lineFinal.sub(lineNet);

      total = Money.add(total, lineFinal);
      impNeto = Money.add(impNeto, lineNet);
      impIva = Money.add(impIva, lineIva);

      const ivaId = mapIvaRateToArcaId(iva_rate);
      const existing = bucketMap.get(ivaId);
      if (existing) {
        existing.baseImp = Money.add(existing.baseImp, lineNet);
        existing.importe = Money.add(existing.importe, lineIva);
      } else {
        bucketMap.set(ivaId, {
          id: ivaId,
          baseImp: lineNet,
          importe: lineIva,
        });
      }
    }

    const ivaBuckets = Array.from(bucketMap.values()).map((bucket) => ({
      id: bucket.id,
      base_imp: Money.toString(bucket.baseImp),
      importe: Money.toString(bucket.importe),
    }));

    const input: ArcaVoucherInput = {
      total: Money.toString(total),
      imp_neto: Money.toString(impNeto),
      imp_iva: Money.toString(impIva),
      iva_buckets: ivaBuckets,
    };

    return this.arcaInvoice.createFacturaBConsumidorFinal(input);
  }
}
