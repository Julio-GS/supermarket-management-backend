import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { DomainError, ValidationError } from "../../../shared/errors/domain.error";

export interface ClaimBatchCursorPayloadV1 {
  v: 1;
  installation: string;
  deadline_ms: number;
  last_created_at: string;
  last_id: string;
}

const MIN_SECRET_LENGTH = 32;

@Injectable()
export class ClaimBatchCursorService {
  constructor(private readonly config: ConfigService) {}

  /** Lazy, fail-closed: the secret is read only when signing/verifying. */
  private get secret(): string {
    const secret = this.config.get<string>("labelPrinter.claimCursorSecret");
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new DomainError(
        "LABEL_CLAIM_CURSOR_SECRET is required",
        "CONFIGURATION_ERROR",
      );
    }
    return secret;
  }

  sign(payload: ClaimBatchCursorPayloadV1): string {
    const secret = this.secret;
    const payloadPart = encodeJson(payload);
    return `${payloadPart}.${signPart(payloadPart, secret)}`;
  }

  verify(cursor: string): ClaimBatchCursorPayloadV1 {
    const secret = this.secret;
    const parts = cursor.split(".");
    if (parts.length !== 2) {
      throw new ValidationError("invalid cursor");
    }

    const [payloadPart, signaturePart] = parts;
    if (!safeEqual(signPart(payloadPart, secret), signaturePart)) {
      throw new ValidationError("invalid cursor");
    }

    const payload = decodeJson(payloadPart);
    if (!isValidPayload(payload)) {
      throw new ValidationError("invalid cursor");
    }
    return payload;
  }
}

function signPart(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart, "utf8").digest("base64url");
}

function safeEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeJson(payload: ClaimBatchCursorPayloadV1): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeJson(part: string): unknown {
  let raw: string;
  try {
    raw = Buffer.from(part, "base64url").toString("utf8");
  } catch {
    throw new ValidationError("invalid cursor");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("invalid cursor");
  }
}

function isValidPayload(value: unknown): value is ClaimBatchCursorPayloadV1 {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.installation === "string" &&
    p.installation.length > 0 &&
    typeof p.deadline_ms === "number" &&
    Number.isFinite(p.deadline_ms) &&
    typeof p.last_created_at === "string" &&
    p.last_created_at.length > 0 &&
    typeof p.last_id === "string" &&
    p.last_id.length > 0
  );
}
