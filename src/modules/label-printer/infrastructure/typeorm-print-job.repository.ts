import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryRunner, Repository } from "typeorm";
import {
  PrintJobRepositoryPort,
  CreatePrintJobInput,
} from "../application/print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { PrintJobEntity } from "./typeorm-print-job.entity";
import { DomainError } from "../../../shared/errors/domain.error";

@Injectable()
export class TypeOrmPrintJobRepository extends PrintJobRepositoryPort {
  constructor(
    @InjectRepository(PrintJobEntity)
    private readonly repo: Repository<PrintJobEntity>,
  ) {
    super();
  }

  async create(input: CreatePrintJobInput, runner?: QueryRunner): Promise<PrintJob> {
    const repo = runner?.manager.getRepository(PrintJobEntity) ?? this.repo;
    const entity = repo.create({
      product_id: input.product_id,
      sku: input.sku,
      product_name: input.product_name,
      sale_price: input.sale_price,
      idempotency_key: input.idempotency_key ?? null,
      source: input.source ?? null,
      status: "pending",
    });
    const saved = await repo.save(entity);
    return this.toDomain(saved);
  }

  async findByIdempotencyKey(key: string): Promise<PrintJob | null> {
    const entity = await this.repo.findOne({
      where: { idempotency_key: key },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findById(id: string): Promise<PrintJob | null> {
    const entity = await this.repo.findOne({
      where: { id },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findPending(): Promise<PrintJob[]> {
    const entities = await this.repo
      .createQueryBuilder("print_job")
      .where("print_job.status IN (:...statuses)", {
        statuses: ["pending", "failed"],
      })
      .orderBy("print_job.created_at", "ASC")
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async claimNext(
    installation: string,
    leaseMs: number,
  ): Promise<PrintJob | null> {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + leaseMs);

    // Atomically claim the oldest claimable job.
    // Candidates: pending, failed, or claimed with expired lease.
    // Superseded jobs are excluded — they are terminal and non-claimable.
    // Uses UPDATE ... RETURNING * so the caller receives the exact row
    // that was locked — no separate findOne that could return a wrong row.
    const result = await this.repo
      .createQueryBuilder()
      .update(PrintJobEntity)
      .set({
        status: "claimed",
        claimed_by: installation,
        claimed_at: now,
        lease_expires_at: leaseExpires,
      })
      .where(
        `id = (
              SELECT id FROM label_print_jobs
              WHERE status IN (:...pendingFailed)
                 OR (status = 'claimed' AND lease_expires_at < NOW())
              ORDER BY created_at ASC, id ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            )`,
        {
          pendingFailed: ["pending", "failed"],
        },
      )
      .andWhere(
        `(status IN (:...pendingFailed) OR (status = 'claimed' AND lease_expires_at < NOW()))`,
        {
          pendingFailed: ["pending", "failed"],
        },
      )
      .returning("*")
      .execute();

    if (!result.affected || result.affected === 0) {
      return null;
    }

    const raw = result.raw?.[0];
    return raw ? this.rowToDomain(raw) : null;
  }

  async complete(
    jobId: string,
    installation: string,
  ): Promise<PrintJob | null> {
    const now = new Date();

    const result = await this.repo
      .createQueryBuilder()
      .update(PrintJobEntity)
      .set({
        status: "completed",
        completed_at: now,
      })
      .where("id = :id", { id: jobId })
      .andWhere("status = :status", { status: "claimed" })
      .andWhere("claimed_by = :installation", { installation })
      .andWhere("lease_expires_at > NOW()")
      .execute();

    if (result.affected === 0) {
      return null;
    }

    const entity = await this.repo.findOne({ where: { id: jobId } });
    return entity ? this.toDomain(entity) : null;
  }

  async fail(
    jobId: string,
    installation: string,
    reason: string,
  ): Promise<PrintJob | null> {
    const now = new Date();

    const result = await this.repo
      .createQueryBuilder()
      .update(PrintJobEntity)
      .set({
        status: "failed",
        failed_at: now,
        fail_reason: reason,
      })
      .where("id = :id", { id: jobId })
      .andWhere("status = :status", { status: "claimed" })
      .andWhere("claimed_by = :installation", { installation })
      .andWhere("lease_expires_at > NOW()")
      .execute();

    if (result.affected === 0) {
      return null;
    }

    const entity = await this.repo.findOne({ where: { id: jobId } });
    return entity ? this.toDomain(entity) : null;
  }

  async expireLeases(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(PrintJobEntity)
      .set({
        status: "pending",
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
      })
      .where("status = :status", { status: "claimed" })
      .andWhere("lease_expires_at < NOW()")
      .execute();

    return result.affected ?? 0;
  }

  async claimBatch(
    installation: string,
    leaseMs: number,
    limit: number,
  ): Promise<PrintJob[]> {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + leaseMs);

    const raw = await this.repo.query(
      `WITH candidates AS (
         SELECT id FROM label_print_jobs
         WHERE status IN ('pending', 'failed')
            OR (status = 'claimed' AND lease_expires_at < NOW())
         ORDER BY created_at ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE label_print_jobs
       SET status = 'claimed',
           claimed_by = $2,
           claimed_at = $3,
           lease_expires_at = $4
       FROM candidates
       WHERE label_print_jobs.id = candidates.id
       RETURNING label_print_jobs.*`,
      [limit, installation, now, leaseExpires],
    );

    const rows = this.normalizeRawRows(raw);

    // Restore deterministic created_at ASC, id ASC ordering (RETURNING doesn't guarantee it)
    return rows
      .sort(
        (a, b) =>
          this.requiredDate(a.created_at, "created_at").getTime() -
            this.requiredDate(b.created_at, "created_at").getTime() ||
          String(a.id).localeCompare(String(b.id)),
      )
      .map((row) => this.rowToDomain(row));
  }

  async cancelPendingByProduct(
    productId: string,
    runner?: QueryRunner,
  ): Promise<number> {
    const repo = runner?.manager.getRepository(PrintJobEntity) ?? this.repo;

    const result = await repo
      .createQueryBuilder()
      .update(PrintJobEntity)
      .set({
        status: "superseded",
        failed_at: new Date(),
        fail_reason: "superseded",
      })
      .where("product_id = :productId", { productId })
      .andWhere("source = 'auto'")
      .andWhere(
        "(status IN (:...statuses) OR (status = 'claimed' AND lease_expires_at < NOW()))",
        { statuses: ["pending", "failed"] },
      )
      .execute();

    return result.affected ?? 0;
  }

  // ── Normalization & date hardening helpers ───────────────────────────

  /**
   * Normalizes the raw result from a PostgreSQL driver query into a row array.
   *
   * TypeORM's Repository.query() with the pg driver returns [rows[], rowCount]
   * for UPDATE...RETURNING queries. This helper detects that tuple shape and
   * extracts only the rows array. Flat row arrays (from mocks or other drivers)
   * are also accepted for backward compatibility.
   */
  private normalizeRawRows(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) {
      throw new DomainError(
        "claimBatch: expected array result from raw query, got " + typeof raw,
        "INFRASTRUCTURE_ERROR",
      );
    }

    // PostgreSQL pg driver tuple: [Record<string,unknown>[], number]
    if (
      raw.length === 2 &&
      Array.isArray(raw[0]) &&
      typeof raw[1] === "number"
    ) {
      return raw[0] as Record<string, unknown>[];
    }

    // Flat row array (mocks, other drivers, SELECT queries, empty)
    // Heuristic: first element is an object-like value (not an array)
    if (
      raw.length === 0 ||
      (typeof raw[0] === "object" && raw[0] !== null && !Array.isArray(raw[0]))
    ) {
      return raw as Record<string, unknown>[];
    }

    throw new DomainError(
      "claimBatch: unrecognized raw query result shape",
      "INFRASTRUCTURE_ERROR",
    );
  }

  /** Converts a raw value into a valid Date, throwing with the field name on failure. */
  private requiredDate(value: unknown, field: string): Date {
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new DomainError(
          `Invalid Date for required field ${field}`,
          "INFRASTRUCTURE_ERROR",
        );
      }
      return value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new DomainError(
          `Invalid Date for required field ${field}: ${String(value)}`,
          "INFRASTRUCTURE_ERROR",
        );
      }
      return d;
    }
    throw new DomainError(
      `Missing required field ${field}`,
      "INFRASTRUCTURE_ERROR",
    );
  }

  /** Converts a raw nullable value into a valid Date | null, throwing on invalid non-null. */
  private nullableDate(value: unknown, field: string): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new DomainError(
          `Invalid Date for field ${field}`,
          "INFRASTRUCTURE_ERROR",
        );
      }
      return value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new DomainError(
          `Invalid Date for field ${field}: ${String(value)}`,
          "INFRASTRUCTURE_ERROR",
        );
      }
      return d;
    }
    throw new DomainError(
      `Unexpected value type for field ${field}: ${typeof value}`,
      "INFRASTRUCTURE_ERROR",
    );
  }

  // ── Mapping helpers ──────────────────────────────────────────────────

  private toDomain(entity: PrintJobEntity): PrintJob {
    const job = new PrintJob();
    job.id = entity.id;
    job.product_id = entity.product_id;
    job.sku = entity.sku;
    job.product_name = entity.product_name;
    job.sale_price = entity.sale_price;
    job.status = entity.status as PrintJob["status"];
    job.claimed_by = entity.claimed_by;
    job.claimed_at = entity.claimed_at;
    job.lease_expires_at = entity.lease_expires_at;
    job.completed_at = entity.completed_at;
    job.failed_at = entity.failed_at;
    job.fail_reason = entity.fail_reason;
    job.idempotency_key = entity.idempotency_key;
    job.source = entity.source;
    job.created_at = entity.created_at;
    job.updated_at = entity.updated_at;
    return job;
  }

  /** Maps a raw row from UPDATE ... RETURNING * into a domain PrintJob. */
  private rowToDomain(raw: Record<string, unknown>): PrintJob {
    const job = new PrintJob();
    job.id = raw.id as string;
    job.product_id = raw.product_id as string;
    job.sku = raw.sku as string;
    job.product_name = raw.product_name as string;
    job.sale_price = raw.sale_price as string;
    job.status = raw.status as PrintJob["status"];
    job.claimed_by = (raw.claimed_by as string) ?? null;
    job.claimed_at = this.nullableDate(raw.claimed_at, "claimed_at");
    job.lease_expires_at = this.nullableDate(raw.lease_expires_at, "lease_expires_at");
    job.completed_at = this.nullableDate(raw.completed_at, "completed_at");
    job.failed_at = this.nullableDate(raw.failed_at, "failed_at");
    job.fail_reason = (raw.fail_reason as string) ?? null;
    job.idempotency_key = (raw.idempotency_key as string) ?? null;
    job.source = (raw.source as string) ?? null;
    job.created_at = this.requiredDate(raw.created_at, "created_at");
    job.updated_at = this.requiredDate(raw.updated_at, "updated_at");
    return job;
  }
}
