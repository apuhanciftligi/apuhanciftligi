import "server-only";

/**
 * Invoice worker: claim due queue rows, build each order's invoice, send it to
 * QNB and record the outcome. Runs right after a payment is recorded
 * (`scheduleInvoiceProcessing`, via `after()`) and from the daily cron, which
 * sweeps retries. Off (no-op) until every QNB_* setting is present.
 *
 * Idempotency: the invoice row id is the ETTN and QNB's islemId. If a send
 * timed out after QNB created the invoice, the retry fails as a duplicate and
 * the lookup by ETTN recovers the issued invoice instead of billing twice.
 */
import { after } from "next/server";

import { env } from "@/shared/env";
import { logger } from "@/shared/logger";

import { chooseInvoiceChannel, type InvoiceSeller } from "@/features/invoicing/domain/invoice";
import {
  MAX_INVOICE_ATTEMPTS,
  buildOrderInvoice,
  nextInvoiceAttemptAt,
  type CargoCarrier,
} from "@/features/invoicing/domain/order-invoice";
import { buildUblInvoice } from "@/features/invoicing/domain/ubl";
import {
  claimDueInvoices,
  loadInvoiceOrder,
  markInvoiceFailed,
  markInvoiceIssued,
  type InvoiceRow,
} from "@/features/invoicing/infrastructure/invoice.repository";
import {
  createEarsivInvoice,
  findEarsivInvoice,
  type QnbCredentials,
} from "@/features/invoicing/infrastructure/qnb-client";

/**
 * The farm as it appears on its invoices (title, address and tax office
 * confirmed by owner 2026-11-20). The tax id comes from env: it differs
 * between QNB's test environment and live.
 */
const SELLER_PROFILE = {
  title: "Hamit Apuhan",
  taxOffice: "Akçadağ",
  address: {
    street: "Bahri Mah. Mezarlık Cad. No:17",
    district: "Akçadağ",
    city: "Malatya",
    postalCode: null,
  },
  website: "https://apuhanciftligi.com",
} as const;

/** Aras Kargo, carrier of every shipping order (VKN confirmed by owner 2026-11-20). */
const ARAS_KARGO: CargoCarrier = {
  taxId: "0720039666",
  title: "Aras Kargo Yurt İçi Yurt Dışı Taşımacılık A.Ş.",
  address: {
    street: "Rüzgarlıbahçe Mah. Yavuz Selim Cad. No:2",
    district: "Beykoz",
    city: "İstanbul",
    postalCode: null,
  },
} as const;

const BATCH_SIZE = 10;

interface InvoicingConfig {
  readonly earsiv: QnbCredentials;
  readonly seller: InvoiceSeller;
}

function invoicingConfig(): InvoicingConfig | null {
  const {
    QNB_EARSIV_USERNAME, QNB_EARSIV_PASSWORD, QNB_VKN, QNB_ERP_CODE,
    QNB_TEST_MODE,
  } = env;
  if (!QNB_EARSIV_USERNAME || !QNB_EARSIV_PASSWORD || !QNB_VKN || !QNB_ERP_CODE) {
    return null;
  }
  return {
    earsiv: {
      username: QNB_EARSIV_USERNAME,
      password: QNB_EARSIV_PASSWORD,
      vkn: QNB_VKN,
      erpCode: QNB_ERP_CODE,
      testMode: QNB_TEST_MODE === "1",
    },
    seller: { ...SELLER_PROFILE, taxId: QNB_VKN },
  };
}

export function isInvoicingEnabled(): boolean {
  return invoicingConfig() !== null;
}

type Outcome = "issued" | "retry" | "needs_attention" | "error";

async function failOrPark(row: InvoiceRow, reason: string, now: Date): Promise<Outcome> {
  const giveUp = row.attempts >= MAX_INVOICE_ATTEMPTS;
  const res = await markInvoiceFailed(row.id, reason, giveUp ? null : nextInvoiceAttemptAt(now, row.attempts));
  if (!res.ok) return "error";
  return giveUp ? "needs_attention" : "retry";
}

async function processOne(row: InvoiceRow, config: InvoicingConfig): Promise<Outcome> {
  const now = new Date();
  const order = await loadInvoiceOrder(row.order_id);
  if (!order.ok) return failOrPark(row, order.error.message, now);

  const built = buildOrderInvoice(order.value, {
    uuid: row.id,
    issuedAt: now,
    seller: config.seller,
    cargoCarrier: ARAS_KARGO,
  });
  if (!built.ok) {
    // Data problems don't fix themselves: park for a human straight away.
    logger.warn({ invoiceId: row.id, orderId: row.order_id, count: built.problems.length }, "invoice_needs_attention");
    const res = await markInvoiceFailed(row.id, built.problems.join(" "), null);
    return res.ok ? "needs_attention" : "error";
  }

  // Consumers only for now, so this is always e-Arşiv; the e-Fatura branch
  // gets its sender once corporate buyers carry a tax id.
  const decision = chooseInvoiceChannel(built.document.buyer, [], now);
  if (decision.channel !== "earsiv") return failOrPark(row, "e-Fatura gönderimi henüz bağlı değil.", now);

  // e-Arşiv numbers the invoice itself (numaraVerilsinMi=1); this well-formed
  // placeholder is overwritten by QNB.
  const placeholderId = `APH${now.getFullYear()}000000001`;
  const ublXml = buildUblInvoice(built.document, "earsiv", placeholderId);
  let result = await createEarsivInvoice(config.earsiv, { uuid: row.id, ublXml });
  if (!result.ok && row.attempts > 1) {
    // An earlier try may have succeeded after we stopped waiting.
    const found = await findEarsivInvoice(config.earsiv, row.id);
    if (found.ok) result = found;
  }
  if (!result.ok) return failOrPark(row, result.error.message, now);

  const saved = await markInvoiceIssued(row.id, {
    channel: "earsiv",
    invoiceNumber: result.value.invoiceNumber,
    viewUrl: result.value.viewUrl,
    issuedAt: now,
  });
  // If this write fails the row's lock expires, it is claimed again and the
  // ETTN lookup above recovers the already-issued invoice.
  return saved.ok ? "issued" : "error";
}

/** Process one batch of due invoices. Safe to run concurrently. */
export async function processDueInvoices(): Promise<{ processed: number; issued: number } | null> {
  const config = invoicingConfig();
  if (!config) return null;
  const claimed = await claimDueInvoices(BATCH_SIZE);
  if (!claimed.ok) return { processed: 0, issued: 0 };
  let issued = 0;
  for (const row of claimed.value) {
    const outcome = await processOne(row, config);
    if (outcome === "issued") issued += 1;
    logger.info({ invoiceId: row.id, orderId: row.order_id, outcome, attempt: row.attempts }, "invoice_processed");
  }
  return { processed: claimed.value.length, issued };
}

/**
 * Run the worker after the current response is sent. Call it wherever an
 * order may just have become paid; the queue itself decides what is due.
 */
export function scheduleInvoiceProcessing(): void {
  if (!isInvoicingEnabled()) return;
  after(async () => {
    const result = await processDueInvoices();
    if (result) logger.info(result, "invoice_batch_done");
  });
}
