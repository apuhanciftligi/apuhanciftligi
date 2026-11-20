import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { InvoiceOrder } from "@/features/invoicing/domain/order-invoice";
import type { InvoiceRow } from "@/features/invoicing/infrastructure/invoice.repository";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/shared/env", () => ({
  env: {
    QNB_EARSIV_USERNAME: "u",
    QNB_EARSIV_PASSWORD: "p",
    QNB_VKN: "0106106900",
    QNB_ERP_CODE: "QES00001",
    QNB_TEST_MODE: "1",
    LOG_LEVEL: "silent",
  },
}));
const repo = vi.hoisted(() => ({
  claimDueInvoices: vi.fn(),
  loadInvoiceOrder: vi.fn(),
  markInvoiceIssued: vi.fn(),
  markInvoiceFailed: vi.fn(),
}));
vi.mock("@/features/invoicing/infrastructure/invoice.repository", () => repo);
const qnb = vi.hoisted(() => ({ createEarsivInvoice: vi.fn(), findEarsivInvoice: vi.fn() }));
vi.mock("@/features/invoicing/infrastructure/qnb-client", () => qnb);

const { processDueInvoices } = await import("@/features/invoicing/application/process-invoices");

const row = (attempts: number): InvoiceRow => ({
  id: "6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b",
  order_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  status: "processing",
  channel: null,
  invoice_number: null,
  view_url: null,
  attempts,
  last_error: null,
  issued_at: null,
  created_at: "2026-11-20T10:00:00Z",
});

const order: InvoiceOrder = {
  orderNumber: "APH-1",
  status: "confirmed",
  paymentStatus: "paid",
  paymentMethod: "credit_card",
  source: "customer_web",
  paidAt: new Date(),
  totalMinor: 13000,
  deliveryFeeMinor: 0,
  fulfillmentChannel: "delivery",
  customer: { firstName: "Ayşe", lastName: "Yılmaz", email: null },
  address: { street: "Cumhuriyet Cad.", district: "Battalgazi", city: "Malatya", postalCode: null },
  items: [{ name: "Yumurta", unit: "package", quantity: 1, lineTotalMinor: 13000, vatRate: 1 }],
};
const issued = { invoiceNumber: "QSB2026000000001", uuid: row(1).id, viewUrl: "https://earsivtest.qnbesolutions.com.tr/x" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.loadInvoiceOrder.mockResolvedValue(ok(order));
  repo.markInvoiceIssued.mockResolvedValue(ok(undefined));
  repo.markInvoiceFailed.mockResolvedValue(ok(undefined));
});

describe("processDueInvoices", () => {
  it("issues an e-Arşiv invoice and records its number", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    qnb.createEarsivInvoice.mockResolvedValue(ok(issued));
    expect(await processDueInvoices()).toEqual({ processed: 1, issued: 1 });
    expect(qnb.createEarsivInvoice.mock.calls[0]?.[1]).toMatchObject({ uuid: row(1).id });
    expect(repo.markInvoiceIssued).toHaveBeenCalledWith(row(1).id, expect.objectContaining({
      channel: "earsiv",
      invoiceNumber: issued.invoiceNumber,
    }));
  });

  it("schedules a retry when QNB fails", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "QNB'ye bağlanılamadı." })));
    await processDueInvoices();
    const [, reason, nextAt] = repo.markInvoiceFailed.mock.calls[0] ?? [];
    expect(reason).toBe("QNB'ye bağlanılamadı.");
    expect(nextAt).toBeInstanceOf(Date);
  });

  it("recovers an invoice QNB created on an earlier, timed-out try", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(2)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "islemId kullanılmış" })));
    qnb.findEarsivInvoice.mockResolvedValue(ok(issued));
    expect(await processDueInvoices()).toEqual({ processed: 1, issued: 1 });
    expect(repo.markInvoiceFailed).not.toHaveBeenCalled();
  });

  it("parks bad order data for a human without calling QNB", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    repo.loadInvoiceOrder.mockResolvedValue(ok({ ...order, customer: { ...order.customer, lastName: "" } }));
    await processDueInvoices();
    expect(qnb.createEarsivInvoice).not.toHaveBeenCalled();
    expect(repo.markInvoiceFailed).toHaveBeenCalledWith(row(1).id, "Müşterinin soyadı en az 2 harf olmalı.", null);
  });

  it("gives up after the last attempt", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(6)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "hata" })));
    qnb.findEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "yok" })));
    await processDueInvoices();
    expect(repo.markInvoiceFailed).toHaveBeenCalledWith(row(6).id, "hata", null);
  });
});
