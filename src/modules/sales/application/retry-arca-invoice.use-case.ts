import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import { SaleRepositoryPort } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { ArcaAlertPort } from "./arca-alert.port";
import { ArcaInvoiceResult } from "./arca-invoice.port";
import { Sale } from "../domain/sale.entity";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";

export interface RetryArcaInvoiceInput {
  sale_id: string;
  user_id: string;
}

export interface RetryArcaInvoiceResult {
  sale: Sale;
  retry_status: "issued" | "failed" | "already_issued" | "ambiguous" | "reconciliation_required";
  message: string;
}

interface ArcaConfigShape {
  enabled: boolean;
  mock: boolean;
  production: boolean;
  cuit: number;
  pto_vta: number;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Never include raw error bodies, PEM content, or stack traces in
    // client-facing retry messages.
    return `ARCA fiscal retry failed: ${error.name}`;
  }
  return "ARCA fiscal retry failed";
}

@Injectable()
export class RetryArcaInvoiceUseCase {
  private readonly logger = new Logger(RetryArcaInvoiceUseCase.name);

  constructor(
    private readonly sales: SaleRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly alertPort: ArcaAlertPort,
  ) {}

  async execute(input: RetryArcaInvoiceInput): Promise<RetryArcaInvoiceResult> {
    // ------------------------------------------------------------------
    // Guard: ARCA must be in real billing mode
    // ------------------------------------------------------------------
    const arcaConfig = this.configService.get<ArcaConfigShape>("arca");
    if (!arcaConfig?.enabled || arcaConfig?.mock) {
      throw new Error(
        "ARCA fiscal retry requires real billing mode (enabled=true, mock=false)",
      );
    }

    // ------------------------------------------------------------------
    // Phase 0: Quick read to determine current state (no lock)
    // ------------------------------------------------------------------
    const sale = await this.sales.findByIdForUser(input.sale_id, input.user_id);

    if (!sale) {
      throw new NotFoundError(
        `Sale ${input.sale_id} not found for the authenticated user`,
      );
    }

    if (sale.invoice_status === "issued") {
      return {
        sale,
        retry_status: "already_issued",
        message: "Invoice was already issued; no action taken",
      };
    }

    if (sale.invoice_status === "issuing" || sale.invoice_status === "ambiguous") {
      return {
        sale,
        retry_status: "reconciliation_required",
        message:
          "Sale is in an ambiguous fiscal state and requires manual reconciliation. " +
          "Contact support before retrying.",
      };
    }

    if (sale.invoice_status !== "failed") {
      throw new ValidationError(
        `Sale ${input.sale_id} is not in a retryable state (current: ${sale.invoice_status})`,
      );
    }

    // ------------------------------------------------------------------
    // Phase 1: Atomically claim the retry (failed → issuing)
    //
    // This transaction commits BEFORE the ARCA call so that a crash
    // after ARCA returns success cannot silently leave the sale as
    // `failed` and let a later retry issue a duplicate invoice.
    // ------------------------------------------------------------------
    const claimed = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        return this.sales.transitionInvoiceStatus(
          input.sale_id,
          input.user_id,
          "failed",
          "issuing",
          undefined,
          manager,
        );
      },
    );

    if (!claimed) {
      // Status changed between quick read and claim (race condition).
      // Re-read to determine current state without guessing.
      const current = await this.sales.findByIdForUser(
        input.sale_id,
        input.user_id,
      );

      if (!current) {
        throw new NotFoundError(
          `Sale ${input.sale_id} not found for the authenticated user`,
        );
      }

      if (current.invoice_status === "issued") {
        return {
          sale: current,
          retry_status: "already_issued",
          message: "Invoice was already issued; no action taken",
        };
      }

      if (
        current.invoice_status === "issuing" ||
        current.invoice_status === "ambiguous"
      ) {
        return {
          sale: current,
          retry_status: "reconciliation_required",
          message:
            "Sale is in an ambiguous fiscal state and requires manual reconciliation. " +
            "Contact support before retrying.",
        };
      }

      throw new ValidationError(
        `Sale ${input.sale_id} is not in a retryable state (current: ${current.invoice_status})`,
      );
    }

    // ------------------------------------------------------------------
    // Phase 2: Call ARCA (no DB lock held during external I/O)
    // ------------------------------------------------------------------
    const invoiceItems = (claimed.items ?? []).map((item) => ({
      line_total: item.subtotal,
      iva_rate: item.iva ?? "0",
    }));

    let invoiceResult: ArcaInvoiceResult;
    try {
      invoiceResult = await this.issueInvoice.issue(invoiceItems);
    } catch (error) {
      // Clear ARCA failure — rollback issuing → failed
      await this.dataSource.transaction(
        async (manager: EntityManager) => {
          await this.sales.transitionInvoiceStatus(
            input.sale_id,
            input.user_id,
            "issuing",
            "failed",
            undefined,
            manager,
          );
        },
      );

      this.alertPort.alertRetryFailed(input.sale_id, error);

      const failed = await this.sales.findByIdForUser(
        input.sale_id,
        input.user_id,
      );

      return {
        sale: failed!,
        retry_status: "failed",
        message: sanitizeError(error),
      };
    }

    // ------------------------------------------------------------------
    // Phase 3: Persist success (issuing → issued)
    // ------------------------------------------------------------------
    try {
      const issued = await this.dataSource.transaction(
        async (manager: EntityManager) => {
          return this.sales.transitionInvoiceStatus(
            input.sale_id,
            input.user_id,
            "issuing",
            "issued",
            {
              cae: invoiceResult.cae,
              cae_vto: invoiceResult.cae_vto,
              cbte_nro: invoiceResult.cbte_nro,
              cbte_tipo: invoiceResult.cbte_tipo,
              pto_vta: invoiceResult.pto_vta,
            },
            manager,
          );
        },
      );

      if (!issued) {
        // This should not happen under normal operation — the lock in
        // transitionInvoiceStatus would only return null if the status
        // changed concurrently. Treat as an ambiguous persistence failure.
        throw new Error(
          "Failed to persist issued status — sale was modified concurrently",
        );
      }

      return {
        sale: issued,
        retry_status: "issued",
        message: "Fiscal invoice issued successfully",
      };
    } catch (persistError) {
      // ------------------------------------------------------------------
      // ARCA accepted the voucher but we could not persist `issued`.
      // Best-effort: mark `ambiguous` so the sale is never retried
      // blindly.  If even the ambiguous mark fails, the sale remains
      // `issuing` which already blocks retry.
      // ------------------------------------------------------------------
      try {
        await this.dataSource.transaction(
          async (manager: EntityManager) => {
            await this.sales.transitionInvoiceStatus(
              input.sale_id,
              input.user_id,
              "issuing",
              "ambiguous",
              undefined,
              manager,
            );
          },
        );
      } catch {
        // Best-effort failed; `issuing` still blocks retry.
      }

      this.alertPort.alertRetryAmbiguous(
        input.sale_id,
        `ARCA issued CAE ${invoiceResult.cae} but local persistence failed after successful voucher acceptance`,
      );

      const ambiguous = await this.sales.findByIdForUser(
        input.sale_id,
        input.user_id,
      );

      return {
        sale: ambiguous!,
        retry_status: "ambiguous",
        message:
          "ARCA invoice was issued but local persistence failed. " +
          "Manual reconciliation required. Contact support.",
      };
    }
  }
}
