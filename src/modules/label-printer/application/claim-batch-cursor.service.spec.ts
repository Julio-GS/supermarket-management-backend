import { ConfigService } from "@nestjs/config";
import {
  ClaimBatchCursorService,
  ClaimBatchCursorPayloadV1,
} from "./claim-batch-cursor.service";
import { DomainError, ValidationError } from "../../../shared/errors/domain.error";

const SECRET = "x".repeat(64);

function configWith(secret: string | undefined): ConfigService {
  return {
    get: (key: string) =>
      key === "labelPrinter.claimCursorSecret" ? secret : undefined,
  } as unknown as ConfigService;
}

function payload(
  overrides: Partial<ClaimBatchCursorPayloadV1> = {},
): ClaimBatchCursorPayloadV1 {
  return {
    v: 1,
    installation: "caja-1",
    deadline_ms: Date.now() + 60_000,
    last_created_at: "2026-03-01T12:00:00.000Z",
    last_id: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

describe("ClaimBatchCursorService", () => {
  it("does not read the secret during construction (lazy/fail-closed)", () => {
    const get = jest.fn();
    new ClaimBatchCursorService({ get } as unknown as ConfigService);
    expect(get).not.toHaveBeenCalled();
  });

  it("signs an opaque base64url token with a dot separator", () => {
    const svc = new ClaimBatchCursorService(configWith(SECRET));
    const token = svc.sign(payload());
    expect(token.split(".")).toHaveLength(2);
    expect(token).not.toContain("installation");
    expect(token).not.toContain("caja-1");
  });

  it("round-trips a signed cursor back to the original payload", () => {
    const svc = new ClaimBatchCursorService(configWith(SECRET));
    const original = payload();
    expect(svc.verify(svc.sign(original))).toEqual(original);
  });

  it("rejects a tampered cursor", () => {
    const svc = new ClaimBatchCursorService(configWith(SECRET));
    const token = svc.sign(payload());
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(() => svc.verify(tampered)).toThrow(ValidationError);
  });

  it("rejects a cursor with an unknown version", () => {
    const svc = new ClaimBatchCursorService(configWith(SECRET));
    const bad = svc.sign(payload({ v: 2 as unknown as 1 }));
    expect(() => svc.verify(bad)).toThrow(ValidationError);
  });

  it("rejects a malformed cursor without a dot separator", () => {
    const svc = new ClaimBatchCursorService(configWith(SECRET));
    expect(() => svc.verify("no-dot-here")).toThrow(ValidationError);
  });

  it("fails closed (CONFIGURATION_ERROR) when the secret is missing", () => {
    const svc = new ClaimBatchCursorService(configWith(undefined));
    expect(() => svc.sign(payload())).toThrow(
      /LABEL_CLAIM_CURSOR_SECRET is required/,
    );
  });

  it("fails closed when the secret is shorter than 32 characters", () => {
    const svc = new ClaimBatchCursorService(configWith("short-secret"));
    expect(() => svc.sign(payload())).toThrow(
      /LABEL_CLAIM_CURSOR_SECRET is required/,
    );
  });

  it("fails verify (not only sign) when the secret is missing", () => {
    const svc = new ClaimBatchCursorService(configWith(undefined));
    expect(() => svc.verify("anything.at-all")).toThrow(
      new DomainError("LABEL_CLAIM_CURSOR_SECRET is required", "CONFIGURATION_ERROR"),
    );
  });
});
