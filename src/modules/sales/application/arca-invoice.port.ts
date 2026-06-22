export interface ArcaVoucherInput {
  total: string;
  imp_neto: string;
  imp_iva: string;
  iva_buckets: {
    id: number;
    base_imp: string;
    importe: string;
  }[];
}

export interface ArcaInvoiceResult {
  cae: string;
  cae_vto: string;
  cbte_nro: number;
  cbte_tipo: 6;
  pto_vta: number;
}

export abstract class ArcaInvoicePort {
  abstract createFacturaBConsumidorFinal(
    input: ArcaVoucherInput,
  ): Promise<ArcaInvoiceResult>;
}
