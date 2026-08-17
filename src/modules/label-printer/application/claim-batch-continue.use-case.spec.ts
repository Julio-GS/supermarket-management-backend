import { ConfigService } from "@nestjs/config";
import { ClaimBatchContinueUseCase } from "./claim-batch-continue.use-case";
import {
  ClaimBatchCursorService,
  ClaimBatchCursorPayloadV1,
} from "./claim-batch-cursor.service";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { ConflictError, ValidationError } from "../../../shared/errors/domain.error";

const SECRET = "x".repeat(64);

function makeSvc(secret = SECRET): ClaimBatchCursorService {
  return new ClaimBatchCursorService({
    get: (k: string) =>
      k === "labelPrinter.claimCursorSecret" ? secret : undefined,
  } as unknown as ConfigService);
}

function job(id: string, createdAt = new Date("2026-03-01T12:00:00Z")): PrintJob {
  return Object.assign(new PrintJob(), {
    id,
    product_id: "p1",
    sku: "SKU",
    product_name: "P",
    sale_price: "10.00",
    status: "claimed",
    claimed_by: "caja-1",
    lease_expires_at: new Date("2026-03-01T12:00:00Z"),
    created_at: createdAt,
    updated_at: createdAt,
  });
}

function cursor(
  svc: ClaimBatchCursorService,
  overrides: Partial<ClaimBatchCursorPayloadV1> = {},
): string {
  return svc.sign({
    v: 1,
    installation: "caja-1",
    deadline_ms: Date.now() + 60_000,
    last_created_at: "2026-03-01T12:00:00.000Z",
    last_id: "j1",
    ...overrides,
  });
}

describe("ClaimBatchContinueUseCase", () => {
  let useCase: ClaimBatchContinueUseCase;
  let svc: ClaimBatchCursorService;
  let repo: jest.Mocked<PrintJobRepositoryPort>;

  beforeEach(() => {
    svc = makeSvc();
    repo = {
      create: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      findPending: jest.fn(),
      claimNext: jest.fn(),
      claimBatch: jest.fn(),
      claimBatchContinuing: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      expireLeases: jest.fn(),
      cancelPendingByProduct: jest.fn(),
    } as any;
    useCase = new ClaimBatchContinueUseCase(repo, svc);
  });

  it("first page requires lease_seconds", async () => {
    await expect(useCase.execute({ installation: "caja-1" })).rejects.toThrow(
      /lease_seconds must be an integer between 1 and 300/,
    );
  });

  it("first page defaults limit to 45 and derives the flow deadline from lease_seconds", async () => {
    repo.claimBatchContinuing.mockResolvedValue({ jobs: [job("j1")], hasMore: false });
    const before = Date.now();
    const result = await useCase.execute({ installation: "caja-1", lease_seconds: 60 });
    const after = Date.now();

    const arg = repo.claimBatchContinuing.mock.calls[0][0];
    expect(arg.limit).toBe(45);
    expect(arg.installation).toBe("caja-1");
    expect(arg.after).toBeNull();
    expect(arg.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(arg.leaseExpiresAt.getTime()).toBeLessThanOrEqual(after + 60_000);
    expect(result).toEqual({ jobs: [job("j1")], next_cursor: null, has_more: false });
  });

  it("validates limit bounds 1..45", async () => {
    await expect(
      useCase.execute({ installation: "caja-1", lease_seconds: 60, limit: 0 }),
    ).rejects.toThrow(/limit must be an integer between 1 and 45/);
    await expect(
      useCase.execute({ installation: "caja-1", lease_seconds: 60, limit: 46 }),
    ).rejects.toThrow(/limit must be an integer between 1 and 45/);
  });

  it("rejects lease_seconds on continuation", async () => {
    const token = cursor(svc);
    await expect(
      useCase.execute({ installation: "caja-1", cursor: token, lease_seconds: 60 }),
    ).rejects.toThrow("lease_seconds must not be provided on continuation");
  });

  it("rejects a cursor bound to a different installation", async () => {
    const token = cursor(svc, { installation: "caja-A" });
    await expect(
      useCase.execute({ installation: "caja-B", cursor: token }),
    ).rejects.toThrow("cursor installation mismatch");
  });

  it("rejects an expired flow deadline with ConflictError", async () => {
    const token = cursor(svc, { deadline_ms: Date.now() - 1000 });
    await expect(
      useCase.execute({ installation: "caja-1", cursor: token }),
    ).rejects.toThrow(ConflictError);
    await expect(
      useCase.execute({ installation: "caja-1", cursor: token }),
    ).rejects.toThrow("flow lease expired");
  });

  it("rejects a tampered cursor with ValidationError", async () => {
    const token = cursor(svc);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    await expect(
      useCase.execute({ installation: "caja-1", cursor: tampered }),
    ).rejects.toThrow(ValidationError);
  });

  it("builds next_cursor from the last returned job and keeps the deadline immutable", async () => {
    const first = job("j45");
    const second = job("j46", new Date("2026-03-01T13:00:00Z"));
    repo.claimBatchContinuing.mockResolvedValueOnce({ jobs: [first], hasMore: true });
    const r1 = await useCase.execute({ installation: "caja-1", lease_seconds: 60 });
    expect(r1.has_more).toBe(true);
    expect(r1.next_cursor).toBeTruthy();

    repo.claimBatchContinuing.mockResolvedValueOnce({ jobs: [second], hasMore: false });
    const r2 = await useCase.execute({ installation: "caja-1", cursor: r1.next_cursor });

    const call1 = repo.claimBatchContinuing.mock.calls[0][0];
    const call2 = repo.claimBatchContinuing.mock.calls[1][0];
    expect(call2.leaseExpiresAt.getTime()).toBe(call1.leaseExpiresAt.getTime());
    expect(call2.after).toEqual({ created_at: first.created_at, id: first.id });
    expect(r2.next_cursor).toBeNull();
    expect(r2.has_more).toBe(false);
  });

  it("throws ConflictError when the repository reports hasMore with zero jobs", async () => {
    repo.claimBatchContinuing.mockResolvedValue({ jobs: [], hasMore: true });
    await expect(
      useCase.execute({ installation: "caja-1", lease_seconds: 60 }),
    ).rejects.toThrow(ConflictError);
  });
});
