import { registerAs } from "@nestjs/config";
import { readFileSync } from "fs";

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

function normalizePem(value: string): string {
  // Local .env files may contain escaped \n sequences, CRLF line endings, or
  // bare carriage returns. The SDK needs LF-separated PEM, so normalize all of
  // them while keeping the values as plain text (not base64-decoded).
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}

interface PemSource {
  value: string;
  source: "env" | "path";
}

function readPemFile(path: string, label: string): PemSource {
  try {
    const content = readFileSync(path, "utf8");
    return { value: normalizePem(content), source: "path" };
  } catch (error) {
    throw new Error(
      `Failed to read ${label} from "${path}": ${(error as Error).message}`,
    );
  }
}

function loadPem(
  envValue: string | undefined,
  pathValue: string | undefined,
  label: string,
): PemSource | undefined {
  if (envValue !== undefined && envValue.trim() !== "") {
    const normalized = normalizePem(envValue);
    if (normalized.includes("-----BEGIN")) {
      return { value: normalized, source: "env" };
    }
    // The SDK docs say cert/key may be a path. If the env value does not look
    // like PEM but looks like a path, read it from disk ourselves because the
    // compiled SDK does not actually read files for us.
    if (
      envValue.includes("/") ||
      envValue.includes("\\") ||
      envValue.endsWith(".crt") ||
      envValue.endsWith(".key") ||
      envValue.endsWith(".pem")
    ) {
      return readPemFile(envValue, label);
    }
  }

  if (pathValue !== undefined && pathValue.trim() !== "") {
    return readPemFile(pathValue, label);
  }

  return undefined;
}

function logCredentialDiagnostics(params: {
  cert: PemSource | undefined;
  key: PemSource | undefined;
  ticketPath: string | undefined;
}): void {
  // Safe metadata only; never log PEM content or paths that could contain secrets.
  const certMeta = params.cert
    ? {
        source: params.cert.source,
        length: params.cert.value.length,
        hasBeginHeader: params.cert.value.includes(
          "-----BEGIN CERTIFICATE-----",
        ),
        hasEndHeader: params.cert.value.includes("-----END CERTIFICATE-----"),
        newlineCount: params.cert.value.split("\n").length - 1,
      }
    : { present: false };

  const keyMeta = params.key
    ? {
        source: params.key.source,
        length: params.key.value.length,
        hasBeginHeader:
          params.key.value.includes("-----BEGIN PRIVATE KEY-----") ||
          params.key.value.includes("-----BEGIN RSA PRIVATE KEY-----"),
        hasEndHeader:
          params.key.value.includes("-----END PRIVATE KEY-----") ||
          params.key.value.includes("-----END RSA PRIVATE KEY-----"),
        newlineCount: params.key.value.split("\n").length - 1,
      }
    : { present: false };

  console.log(
    `[ARCA] Credential diagnostics (metadata only): cert=${JSON.stringify(
      certMeta,
    )} key=${JSON.stringify(keyMeta)} ticketPath=${params.ticketPath ?? "default"}`,
  );
}

function validateEnabledConfig(params: {
  cuit: string | undefined;
  pto_vta: string | undefined;
  cert: PemSource | undefined;
  key: PemSource | undefined;
  mock: boolean;
}): void {
  const missing: string[] = [];
  if (!params.cuit) missing.push("ARCA_CUIT");
  if (!params.pto_vta) missing.push("ARCA_PTO_VTA");
  if (!params.mock) {
    if (!params.cert) missing.push("ARCA_CERT (or ARCA_CERT_PATH)");
    if (!params.key) missing.push("ARCA_KEY (or ARCA_KEY_PATH)");
  }

  if (missing.length > 0) {
    throw new Error(
      `ARCA_ENABLED is true, but the following required environment variables are missing: ${missing.join(", ")}`,
    );
  }

  if (!/^\d{11}$/.test(params.cuit!)) {
    throw new Error(
      `ARCA_CUIT must be an 11-digit number, got: ${params.cuit}`,
    );
  }

  const ptoVtaNum = parseInt(params.pto_vta!, 10);
  if (Number.isNaN(ptoVtaNum) || ptoVtaNum <= 0 || ptoVtaNum > 9999) {
    throw new Error(
      `ARCA_PTO_VTA must be a number between 1 and 9999, got: ${params.pto_vta}`,
    );
  }

  if (!params.mock) {
    const cert = params.cert!.value;
    if (
      !cert.includes("-----BEGIN CERTIFICATE-----") ||
      !cert.includes("-----END CERTIFICATE-----")
    ) {
      throw new Error("ARCA_CERT does not appear to be a valid PEM certificate");
    }

    const key = params.key!.value;
    const hasPrivateKeyHeader =
      key.includes("-----BEGIN PRIVATE KEY-----") ||
      key.includes("-----BEGIN RSA PRIVATE KEY-----");
    const hasPrivateKeyFooter =
      key.includes("-----END PRIVATE KEY-----") ||
      key.includes("-----END RSA PRIVATE KEY-----");
    if (!hasPrivateKeyHeader || !hasPrivateKeyFooter) {
      throw new Error("ARCA_KEY does not appear to be a valid PEM private key");
    }
  }
}

export const arcaConfig = registerAs("arca", () => {
  const enabled = parseBool(process.env.ARCA_ENABLED, false);
  const mock = parseBool(process.env.ARCA_MOCK, false);
  const production = parseBool(process.env.ARCA_PRODUCTION, false);
  const cuit = process.env.ARCA_CUIT;
  const pto_vta = process.env.ARCA_PTO_VTA;

  // ARCA_CERT and ARCA_KEY are read as raw multiline PEM strings by default.
  // Do NOT base64-decode them. Escaped \n sequences and CRLF line endings are
  // normalized to LF. Alternatively, ARCA_CERT_PATH / ARCA_KEY_PATH can point
  // to PEM files on disk, which we read ourselves because the compiled SDK does
  // not read files even though the docs say cert/key accept paths.
  const cert = loadPem(
    process.env.ARCA_CERT,
    process.env.ARCA_CERT_PATH,
    "...",
  );
  const key = loadPem(
    process.env.ARCA_KEY,
    process.env.ARCA_KEY_PATH,
    "...",
  );
  const ticketPath = process.env.ARCA_TICKET_PATH;
  const useHttpsAgent = parseBool(process.env.ARCA_USE_HTTPS_AGENT, false);

  if (enabled) {
    validateEnabledConfig({ cuit, pto_vta, cert, key, mock });
  }

  logCredentialDiagnostics({ cert, key, ticketPath });

  return {
    enabled,
    mock,
    production,
    // When disabled, defaults keep the shape valid so consumers can read them safely.
    cuit: cuit ? parseInt(cuit, 10) : 0,
    pto_vta: pto_vta ? parseInt(pto_vta, 10) : 0,
    cert: cert?.value ?? "",
    key: key?.value ?? "",
    ticketPath,
    useHttpsAgent,
  };
});
