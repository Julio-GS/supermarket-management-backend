export const productProjection = {
  list: [
    "id",
    "detalle",
    "costo_neto",
    "costo_final",
    "iva",
    "cambio_costo",
    "cambio_precio",
    "etiqueta",
    "facturable",
    "maneja_stock",
    "created_at",
    "updated_at",
  ],
  detail: ["*"] as const,
} as const;

export const saleProjection = {
  list: [
    "id",
    "user_id",
    "total",
    "invoice_status",
    "cae",
    "cae_vto",
    "cbte_nro",
    "cbte_tipo",
    "pto_vta",
    "invoice_requested_at",
    "created_at",
    "updated_at",
  ],
  detail: ["*"] as const,
} as const;
