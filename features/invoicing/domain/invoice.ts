/**
 * Sales invoice domain — what we bill, independent of how it is transmitted.
 *
 * One document model serves both GİB channels:
 *   - e-Fatura (profile TEMELFATURA): the buyer is registered in GİB's
 *     e-Fatura system. Sent through QNB's connector, processed async.
 *   - e-Arşiv  (profile EARSIVFATURA): everyone else — every consumer, and any
 *     company not registered (or not yet registered on the invoice date).
 * `chooseInvoiceChannel` is the single place that decides between them.
 *
 * Amounts are kuruş. Every price in the system is VAT-inclusive, so a line
 * carries its charged gross and the base/VAT are derived (vat.ts), which keeps
 * the invoice total equal to what the customer paid, to the kuruş.
 */
import { splitVatInclusive, type VatRate } from "@/shared/vat";

export type InvoiceChannel = "efatura" | "earsiv";

/** UBL-TR unit codes (GİB code list) for the units we sell in. */
export type InvoiceUnitCode = "C62" | "KGM" | "LTR" | "PA";

export interface InvoiceAddress {
  /** Street / neighbourhood / building — free text, one line. */
  readonly street: string;
  /** İlçe. */
  readonly district: string;
  /** İl. */
  readonly city: string;
  readonly postalCode: string | null;
}

export interface InvoiceSeller {
  /** 10-digit VKN or 11-digit TCKN. */
  readonly taxId: string;
  readonly title: string;
  readonly taxOffice: string;
  readonly address: InvoiceAddress;
  readonly website: string;
}

/**
 * Who is billed. A consumer is invoiced without a TCKN: GİB's placeholder
 * 11111111111 stands in for an end consumer who gives none.
 */
export type InvoiceBuyer =
  | {
      readonly kind: "consumer";
      readonly firstName: string;
      readonly familyName: string;
      readonly address: InvoiceAddress;
      readonly email: string | null;
    }
  | {
      readonly kind: "company";
      /** 10-digit VKN or 11-digit TCKN. */
      readonly taxId: string;
      readonly title: string;
      readonly taxOffice: string;
      readonly address: InvoiceAddress;
      readonly email: string | null;
    };

export const CONSUMER_PLACEHOLDER_TCKN = "11111111111";

export interface InvoiceLineInput {
  readonly name: string;
  readonly quantity: number;
  readonly unitCode: InvoiceUnitCode;
  /** What was charged for the whole line, VAT included (kuruş). */
  readonly grossMinor: number;
  readonly vatRate: VatRate;
}

/** How the order was paid — e-Arşiv internet-sale fields need it. */
export type InvoicePaymentMethod = "card" | "bank_transfer";

export interface InvoiceDocument {
  /** ETTN. Also our idempotency key with QNB (islemId / belgeNo). */
  readonly uuid: string;
  readonly issuedAt: Date;
  readonly orderNumber: string;
  readonly seller: InvoiceSeller;
  readonly buyer: InvoiceBuyer;
  readonly lines: readonly InvoiceLineInput[];
  readonly payment: { readonly method: InvoicePaymentMethod; readonly paidAt: Date };
  /** Who carries the goods (us on the route, or the cargo company). */
  readonly carrier: {
    readonly taxId: string;
    readonly title: string;
    readonly address: InvoiceAddress;
  };
}

export interface InvoiceLineAmounts extends InvoiceLineInput {
  readonly netMinor: number;
  readonly vatMinor: number;
}

export interface InvoiceTaxSubtotal {
  readonly vatRate: VatRate;
  readonly taxableMinor: number;
  readonly vatMinor: number;
}

export interface InvoiceTotals {
  readonly lines: readonly InvoiceLineAmounts[];
  /** One entry per distinct rate, ascending. */
  readonly taxSubtotals: readonly InvoiceTaxSubtotal[];
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
}

/** Split every line into base + VAT and roll the totals up per rate. */
export function computeInvoiceTotals(lines: readonly InvoiceLineInput[]): InvoiceTotals {
  if (lines.length === 0) throw new RangeError("An invoice needs at least one line.");
  const amounts = lines.map((line) => {
    if (!(line.quantity > 0)) throw new RangeError(`Line "${line.name}" has no quantity.`);
    return { ...line, ...splitVatInclusive(line.grossMinor, line.vatRate) };
  });
  const byRate = new Map<VatRate, { taxableMinor: number; vatMinor: number }>();
  for (const line of amounts) {
    const sub = byRate.get(line.vatRate) ?? { taxableMinor: 0, vatMinor: 0 };
    sub.taxableMinor += line.netMinor;
    sub.vatMinor += line.vatMinor;
    byRate.set(line.vatRate, sub);
  }
  const taxSubtotals = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([vatRate, sub]) => ({ vatRate, ...sub }));
  const sum = (pick: (l: InvoiceLineAmounts) => number) =>
    amounts.reduce((acc, l) => acc + pick(l), 0);
  return {
    lines: amounts,
    taxSubtotals,
    netMinor: sum((l) => l.netMinor),
    vatMinor: sum((l) => l.vatMinor),
    grossMinor: sum((l) => l.grossMinor),
  };
}

/**
 * Rate for a delivery/cargo fee line. A transport fee billed together with
 * the goods is part of their taxable base (KDVK 24/c), so it takes the goods'
 * rate. With goods at different rates the split is a judgement call, so this
 * returns null and the invoice must be handled by hand.
 */
export function feeVatRate(goods: readonly InvoiceLineInput[]): VatRate | null {
  const rates = new Set(goods.map((l) => l.vatRate));
  const [only] = rates;
  return rates.size === 1 && only !== undefined ? only : null;
}

/** One GİB registry entry for a tax id (QNB efaturaKullaniciBilgisi). */
export interface EfaturaRegistration {
  /** Postbox label, e.g. urn:mail:defaultpk@firma.com.tr. */
  readonly label: string;
  /** When the taxpayer joined e-Fatura. Invoices dated before it go e-Arşiv. */
  readonly registeredAt: Date;
}

export type ChannelDecision =
  | { readonly channel: "earsiv" }
  | { readonly channel: "efatura"; readonly recipientLabel: string };

/**
 * e-Fatura only when the buyer is a company whose tax id is registered on or
 * before the invoice date; otherwise e-Arşiv. With several postboxes the
 * earliest-registered one is used (GİB's own default is the first opened).
 */
export function chooseInvoiceChannel(
  buyer: InvoiceBuyer,
  registrations: readonly EfaturaRegistration[],
  issuedAt: Date,
): ChannelDecision {
  if (buyer.kind === "consumer") return { channel: "earsiv" };
  const eligible = registrations
    .filter((r) => r.registeredAt.getTime() <= issuedAt.getTime())
    .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime());
  const first = eligible[0];
  return first ? { channel: "efatura", recipientLabel: first.label } : { channel: "earsiv" };
}

/**
 * Problems that would make QNB reject the document, in Turkish for the admin.
 * Empty = sendable. Checked before sending so a bad record waits for a human
 * instead of burning retries.
 */
export function invoiceProblems(doc: InvoiceDocument): string[] {
  const problems: string[] = [];
  if (doc.buyer.kind === "consumer") {
    // QNB: cac:Person needs FirstName and FamilyName of at least 2 characters.
    if (doc.buyer.firstName.trim().length < 2) problems.push("Müşterinin adı en az 2 harf olmalı.");
    if (doc.buyer.familyName.trim().length < 2) problems.push("Müşterinin soyadı en az 2 harf olmalı.");
  } else if (!isTaxId(doc.buyer.taxId)) {
    problems.push("Firma VKN/TCKN 10 ya da 11 haneli olmalı.");
  }
  if (doc.lines.length === 0) problems.push("Faturada satır yok.");
  return problems;
}

/** True for a well-formed 10-digit VKN or 11-digit TCKN. */
export function isTaxId(value: string): boolean {
  return /^\d{10}$|^\d{11}$/.test(value);
}
