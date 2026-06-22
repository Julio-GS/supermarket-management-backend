import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Arca } from "@arcasdk/core";
import {
  ArcaInvoicePort,
  ArcaVoucherInput,
  ArcaInvoiceResult,
} from "../application/arca-invoice.port";

interface ArcaConfig {
  enabled: boolean;
  mock: boolean;
  production: boolean;
  cuit: number;
  pto_vta: number;
  cert: string;
  key: string;
  ticketPath: string | undefined;
  useHttpsAgent: boolean;
}

function formatArcaDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function mockVtoDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return formatArcaDate(date);
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

@Injectable()
export class ArcaInvoiceAdapter extends ArcaInvoicePort {
  private readonly logger = new Logger(ArcaInvoiceAdapter.name);
  private readonly arca: Arca | null = null;
  private readonly config: ArcaConfig;

  constructor(configService: ConfigService) {
    super();
    this.config = configService.getOrThrow<ArcaConfig>("arca");

    if (this.config.enabled && !this.config.mock) {
      // cert and key are passed as raw multiline PEM strings; no base64 decoding
      // is performed. ticketPath and useHttpsAgent are forwarded from config.
      this.arca = new Arca({
        cuit: this.config.cuit,
        cert: this.config.cert,
        key: this.config.key,
        production: this.config.production,
        ticketPath: this.config.ticketPath,
        useHttpsAgent: this.config.useHttpsAgent,
      });
    }
  }

  async createFacturaBConsumidorFinal(
    input: ArcaVoucherInput,
  ): Promise<ArcaInvoiceResult> {
    if (!this.config.enabled) {
      throw new Error("ARCA invoicing is not enabled");
    }

    if (this.config.mock) {
      this.logger.debug(
        `ARCA mock invoice issued for total=${input.total} net=${input.imp_neto} iva=${input.imp_iva}`,
      );

      return {
        cae: "MOCKCAE12345678",
        cae_vto: mockVtoDate(),
        cbte_nro: 1,
        cbte_tipo: 6,
        pto_vta: this.config.pto_vta,
      };
    }

    if (!this.arca) {
      throw new Error("ARCA invoicing is not enabled");
    }

    const voucher = {
      CantReg: 1,
      PtoVta: this.config.pto_vta,
      CbteTipo: 6,
      Concepto: 1,
      DocTipo: 99,
      DocNro: 0,
      CbteFch: formatArcaDate(new Date()),
      ImpTotal: parseFloat(input.total),
      ImpTotConc: 0,
      ImpNeto: parseFloat(input.imp_neto),
      ImpOpEx: 0,
      ImpIVA: parseFloat(input.imp_iva),
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      Iva: input.iva_buckets.map((bucket) => ({
        Id: bucket.id,
        BaseImp: parseFloat(bucket.base_imp),
        Importe: parseFloat(bucket.importe),
      })),
      // V1 only supports Consumidor Final / Factura B.
      CondicionIVAReceptorId: 2,
    };

    this.logger.debug(
      `Creating ARCA voucher: ${stringifySafe({
        production: this.config.production,
        pto_vta: this.config.pto_vta,
        cbte_tipo: voucher.CbteTipo,
        doc_tipo: voucher.DocTipo,
        doc_nro: voucher.DocNro,
        total: voucher.ImpTotal,
        imp_neto: voucher.ImpNeto,
        imp_iva: voucher.ImpIVA,
        iva_bucket_count: voucher.Iva.length,
        ticket_path: this.config.ticketPath ?? null,
        use_https_agent: this.config.useHttpsAgent,
      })}`,
    );

    let result: Awaited<
      ReturnType<typeof this.arca.electronicBillingService.createNextVoucher>
    >;
    try {
      result = await this.arca.electronicBillingService.createNextVoucher(voucher);
    } catch (error) {
      const err = error as Error & { cause?: unknown; response?: unknown };
      this.logger.error(
        `ARCA createNextVoucher failed: ${stringifySafe({
          name: err.name,
          message: err.message,
          cause: err.cause,
          response: err.response,
          production: this.config.production,
          pto_vta: this.config.pto_vta,
          cbte_tipo: voucher.CbteTipo,
          ticket_path: this.config.ticketPath ?? null,
          cert_metadata: {
            length: this.config.cert.length,
            has_certificate_header: this.config.cert.includes(
              "-----BEGIN CERTIFICATE-----",
            ),
            has_certificate_footer: this.config.cert.includes(
              "-----END CERTIFICATE-----",
            ),
            newline_count: (this.config.cert.match(/\n/g) ?? []).length,
          },
          key_metadata: {
            length: this.config.key.length,
            has_private_key_header:
              this.config.key.includes("-----BEGIN PRIVATE KEY-----") ||
              this.config.key.includes("-----BEGIN RSA PRIVATE KEY-----"),
            has_private_key_footer:
              this.config.key.includes("-----END PRIVATE KEY-----") ||
              this.config.key.includes("-----END RSA PRIVATE KEY-----"),
            newline_count: (this.config.key.match(/\n/g) ?? []).length,
          },
        })}`,
        err.stack,
      );
      throw err;
    }

    this.logger.debug(
      `ARCA createNextVoucher response: ${stringifySafe(result.response)}`,
    );

    const detail = result.response?.FeDetResp?.FECAEDetResponse?.[0];
    if (!detail || detail.Resultado !== "A") {
      this.logger.error(
        `ARCA invoice was rejected: ${stringifySafe(result.response)}`,
      );
      throw new Error(
        `ARCA invoice was not accepted: ${JSON.stringify(result.response)}`,
      );
    }

    return {
      cae: result.cae,
      cae_vto: result.caeFchVto,
      cbte_nro: detail.CbteDesde,
      cbte_tipo: 6,
      pto_vta: this.config.pto_vta,
    };
  }
}
