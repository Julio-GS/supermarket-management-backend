import { QueryRunner } from "typeorm";

export interface ProductCreateIdempotencyRecord {
  id: string;
  idempotency_key: string;
  payload_version: number;
  payload_hash: string;
  product_id: string | null;
  label_job_id: string | null;
  response_status: number;
  response_body: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIdempotencyInput {
  idempotencyKey: string;
  payloadVersion: number;
  payloadHash: string;
  productId: string | null;
  labelJobId: string | null;
  responseBody: Record<string, unknown>;
}

export abstract class ProductCreateIdempotencyRepositoryPort {
  abstract findByKey(
    idempotencyKey: string,
    runner?: QueryRunner,
  ): Promise<ProductCreateIdempotencyRecord | null>;

  abstract create(
    input: CreateIdempotencyInput,
    runner?: QueryRunner,
  ): Promise<ProductCreateIdempotencyRecord>;
}
