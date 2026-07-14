import { PricingMode } from "./special-product-codes";

export class Product {
  id!: string;
  detalle!: string;
  costo_neto!: string | null;
  costo_final!: string | null;
  iva!: string | null;
  cambio_costo!: string;
  cambio_precio!: string;
  etiqueta!: string;
  facturable!: boolean;
  maneja_stock!: boolean;
  codigos!: string[];
  pricing_mode!: PricingMode;
  is_protected!: boolean;
  created_at!: Date;
  updated_at!: Date;
}
