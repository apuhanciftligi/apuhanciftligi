/**
 * QNB eSolutions web services (SOAP 1.1, WS-Security UsernameToken):
 *   e-Arşiv  EarsivWebService  faturaOlusturExt / faturaSorgulaExt / faturaIptalEt
 *            — synchronous: the invoice number and link come back at once.
 *   e-Fatura connectorService  efaturaKullaniciBilgisi / belgeGonderExt /
 *            gidenBelgeDurumSorgulaExt — asynchronous: belgeGonderExt only
 *            queues the document; the result is read with the status call.
 * Docs: https://www.qnbesolutions.com.tr/api-entegrasyon.html
 *
 * Plain `fetch` + hand-built envelopes, like the Aras client. Replies are
 * Zod-parsed before use. Server-only: credentials travel in the header and
 * invoice XML carries the buyer's name and address — never log a body.
 * QNB limits each WSDL to 300 requests/min per IP (HTTP 429, no Retry-After).
 */
import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { istanbulInstant } from "@/shared/utils/date";
import { escapeXml, readAllTags, readTag } from "@/shared/xml";

import type { EfaturaRegistration } from "@/features/invoicing/domain/invoice";

/**
 * Live endpoints are issued by QNB only after the test phase is signed off,
 * so live mode is refused until they are added here.
 */
const ENDPOINT = {
  earsiv: {
    test: "https://earsivtest.qnbesolutions.com.tr/earsiv/ws/EarsivWebService",
    live: null,
  },
  efatura: {
    test: "https://erpefaturatest1.qnbesolutions.com.tr/efatura/ws/connectorService",
    live: null,
  },
} as const satisfies Record<string, { test: string; live: string | null }>;

const NAMESPACE = {
  earsiv: "http://service.earsiv.uut.cs.com.tr/",
  efatura: "http://service.connector.uut.cs.com.tr/",
} as const;

type Service = keyof typeof ENDPOINT;

const TIMEOUT_MS = 30_000;

/** e-Arşiv success code; every other AE… code is a failure. */
const EARSIV_OK = "AE00000";

export interface QnbCredentials {
  readonly username: string;
  readonly password: string;
  /** Sender VKN/TCKN. */
  readonly vkn: string;
  readonly erpCode: string;
  readonly testMode: boolean;
}

function envelope(service: Service, creds: QnbCredentials, body: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ` xmlns:ser="${NAMESPACE[service]}">` +
    "<soapenv:Header>" +
    '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">' +
    "<wsse:UsernameToken>" +
    `<wsse:Username>${escapeXml(creds.username)}</wsse:Username>` +
    `<wsse:Password>${escapeXml(creds.password)}</wsse:Password>` +
    "</wsse:UsernameToken></wsse:Security>" +
    `</soapenv:Header><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

function el(tag: string, value: string): string {
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

async function call(
  service: Service,
  creds: QnbCredentials,
  method: string,
  body: string,
  context: Record<string, string>,
): Promise<Result<string, ExternalApiError>> {
  const url = creds.testMode ? ENDPOINT[service].test : ENDPOINT[service].live;
  if (url === null) {
    logger.error({ service, method, ...context }, "qnb_live_endpoint_missing");
    return err(new ExternalApiError({ message: "QNB canlı ortam adresi henüz tanımlı değil." }));
  }
  let xml: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
      body: envelope(service, creds, body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    xml = await res.text();
    if (!res.ok) {
      // A SOAP fault arrives as HTTP 500 with a faultstring; 429 is the rate limit.
      logger.error(
        { service, method, status: res.status, fault: readTag(xml, "faultstring"), ...context },
        "qnb_http_error",
      );
      return err(
        new ExternalApiError({
          message:
            res.status === 429
              ? "QNB istek sınırı aşıldı, bir dakika sonra tekrar denenecek."
              : `QNB hata döndürdü: ${readTag(xml, "faultstring") ?? `HTTP ${res.status}`}`,
        }),
      );
    }
  } catch (cause) {
    logger.error(
      { service, method, message: cause instanceof Error ? cause.message : "unknown", ...context },
      "qnb_request_failed",
    );
    return err(new ExternalApiError({ message: "QNB'ye bağlanılamadı.", cause }));
  }
  return ok(xml);
}

function toBase64(xml: string): string {
  return Buffer.from(xml, "utf8").toString("base64");
}

/** QNB timestamps are Istanbul wall-clock "yyyyMMddHHmmss[SSS]". */
function parseQnbTimestamp(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return istanbulInstant(`${y}-${mo}-${d}`, `${h}:${mi}`);
}

// ---- e-Arşiv ---------------------------------------------------------------

export interface EarsivInvoiceResult {
  readonly invoiceNumber: string;
  readonly uuid: string;
  readonly viewUrl: string | null;
}

const earsivResultSchema = z.object({
  resultCode: z.string().min(1),
  resultText: z.string().default(""),
});

/** resultExtra is a key/value list: <entry><key>…</key><value>…</value></entry>. */
function readResultExtra(xml: string): Map<string, string> {
  const extra = new Map<string, string>();
  for (const entry of readAllTags(xml, "entry")) {
    const key = readTag(entry, "key");
    const value = readTag(entry, "value");
    if (key !== undefined && value !== undefined) extra.set(key, value);
  }
  return extra;
}

function parseEarsivReply(
  xml: string,
  method: string,
  context: Record<string, string>,
): Result<Map<string, string>, ExternalApiError> {
  const parsed = earsivResultSchema.safeParse({
    resultCode: readTag(xml, "resultCode"),
    resultText: readTag(xml, "resultText"),
  });
  if (!parsed.success) {
    logger.error({ method, ...context }, "qnb_earsiv_unexpected_reply");
    return err(new ExternalApiError({ message: "QNB e-Arşiv'den beklenmeyen cevap geldi." }));
  }
  if (parsed.data.resultCode !== EARSIV_OK) {
    logger.warn({ method, resultCode: parsed.data.resultCode, ...context }, "qnb_earsiv_rejected");
    return err(
      new ExternalApiError({
        message: `QNB e-Arşiv reddetti (${parsed.data.resultCode}): ${parsed.data.resultText}`,
      }),
    );
  }
  return ok(readResultExtra(xml));
}

const earsivInvoiceSchema = z.object({
  faturaNo: z.string().min(1),
  uuid: z.string().min(1),
  faturaURL: z.string().url().optional(),
});

function toEarsivInvoice(
  extra: Map<string, string>,
  context: Record<string, string>,
): Result<EarsivInvoiceResult, ExternalApiError> {
  const parsed = earsivInvoiceSchema.safeParse(Object.fromEntries(extra));
  if (!parsed.success) {
    logger.error({ keys: [...extra.keys()].join(","), ...context }, "qnb_earsiv_missing_invoice_fields");
    return err(new ExternalApiError({ message: "QNB fatura numarasını döndürmedi." }));
  }
  return ok({
    invoiceNumber: parsed.data.faturaNo,
    uuid: parsed.data.uuid,
    viewUrl: parsed.data.faturaURL ?? null,
  });
}

/**
 * Create and sign an e-Arşiv invoice. QNB numbers it (numaraVerilsinMi=1)
 * from the series configured on the portal, so a failed call leaves no gap.
 * `uuid` doubles as islemId: retrying the same invoice reuses it.
 */
export async function createEarsivInvoice(
  creds: QnbCredentials,
  input: { uuid: string; ublXml: string },
): Promise<Result<EarsivInvoiceResult, ExternalApiError>> {
  const context = { uuid: input.uuid };
  const params = JSON.stringify({
    islemId: input.uuid,
    vkn: creds.vkn,
    sube: "DFLT",
    kasa: "DFLT",
    numaraVerilsinMi: 1,
    donenBelgeFormati: 9, // no rendering in the reply; the link is enough
    erpKodu: creds.erpCode,
  });
  const body =
    "<ser:faturaOlusturExt>" +
    el("input", params) +
    "<fatura>" + el("belgeFormati", "UBL") + el("belgeIcerigi", toBase64(input.ublXml)) + "</fatura>" +
    "</ser:faturaOlusturExt>";
  const xml = await call("earsiv", creds, "faturaOlusturExt", body, context);
  if (!xml.ok) return xml;
  const extra = parseEarsivReply(xml.value, "faturaOlusturExt", context);
  if (!extra.ok) return extra;
  const result = toEarsivInvoice(extra.value, context);
  if (result.ok) {
    logger.info({ ...context, testMode: creds.testMode }, "qnb_earsiv_created");
  }
  return result;
}

/** Look an e-Arşiv invoice up by ETTN — recovers the outcome of a call that timed out. */
export async function findEarsivInvoice(
  creds: QnbCredentials,
  uuid: string,
): Promise<Result<EarsivInvoiceResult, ExternalApiError>> {
  const context = { uuid };
  const body =
    "<ser:faturaSorgulaExt>" +
    el("input", JSON.stringify({ vkn: creds.vkn, faturaUuid: uuid })) +
    "</ser:faturaSorgulaExt>";
  const xml = await call("earsiv", creds, "faturaSorgulaExt", body, context);
  if (!xml.ok) return xml;
  const extra = parseEarsivReply(xml.value, "faturaSorgulaExt", context);
  if (!extra.ok) return extra;
  return toEarsivInvoice(extra.value, context);
}

/** Cancel an e-Arşiv invoice (reported to GİB as cancelled if already reported). */
export async function cancelEarsivInvoice(
  creds: QnbCredentials,
  uuid: string,
): Promise<Result<void, ExternalApiError>> {
  const context = { uuid };
  const body =
    "<ser:faturaIptalEt>" +
    el("input", JSON.stringify({ vkn: creds.vkn, faturaUuid: uuid })) +
    "</ser:faturaIptalEt>";
  const xml = await call("earsiv", creds, "faturaIptalEt", body, context);
  if (!xml.ok) return xml;
  const reply = parseEarsivReply(xml.value, "faturaIptalEt", context);
  if (!reply.ok) return reply;
  logger.info(context, "qnb_earsiv_cancelled");
  return ok(undefined);
}

// ---- e-Fatura --------------------------------------------------------------

/** GİB e-Fatura registrations for a tax id; empty when not registered. */
export async function lookupEfaturaRegistrations(
  creds: QnbCredentials,
  taxId: string,
): Promise<Result<EfaturaRegistration[], ExternalApiError>> {
  const body = "<ser:efaturaKullaniciBilgisi>" + el("vergiTcKimlikNo", taxId) + "</ser:efaturaKullaniciBilgisi>";
  const xml = await call("efatura", creds, "efaturaKullaniciBilgisi", body, {});
  if (!xml.ok) return xml;
  const registrations: EfaturaRegistration[] = [];
  for (const entry of readAllTags(xml.value, "return")) {
    const label = readTag(entry, "etiket");
    const registeredAt = parseQnbTimestamp(readTag(entry, "kayitZamani") ?? "");
    if (label && registeredAt) registrations.push({ label, registeredAt });
  }
  return ok(registrations);
}

/** MD5 of the exact bytes sent, uppercase hex — QNB's belgeHash. */
export function efaturaDocumentHash(ublXml: string): string {
  return createHash("md5").update(Buffer.from(ublXml, "utf8")).digest("hex").toUpperCase();
}

/**
 * Queue an e-Fatura. The returned belgeOid only means "received" — the
 * outcome must be read with `getEfaturaStatus`. `uuid` is sent as belgeNo
 * (our local, unique document number).
 */
export async function sendEfatura(
  creds: QnbCredentials,
  input: { uuid: string; ublXml: string; recipientLabel: string },
): Promise<Result<{ documentOid: string }, ExternalApiError>> {
  const context = { uuid: input.uuid };
  const body =
    "<ser:belgeGonderExt><parametreler>" +
    el("alanEtiket", input.recipientLabel) +
    el("belgeHash", efaturaDocumentHash(input.ublXml)) +
    el("belgeNo", input.uuid) +
    el("belgeTuru", "FATURA_UBL") +
    el("belgeVersiyon", "1.0") +
    el("erpKodu", creds.erpCode) +
    el("mimeType", "application/xml") +
    el("vergiTcKimlikNo", creds.vkn) +
    el("veri", toBase64(input.ublXml)) +
    "</parametreler></ser:belgeGonderExt>";
  const xml = await call("efatura", creds, "belgeGonderExt", body, context);
  if (!xml.ok) return xml;
  const documentOid = readTag(xml.value, "belgeOid")?.trim();
  if (!documentOid) {
    logger.error(context, "qnb_efatura_no_oid");
    return err(new ExternalApiError({ message: "QNB e-Fatura belge numarası (OID) döndürmedi." }));
  }
  logger.info({ ...context, testMode: creds.testMode }, "qnb_efatura_queued");
  return ok({ documentOid });
}

export type EfaturaStatus =
  | { readonly state: "pending" }
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "processed"; readonly invoiceNumber: string; readonly uuid: string };

/** durum: 1 Alındı (still processing), 2 İşleme Hatası, 3 İşlendi. */
export async function getEfaturaStatus(
  creds: QnbCredentials,
  documentOid: string,
): Promise<Result<EfaturaStatus, ExternalApiError>> {
  const context = { documentOid };
  const body =
    "<ser:gidenBelgeDurumSorgulaExt>" +
    el("vergiTcKimlikNo", creds.vkn) +
    "<parametreler>" +
    el("belgeNo", documentOid) + el("belgeNoTipi", "OID") + el("belgeTuru", "FATURA") +
    "</parametreler></ser:gidenBelgeDurumSorgulaExt>";
  const xml = await call("efatura", creds, "gidenBelgeDurumSorgulaExt", body, context);
  if (!xml.ok) return xml;
  const durum = readTag(xml.value, "durum")?.trim();
  if (durum === "1") return ok({ state: "pending" });
  if (durum === "2") {
    const reason = readTag(xml.value, "aciklama") ?? "İşleme hatası";
    logger.warn(context, "qnb_efatura_processing_error");
    return ok({ state: "failed", reason });
  }
  const invoiceNumber = readTag(xml.value, "belgeNo")?.trim();
  const uuid = readTag(xml.value, "ettn")?.trim();
  if (durum === "3" && invoiceNumber && uuid) {
    return ok({ state: "processed", invoiceNumber, uuid });
  }
  logger.error({ ...context, durum: durum ?? "none" }, "qnb_efatura_unexpected_status");
  return err(new ExternalApiError({ message: "QNB e-Fatura durumu okunamadı." }));
}

