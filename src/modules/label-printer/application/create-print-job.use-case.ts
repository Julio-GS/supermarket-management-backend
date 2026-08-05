import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort, CreatePrintJobInput } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { ConflictError } from "../../../shared/errors/domain.error";

type ImmutablePayload = {
  product_id: string;
  sku: string;
  product_name: string;
  sale_price: string;
};

function toPayload(input: {
  product_id: string;
  sku: string;
  product_name: string;
  sale_price: string;
}): ImmutablePayload {
  return {
    product_id: input.product_id,
    sku: input.sku,
    product_name: input.product_name,
    sale_price: input.sale_price,
  };
}

function payloadsMatch(a: ImmutablePayload, b: ImmutablePayload): boolean {
  return (
    a.product_id === b.product_id &&
    a.sku === b.sku &&
    a.product_name === b.product_name &&
    a.sale_price === b.sale_price
  );
}

@Injectable()
export class CreatePrintJobUseCase {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  async execute(input: CreatePrintJobInput): Promise<PrintJob> {
    const key = input.idempotency_key;

    // No idempotency key: always create a new job
    if (!key) {
      return this.repo.create(input);
    }

    // Check if a job with this idempotency key already exists
    const existing = await this.repo.findByIdempotencyKey(key);
    if (existing) {
      const existingPayload = toPayload(existing);
      const incomingPayload = toPayload(input);
      if (payloadsMatch(existingPayload, incomingPayload)) {
        return existing;
      }
      throw new ConflictError(
        `A print job with idempotency_key "${key}" already exists with different payload`,
      );
    }

    // Try to insert. Handle PG 23505 race.
    try {
      return await this.repo.create(input);
    } catch (err: unknown) {
      if (!this.isDuplicateError(err)) {
        throw err;
      }
      // Race: another caller inserted the same key between our lookup and insert.
      // Re-read and compare payload.
      const raced = await this.repo.findByIdempotencyKey(key);
      if (!raced) {
        // Should not happen — the unique violation proves a row exists.
        throw new ConflictError(
          `A print job with idempotency_key "${key}" already exists`,
        );
      }
      const racedPayload = toPayload(raced);
      const incomingPayload = toPayload(input);
      if (payloadsMatch(racedPayload, incomingPayload)) {
        return raced;
      }
      throw new ConflictError(
        `A print job with idempotency_key "${key}" already exists with different payload`,
      );
    }
  }

  private isDuplicateError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as Record<string, unknown>).code === "23505"
    );
  }
}
