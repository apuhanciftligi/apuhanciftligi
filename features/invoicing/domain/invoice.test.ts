import { describe, expect, it } from "vitest";

import {
  chooseInvoiceChannel,
  computeInvoiceTotals,
  feeVatRate,
  invoiceProblems,
  isTaxId,
  type InvoiceBuyer,
  type InvoiceDocument,
  type InvoiceLineInput,
} from "@/features/invoicing/domain/invoice";

const address = { street: "Bahri Mah.", district: "Akçadağ", city: "Malatya", postalCode: null };
const consumer: InvoiceBuyer = {
  kind: "consumer",
  firstName: "Ayşe",
  familyName: "Yılmaz",
  address,
  email: null,
};
const company: InvoiceBuyer = {
  kind: "company",
  taxId: "1234567890",
  title: "Örnek Gıda Ltd.",
  taxOffice: "Malatya",
  address,
  email: null,
};

const eggs: InvoiceLineInput = { name: "Yumurta", quantity: 2, unitCode: "PA", grossMinor: 25000, vatRate: 1 };
const apricot: InvoiceLineInput = { name: "Kayısı", quantity: 1.5, unitCode: "KGM", grossMinor: 97500, vatRate: 1 };

describe("computeInvoiceTotals", () => {
  it("keeps the invoice total equal to what was charged", () => {
    const totals = computeInvoiceTotals([eggs, apricot]);
    expect(totals.grossMinor).toBe(122500);
    expect(totals.netMinor + totals.vatMinor).toBe(122500);
    expect(totals.lines.map((l) => [l.netMinor, l.vatMinor])).toEqual([
      [24752, 248],
      [96535, 965],
    ]);
  });

  it("rolls subtotals up per rate, ascending", () => {
    const totals = computeInvoiceTotals([
      { ...eggs, vatRate: 20, grossMinor: 12000 },
      eggs,
    ]);
    expect(totals.taxSubtotals).toEqual([
      { vatRate: 1, taxableMinor: 24752, vatMinor: 248 },
      { vatRate: 20, taxableMinor: 10000, vatMinor: 2000 },
    ]);
  });

  it("rejects an empty invoice and a zero-quantity line", () => {
    expect(() => computeInvoiceTotals([])).toThrow(RangeError);
    expect(() => computeInvoiceTotals([{ ...eggs, quantity: 0 }])).toThrow(RangeError);
  });
});

describe("feeVatRate", () => {
  it("takes the goods' rate when they share one", () => {
    expect(feeVatRate([eggs, apricot])).toBe(1);
  });

  it("refuses to guess with mixed rates", () => {
    expect(feeVatRate([eggs, { ...apricot, vatRate: 10 }])).toBeNull();
  });
});

describe("chooseInvoiceChannel", () => {
  const issuedAt = new Date("2026-11-20T10:00:00Z");
  const registered = { label: "urn:mail:defaultpk@ornek.com.tr", registeredAt: new Date("2024-01-01T00:00:00Z") };

  it("always sends consumers to e-Arşiv", () => {
    expect(chooseInvoiceChannel(consumer, [registered], issuedAt)).toEqual({ channel: "earsiv" });
  });

  it("sends a registered company to e-Fatura with its postbox", () => {
    expect(chooseInvoiceChannel(company, [registered], issuedAt)).toEqual({
      channel: "efatura",
      recipientLabel: registered.label,
    });
  });

  it("sends an unregistered company to e-Arşiv", () => {
    expect(chooseInvoiceChannel(company, [], issuedAt)).toEqual({ channel: "earsiv" });
  });

  it("uses e-Arşiv when the registration is later than the invoice date", () => {
    const late = { ...registered, registeredAt: new Date("2026-12-01T00:00:00Z") };
    expect(chooseInvoiceChannel(company, [late], issuedAt)).toEqual({ channel: "earsiv" });
  });

  it("picks the earliest eligible postbox", () => {
    const second = { label: "urn:mail:ikinci@ornek.com.tr", registeredAt: new Date("2025-01-01T00:00:00Z") };
    const result = chooseInvoiceChannel(company, [second, registered], issuedAt);
    expect(result).toEqual({ channel: "efatura", recipientLabel: registered.label });
  });
});

describe("isTaxId", () => {
  it("accepts 10-digit VKN and 11-digit TCKN only", () => {
    expect(isTaxId("0710634448")).toBe(true);
    expect(isTaxId("11111111111")).toBe(true);
    expect(isTaxId("071063444")).toBe(false);
    expect(isTaxId("07106344x8")).toBe(false);
  });
});

describe("invoiceProblems", () => {
  const doc: InvoiceDocument = {
    uuid: "u",
    issuedAt: new Date(),
    orderNumber: "APH-1",
    seller: { taxId: "0710634448", title: "Hamit Apuhan", taxOffice: "Akçadağ", address, website: "https://apuhanciftligi.com" },
    buyer: consumer,
    lines: [eggs],
    payment: { method: "card", paidAt: new Date() },
    carrier: { taxId: "0710634448", title: "Hamit Apuhan", address },
  };

  it("accepts a complete consumer invoice", () => {
    expect(invoiceProblems(doc)).toEqual([]);
  });

  it("flags names QNB would reject", () => {
    const short = { ...doc, buyer: { ...consumer, firstName: "A", familyName: "" } };
    expect(invoiceProblems(short)).toHaveLength(2);
  });

  it("flags a malformed company tax id", () => {
    expect(invoiceProblems({ ...doc, buyer: { ...company, taxId: "123" } })).toHaveLength(1);
  });
});
