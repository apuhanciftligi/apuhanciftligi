/**
 * QNB eSolutions TEST environment round trip: builds real UBL-TR invoices
 * and sends them to QNB's test services. Proves the XML passes QNB's schema
 * and schematron checks — the one thing unit tests cannot.
 *
 * Skipped unless the QNB_* test credentials are in the environment
 * (.env.local). Refuses to run against live (QNB_TEST_MODE must be "1").
 * The e-Fatura send needs a registered receiver other than ourselves (QNB
 * rejects sender == receiver): set QNB_TEST_EFATURA_RECEIVER to one of the
 * test environment's active taxpayers to include it — GİB's dummy test
 * users (e.g. 1111111001 "… Test Kullanıcısı") are meant for exactly this.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { chooseInvoiceChannel, type InvoiceDocument } from "@/features/invoicing/domain/invoice";
import { buildUblInvoice } from "@/features/invoicing/domain/ubl";
import {
  cancelEarsivInvoice,
  createEarsivInvoice,
  findEarsivInvoice,
  getEfaturaStatus,
  lookupEfaturaRegistrations,
  sendEfatura,
  type QnbCredentials,
} from "@/features/invoicing/infrastructure/qnb-client";

const e = process.env;
const configured = Boolean(
  e.QNB_EARSIV_USERNAME && e.QNB_EARSIV_PASSWORD && e.QNB_EFATURA_USERNAME &&
    e.QNB_EFATURA_PASSWORD && e.QNB_VKN && e.QNB_ERP_CODE && e.QNB_TEST_MODE === "1",
);

function creds(kind: "EARSIV" | "EFATURA"): QnbCredentials {
  return {
    username: e[`QNB_${kind}_USERNAME`] ?? "",
    password: e[`QNB_${kind}_PASSWORD`] ?? "",
    vkn: e.QNB_VKN ?? "",
    erpCode: e.QNB_ERP_CODE ?? "",
    testMode: true,
  };
}

const address = { street: "Bahri Mah. Mezarlık Cad. No:17", district: "Akçadağ", city: "Malatya", postalCode: null };

function testDocument(): InvoiceDocument {
  const now = new Date();
  return {
    uuid: randomUUID(),
    issuedAt: now,
    orderNumber: "TEST-QNB",
    seller: {
      taxId: e.QNB_VKN ?? "",
      title: "Apuhan Çiftliği Test",
      taxOffice: "Akçadağ",
      address,
      website: "https://apuhanciftligi.com",
    },
    buyer: {
      kind: "consumer",
      firstName: "Test",
      familyName: "Müşteri",
      address: { street: "Cumhuriyet Cad. No:5", district: "Battalgazi", city: "Malatya", postalCode: "44000" },
      email: null,
    },
    lines: [
      { name: "Gezen Tavuk Yumurtası", quantity: 2, unitCode: "PA", grossMinor: 25000, vatRate: 1 },
      { name: "Gün Kurusu Kayısı", quantity: 1.5, unitCode: "KGM", grossMinor: 112500, vatRate: 1 },
      { name: "Kargo ücreti", quantity: 1, unitCode: "C62", grossMinor: 9000, vatRate: 1 },
    ],
    payment: { method: "card", paidAt: now },
    carrier: { taxId: e.QNB_VKN ?? "", title: "Apuhan Çiftliği Test", address },
  };
}

describe.skipIf(!configured)("QNB test environment", () => {
  it("creates, finds and cancels an e-Arşiv invoice", async () => {
    const doc = testDocument();
    const created = await createEarsivInvoice(creds("EARSIV"), {
      uuid: doc.uuid,
      ublXml: buildUblInvoice(doc, "earsiv", "GIB2026000000001"),
    });
    if (!created.ok) throw created.error;
    expect(created.value.invoiceNumber).toMatch(/^[A-Z0-9]{3}\d{13}$/);
    expect(created.value.uuid.toLowerCase()).toBe(doc.uuid.toLowerCase());

    const found = await findEarsivInvoice(creds("EARSIV"), doc.uuid);
    if (!found.ok) throw found.error;
    expect(found.value.invoiceNumber).toBe(created.value.invoiceNumber);

    const cancelled = await cancelEarsivInvoice(creds("EARSIV"), doc.uuid);
    if (!cancelled.ok) throw cancelled.error;
  }, 60_000);

  it("finds our own e-Fatura registration", async () => {
    const regs = await lookupEfaturaRegistrations(creds("EFATURA"), e.QNB_VKN ?? "");
    if (!regs.ok) throw regs.error;
    expect(regs.value.length).toBeGreaterThan(0);
  }, 30_000);

  it.skipIf(!e.QNB_TEST_EFATURA_RECEIVER)("sends an e-Fatura to a registered receiver", async () => {
    const receiver = e.QNB_TEST_EFATURA_RECEIVER ?? "";
    const base = testDocument();
    const doc: InvoiceDocument = {
      ...base,
      buyer: { kind: "company", taxId: receiver, title: "Test Alıcı", taxOffice: "Test", address, email: null },
    };
    const regs = await lookupEfaturaRegistrations(creds("EFATURA"), receiver);
    if (!regs.ok) throw regs.error;
    const decision = chooseInvoiceChannel(doc.buyer, regs.value, doc.issuedAt);
    if (decision.channel !== "efatura") throw new Error(`${receiver} is not an e-Fatura user in the test env`);

    const sent = await sendEfatura(creds("EFATURA"), {
      uuid: doc.uuid,
      // e-Fatura keeps the number in the XML (QNB numbers only e-Arşiv here),
      // and the "GIB" series is reserved — use a unique APH test number.
      ublXml: buildUblInvoice(doc, "efatura", `APH${doc.issuedAt.getFullYear()}${String(Date.now()).slice(-9)}`),
      recipientLabel: decision.recipientLabel,
    });
    if (!sent.ok) throw sent.error;

    // Processing is async; poll briefly for a final state.
    let status = await getEfaturaStatus(creds("EFATURA"), sent.value.documentOid);
    for (let i = 0; i < 10 && status.ok && status.value.state === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      status = await getEfaturaStatus(creds("EFATURA"), sent.value.documentOid);
    }
    if (!status.ok) throw status.error;
    expect(status.value, JSON.stringify(status.value)).toMatchObject({ state: "processed" });
  }, 90_000);
});
