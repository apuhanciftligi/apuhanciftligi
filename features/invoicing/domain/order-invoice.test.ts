import { describe, expect, it } from "vitest";

import {
  buildOrderInvoice,
  nextInvoiceAttemptAt,
  type InvoiceOrder,
} from "@/features/invoicing/domain/order-invoice";

const address = { street: "Cumhuriyet Cad. No:5", district: "Battalgazi", city: "Malatya", postalCode: null };
const seller = {
  taxId: "0710634448",
  title: "Hamit Apuhan",
  taxOffice: "Akçadağ",
  address: { street: "Bahri Mah.", district: "Akçadağ", city: "Malatya", postalCode: null },
  website: "https://apuhanciftligi.com",
};
const aras = { taxId: "1234567890", title: "Aras Kargo", address };
const ctx = { uuid: "u-1", issuedAt: new Date("2026-11-20T10:00:00Z"), seller, cargoCarrier: aras };

const order: InvoiceOrder = {
  orderNumber: "APH-1042",
  status: "confirmed",
  paymentStatus: "paid",
  paymentMethod: "credit_card",
  source: "customer_web",
  paidAt: new Date("2026-11-20T09:59:00Z"),
  totalMinor: 34000,
  deliveryFeeMinor: 9000,
  fulfillmentChannel: "delivery",
  customer: { firstName: "Ayşe", lastName: "Yılmaz", email: "ayse@example.com" },
  address,
  items: [
    { name: "Yumurta", unit: "package", quantity: 2, lineTotalMinor: 25000, vatRate: 1 },
    { name: "Hediye kavanoz", unit: "piece", quantity: 1, lineTotalMinor: 0, vatRate: 1 },
  ],
};

describe("buildOrderInvoice", () => {
  it("bills paid goods plus the delivery fee, carried by the farm", () => {
    const result = buildOrderInvoice(order, ctx);
    if (!result.ok) throw new Error(result.problems.join(" "));
    const { document } = result;
    expect(document.lines.map((l) => [l.name, l.grossMinor, l.unitCode, l.vatRate])).toEqual([
      ["Yumurta", 25000, "PA", 1],
      ["Teslimat ücreti", 9000, "C62", 1],
    ]);
    expect(document.carrier.taxId).toBe(seller.taxId);
    expect(document.payment.method).toBe("card");
    expect(document.buyer).toMatchObject({ kind: "consumer", firstName: "Ayşe", familyName: "Yılmaz" });
  });

  it("names the cargo company as carrier and calls the fee a cargo fee", () => {
    const result = buildOrderInvoice({ ...order, fulfillmentChannel: "shipping" }, ctx);
    if (!result.ok) throw new Error(result.problems.join(" "));
    expect(result.document.carrier).toEqual(aras);
    expect(result.document.lines.at(-1)?.name).toBe("Kargo ücreti");
  });

  it("leaves havale, cash and admin-entered orders to manual invoicing", () => {
    for (const patch of [
      { paymentMethod: "bank_transfer" },
      { paymentMethod: "cash_on_delivery" },
      { source: "admin_manual" },
    ]) {
      expect(buildOrderInvoice({ ...order, ...patch }, ctx).ok).toBe(false);
    }
  });

  it("refuses orders that are not fully paid or cancelled", () => {
    for (const patch of [
      { paymentStatus: "partial" },
      { status: "cancelled" },
    ]) {
      expect(buildOrderInvoice({ ...order, ...patch }, ctx).ok).toBe(false);
    }
  });

  it("leaves payments older than 7 days to a human", () => {
    const old = { ...order, paidAt: new Date("2026-11-12T09:00:00Z") };
    expect(buildOrderInvoice(old, ctx)).toEqual({
      ok: false,
      problems: ["Ödeme 7 günden eski; faturayı elle kontrol edin."],
    });
  });

  it("refuses when lines do not add up to the order total", () => {
    expect(buildOrderInvoice({ ...order, totalMinor: 34001 }, ctx).ok).toBe(false);
  });

  it("refuses a customer without a usable surname", () => {
    const result = buildOrderInvoice({ ...order, customer: { ...order.customer, lastName: "" } }, ctx);
    expect(result).toEqual({ ok: false, problems: ["Müşterinin soyadı en az 2 harf olmalı."] });
  });

  it("refuses a fee when goods carry mixed rates", () => {
    const mixed = {
      ...order,
      totalMinor: 46000,
      items: [...order.items, { name: "Sabun", unit: "piece", quantity: 1, lineTotalMinor: 12000, vatRate: 20 as const }],
    };
    expect(buildOrderInvoice(mixed, ctx).ok).toBe(false);
  });
});

describe("nextInvoiceAttemptAt", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const minutesAfter = (attempts: number) => (nextInvoiceAttemptAt(now, attempts).getTime() - now.getTime()) / 60_000;

  it("backs off from 5 minutes, doubling, capped at 6 hours", () => {
    expect([1, 2, 3, 4].map(minutesAfter)).toEqual([5, 10, 20, 40]);
    expect(minutesAfter(20)).toBe(360);
  });
});
