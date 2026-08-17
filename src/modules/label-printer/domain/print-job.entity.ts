export const PrintJobStatus = {
  PENDING: "pending",
  CLAIMED: "claimed",
  COMPLETED: "completed",
  FAILED: "failed",
  SUPERSEDED: "superseded",
  BLOCKED_FOR_REVIEW: "blocked_for_review",
} as const;

export type PrintJobStatus = (typeof PrintJobStatus)[keyof typeof PrintJobStatus];

export class LabelSnapshot {
  product_id!: string;
  sku!: string;
  product_name!: string;
  sale_price!: string;
}

export class PrintJob {
  id!: string;
  product_id!: string;
  sku!: string;
  product_name!: string;
  sale_price!: string;
  status: PrintJobStatus = PrintJobStatus.PENDING;
  claimed_by!: string | null;
  claimed_at!: Date | null;
  lease_expires_at!: Date | null;
  completed_at!: Date | null;
  failed_at!: Date | null;
  fail_reason!: string | null;
  blocked_reason!: string | null;
  blocked_by!: string | null;
  blocked_at!: Date | null;
  idempotency_key!: string | null;
  source: string | null = null;
  created_at!: Date;
  updated_at!: Date;
}
