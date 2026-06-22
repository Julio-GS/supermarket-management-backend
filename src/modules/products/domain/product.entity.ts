export class Product {
  id!: string;
  detalle!: string;
  costo_neto!: string;
  costo_final!: string;
  iva!: string;
  cambio_costo!: string;
  cambio_precio!: string;
  etiqueta!: string;
  facturable!: boolean;
  maneja_stock!: boolean;
  codigos!: string[];
  created_at!: Date;
  updated_at!: Date;
}
