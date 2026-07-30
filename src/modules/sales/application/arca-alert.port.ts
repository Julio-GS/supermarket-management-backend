export abstract class ArcaAlertPort {
  /**
   * Emitted when a fiscal retry fails with a clear ARCA rejection/error.
   * The sale is transitioned back to `failed` and remains retryable.
   * Implementations MUST sanitize error details before persisting/forwarding.
   */
  abstract alertRetryFailed(saleId: string, error: unknown): void;

  /**
   * Emitted when ARCA accepted the voucher but local persistence failed,
   * leaving the sale in an ambiguous state that requires manual reconciliation.
   * Implementations MUST sanitize any ARCA response details.
   */
  abstract alertRetryAmbiguous(saleId: string, reason: string): void;
}
