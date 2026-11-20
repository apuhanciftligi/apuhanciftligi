/**
 * Order → invoice document, and the retry policy of the invoice queue.
 *
 * Pure: the worker loads an `InvoiceOrder` (order + items + customer + each
 * product's KDV rate) and this turns it into the document, or says why it
 * cannot be invoiced automatically. Today every buyer is a consumer
 * (no corporate invoices yet — owner decision 2026-11-20), so every order
 * routes to e-Arşiv through `chooseInvoiceChannel`.
 */
import type { VatRate } from "@/shared/vat";

import {
  feeVatRate,
  invoiceProblems,
  type InvoiceAddress,
  type InvoiceDocument,
  type InvoiceLineInput,
  type InvoicePaymentMethod,
  type InvoiceSeller,
  type InvoiceUnitCode,
} from "@/features/invoicing/domain/invoice";

export interface InvoiceOrderItem {
  readonly name: string;
  /** Product unit as stored on the order line snapshot. */
  readonly unit: string;
  readonly quantity: number;
  readonly lineTotalMinor: number;
  /** Current products.vat_rate — the rate at the taxable event (now). */
  readonly vatRate: VatRate;
}

export interface InvoiceOrder {
  readonly orderNumber: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly paymentMethod: string;
  readonly paidAt: Date | null;
  readonly totalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly fulfillmentChannel: "delivery" | "shipping";
  readonly customer: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string | null;
  };
  readonly address: InvoiceAddress;
  readonly items: readonly InvoiceOrderItem[];
}

/** The cargo company carrying shipping orders (printed as the carrier). */
export interface CargoCarrier {
  readonly taxId: string;
  readonly title: string;
  readonly address: InvoiceAddress;
}

const UNIT_CODE: Record<string, InvoiceUnitCode> = {
  package: "PA",
  liter: "LTR",
  kilogram: "KGM",
  piece: "C62",
};

/** Older payments are not invoiced automatically. */
const STALE_PAYMENT_MS = 7 * 24 * 60 * 60 * 1000;

export type OrderInvoiceResult =
  | { readonly ok: true; readonly document: InvoiceDocument }
  /** Not invoiceable as is; a human must look (Turkish reasons). */
  | { readonly ok: false; readonly problems: readonly string[] };

export function buildOrderInvoice(
  order: InvoiceOrder,
  ctx: {
    readonly uuid: string;
    readonly issuedAt: Date;
    readonly seller: InvoiceSeller;
    readonly cargoCarrier: CargoCarrier | null;
  },
): OrderInvoiceResult {
  const problems: string[] = [];
  if (order.status === "cancelled") problems.push("Sipariş iptal edilmiş.");
  if (order.paymentStatus !== "paid") problems.push("Sipariş tamamen ödenmiş görünmüyor.");
  const method: InvoicePaymentMethod | null =
    order.paymentMethod === "credit_card" ? "card"
      : order.paymentMethod === "bank_transfer" ? "bank_transfer"
        : null;
  if (method === null) problems.push("Bu ödeme yöntemi için otomatik fatura yok.");
  if (order.paidAt && ctx.issuedAt.getTime() - order.paidAt.getTime() > STALE_PAYMENT_MS) {
    // A backlog (e.g. invoicing switched on late) must not be billed in bulk
    // with today's date; someone decides how to invoice those.
    problems.push("Ödeme 7 günden eski; faturayı elle kontrol edin.");
  }

  const goods: InvoiceLineInput[] = [];
  for (const item of order.items) {
    if (item.lineTotalMinor <= 0) continue; // free extras are not billed
    const unitCode = UNIT_CODE[item.unit];
    if (!unitCode) {
      problems.push(`"${item.name}" ürününün birimi faturaya çevrilemedi.`);
      continue;
    }
    goods.push({
      name: item.name,
      quantity: item.quantity,
      unitCode,
      grossMinor: item.lineTotalMinor,
      vatRate: item.vatRate,
    });
  }

  const lines = [...goods];
  if (order.deliveryFeeMinor > 0) {
    const rate = feeVatRate(goods);
    if (rate === null) {
      problems.push("Farklı KDV oranlı ürünlerde teslimat ücretinin oranı elle belirlenmeli.");
    } else {
      lines.push({
        name: order.fulfillmentChannel === "shipping" ? "Kargo ücreti" : "Teslimat ücreti",
        quantity: 1,
        unitCode: "C62",
        grossMinor: order.deliveryFeeMinor,
        vatRate: rate,
      });
    }
  }

  const billed = lines.reduce((sum, l) => sum + l.grossMinor, 0);
  if (billed !== order.totalMinor) {
    problems.push("Fatura satırlarının toplamı sipariş toplamıyla tutmuyor.");
  }

  let carrier: InvoiceDocument["carrier"];
  if (order.fulfillmentChannel === "shipping") {
    if (!ctx.cargoCarrier) {
      problems.push("Kargo firmasının vergi bilgisi tanımlı değil (INVOICE_CARGO_CARRIER_VKN).");
      return { ok: false, problems };
    }
    carrier = ctx.cargoCarrier;
  } else {
    // Route deliveries are carried by the farm itself.
    carrier = { taxId: ctx.seller.taxId, title: ctx.seller.title, address: ctx.seller.address };
  }

  if (problems.length > 0 || method === null) return { ok: false, problems };

  const document: InvoiceDocument = {
    uuid: ctx.uuid,
    issuedAt: ctx.issuedAt,
    orderNumber: order.orderNumber,
    seller: ctx.seller,
    buyer: {
      kind: "consumer",
      firstName: order.customer.firstName.trim(),
      familyName: order.customer.lastName.trim(),
      address: order.address,
      email: order.customer.email,
    },
    lines,
    payment: { method, paidAt: order.paidAt ?? ctx.issuedAt },
    carrier,
  };
  const docProblems = invoiceProblems(document);
  return docProblems.length > 0 ? { ok: false, problems: docProblems } : { ok: true, document };
}

/** After this many failed sends a human is asked to look. */
export const MAX_INVOICE_ATTEMPTS = 6;

/**
 * Wait before the next try after `attempts` failures: 5 min, doubling,
 * capped at 6 h. (A daily cron also sweeps, so nothing waits forever.)
 */
export function nextInvoiceAttemptAt(now: Date, attempts: number): Date {
  const minutes = Math.min(5 * 2 ** Math.max(attempts - 1, 0), 360);
  return new Date(now.getTime() + minutes * 60_000);
}
