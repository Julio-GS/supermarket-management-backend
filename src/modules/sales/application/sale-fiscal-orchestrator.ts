import { Injectable, Logger } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { ResolvedSaleLine, FiscalResult } from "./create-sale.types";
import { SaleItemCreateData } from "./sale.repository.port";
import { Money } from "../../../shared/money/money.helper";
import { ValidationError } from "../../../shared/errors/domain.error";

export interface IssueFiscalInvoiceInput {
  invoiceRequested: boolean;
  saleItems: SaleItemCreateData[];
  resolvedLines: ResolvedSaleLine[];
  postPromotionSubtotal: Decimal;
  manualDiscountAmount: Decimal;
}

@Injectable()
export class SaleFiscalOrchestrator {
  private readonly logger = new Logger(SaleFiscalOrchestrator.name);

  constructor(private readonly issueInvoice: IssueArcaInvoiceUseCase) {}

  async issueIfRequested(input: IssueFiscalInvoiceInput): Promise<FiscalResult> {
    const {
      invoiceRequested,
      saleItems,
      resolvedLines,
      postPromotionSubtotal,
      manualDiscountAmount,
    } = input;

    if (!invoiceRequested) {
      return {
        invoiceStatus: "none",
        invoiceRequestedAt: null,
        fiscalFields: {
          cae: null,
          cae_vto: null,
          cbte_nro: null,
          cbte_tipo: null,
          pto_vta: null,
        },
      };
    }

    const invoiceRequestedAt = new Date();

    const invoiceItems = saleItems.map((si, idx) => {
      const line = resolvedLines[idx];
      let ivaRate: string;
      if (si.iva) {
        ivaRate = si.iva;
      } else if (line && line.kind !== "ad-hoc" && line.product.iva) {
        ivaRate = line.product.iva;
      } else {
        ivaRate = "21.00";
      }

      return {
        line_total: si.subtotal,
        iva_rate: ivaRate,
      };
    });

    const adjustedInvoiceItems = this.allocateManualDiscountAcrossInvoiceLines(
      invoiceItems,
      postPromotionSubtotal,
      manualDiscountAmount,
    );

    try {
      const invoiceResult = await this.issueInvoice.issue(adjustedInvoiceItems);
      return {
        invoiceStatus: "issued",
        invoiceRequestedAt,
        fiscalFields: {
          cae: invoiceResult.cae,
          cae_vto: invoiceResult.cae_vto,
          cbte_nro: invoiceResult.cbte_nro,
          cbte_tipo: invoiceResult.cbte_tipo,
          pto_vta: invoiceResult.pto_vta,
        },
      };
    } catch (error) {
      this.logger.error(
        `ARCA invoice issuance failed; checkout will complete without fiscal invoice`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        invoiceStatus: "failed",
        invoiceRequestedAt,
        fiscalFields: {
          cae: null,
          cae_vto: null,
          cbte_nro: null,
          cbte_tipo: null,
          pto_vta: null,
        },
      };
    }
  }

  private allocateManualDiscountAcrossInvoiceLines(
    lines: { line_total: string; iva_rate: string }[],
    subtotal: Decimal,
    discount: Decimal,
  ): { line_total: string; iva_rate: string }[] {
    if (discount.eq(0) || lines.length === 0) {
      return lines;
    }

    const finalTotal = subtotal.sub(discount);
    const adjusted: { line_total: string; iva_rate: string }[] = [];
    let allocated = Money.zero();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTotal = Money.parse(line.line_total);
      if (i === lines.length - 1) {
        const residual = finalTotal.sub(allocated);
        if (residual.lt(0)) {
          throw new ValidationError(
            "manual discount allocation produced a negative invoice line",
          );
        }
        adjusted.push({
          line_total: Money.toString(residual),
          iva_rate: line.iva_rate,
        });
      } else {
        const share = lineTotal
          .div(subtotal)
          .mul(discount)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineFinal = lineTotal.sub(share);
        allocated = allocated.add(lineFinal);
        adjusted.push({
          line_total: Money.toString(lineFinal),
          iva_rate: line.iva_rate,
        });
      }
    }

    return adjusted;
  }
}
