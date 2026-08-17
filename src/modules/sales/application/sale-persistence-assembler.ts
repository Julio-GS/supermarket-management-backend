import { Money } from "../../../shared/money/money.helper";
import {
  PaymentMethodAllocation,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";
import {
  FiscalResult,
  PricingResult,
} from "./create-sale.types";
import { SaleCreateInput } from "./sale.repository.port";

export interface AssembleSaleInput {
  userId: string;
  pricing: PricingResult;
  paymentMethods: PaymentMethodAllocation[];
  splitTicketGroups: SaleSplitTicketGroupInput[] | null;
  fiscal: FiscalResult;
}

export class SalePersistenceAssembler {
  assemble(input: AssembleSaleInput): SaleCreateInput {
    return {
      user_id: input.userId,
      items: input.pricing.saleItems,
      payment_methods: input.paymentMethods,
      split_ticket_groups: input.splitTicketGroups,
      total: Money.toString(input.pricing.finalTotal),
      manual_discount_amount: Money.toString(input.pricing.manualDiscount.amount),
      manual_discount_modality: input.pricing.manualDiscount.modality,
      manual_discount_percentage: input.pricing.manualDiscount.percentage,
      invoice_status: input.fiscal.invoiceStatus,
      cae: input.fiscal.fiscalFields.cae,
      cae_vto: input.fiscal.fiscalFields.cae_vto,
      cbte_nro: input.fiscal.fiscalFields.cbte_nro,
      cbte_tipo: input.fiscal.fiscalFields.cbte_tipo,
      pto_vta: input.fiscal.fiscalFields.pto_vta,
      invoice_requested_at: input.fiscal.invoiceRequestedAt,
    };
  }
}
