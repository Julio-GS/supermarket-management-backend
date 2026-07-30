import { Injectable, Logger } from "@nestjs/common";
import { ArcaAlertPort } from "../application/arca-alert.port";

const PEM_PATTERNS = [
  /-----BEGIN CERTIFICATE-----/,
  /-----BEGIN PRIVATE KEY-----/,
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN EC PRIVATE KEY-----/,
  /-----BEGIN DSA PRIVATE KEY-----/,
  /-----BEGIN ENCRYPTED PRIVATE KEY-----/,
];

function containsPEM(value: string): boolean {
  return PEM_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeForAlert(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const sanitized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const withExtra = error as Error & {
      cause?: unknown;
      response?: unknown;
    };
    if (withExtra.cause !== undefined) {
      sanitized.cause =
        typeof withExtra.cause === "string"
          ? containsPEM(withExtra.cause)
            ? "[cause redacted — PEM content]"
            : withExtra.cause
          : "[non-string cause]";
    }
    if (withExtra.response !== undefined) {
      sanitized.response = "[response redacted]";
    }
    return sanitized;
  }
  return { error: "unknown" };
}

@Injectable()
export class ArcaLoggerAlertAdapter extends ArcaAlertPort {
  private readonly logger = new Logger(ArcaLoggerAlertAdapter.name);

  alertRetryFailed(saleId: string, error: unknown): void {
    this.logger.error({
      event_code: "FISCAL_ARCA_RETRY_FAILED",
      sale_id: saleId,
      error: sanitizeForAlert(error),
    });
  }

  alertRetryAmbiguous(saleId: string, reason: string): void {
    this.logger.error({
      event_code: "FISCAL_ARCA_RETRY_AMBIGUOUS",
      sale_id: saleId,
      reason,
    });
  }
}
