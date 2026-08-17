import { registerAs } from "@nestjs/config";

/**
 * Label printer configuration.
 *
 * `LABEL_CLAIM_CURSOR_SECRET` is intentionally NOT validated here. The
 * continuation cursor service reads it lazily and fails closed only when the
 * continuation operation is actually used, so a missing or weak secret must
 * never break application startup or the legacy raw-array claim endpoint.
 */
export const labelPrinterConfig = registerAs("labelPrinter", () => ({
  claimCursorSecret: process.env.LABEL_CLAIM_CURSOR_SECRET,
}));
