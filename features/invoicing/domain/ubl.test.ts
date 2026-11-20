import { describe, expect, it } from "vitest";

import type { InvoiceDocument } from "@/features/invoicing/domain/invoice";
import { buildUblInvoice, formatAmount } from "@/features/invoicing/domain/ubl";
import { readAllTags, readTag } from "@/shared/xml";

const address = { street: "Bahri Mah. Mezarlık Cad. No:17", district: "Akçadağ", city: "Malatya", postalCode: null };

const doc: InvoiceDocument = {
  uuid: "3f2b9c1e-8a4d-4f6b-9e2a-1c5d7e9f0a1b",
  // 23:30 UTC = 02:30 next day in Istanbul — the date must follow Istanbul.
  issuedAt: new Date("2026-11-19T23:30:00Z"),
  orderNumber: "APH-1042",
  seller: {
    taxId: "0710634448",
    title: "Hamit Apuhan",
    taxOffice: "Akçadağ",
    address,
    website: "https://apuhanciftligi.com",
  },
  buyer: {
    kind: "consumer",
    firstName: "Ayşe Nur",
    familyName: "Yılmaz & Oğlu",
    address: { street: "Cumhuriyet Cad. 5", district: "Battalgazi", city: "Malatya", postalCode: "44000" },
    email: "ayse@example.com",
  },
  lines: [
    { name: "Gezen Tavuk Yumurtası", quantity: 2, unitCode: "PA", grossMinor: 25000, vatRate: 1 },
    { name: "Gün Kurusu Kayısı", quantity: 1.5, unitCode: "KGM", grossMinor: 112500, vatRate: 1 },
  ],
  payment: { method: "card", paidAt: new Date("2026-11-19T23:29:00Z") },
  carrier: { taxId: "0710634448", title: "Hamit Apuhan", address },
};

describe("formatAmount", () => {
  it("formats kuruş with two decimals", () => {
    expect(formatAmount(12871)).toBe("128.71");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(0)).toBe("0.00");
  });
});

describe("buildUblInvoice", () => {
  const archive = buildUblInvoice(doc, "earsiv", "APH2026000000001");

  it("writes an e-Arşiv internet sale with Istanbul date and time", () => {
    expect(readTag(archive, "ProfileID")).toBe("EARSIVFATURA");
    expect(readTag(archive, "IssueDate")).toBe("2026-11-20");
    expect(readTag(archive, "IssueTime")).toBe("02:30:00");
    expect(archive).toContain("<cbc:ID>IsInternetSale</cbc:ID>");
    expect(readTag(readTag(archive, "PaymentMeans") ?? "", "PaymentMeansCode")).toBe("48");
  });

  it("bills a consumer under the placeholder TCKN, keeping name and surname as given", () => {
    // Raw block (readAllTags) so the escaping itself can be checked.
    const party = readAllTags(archive, "AccountingCustomerParty")[0] ?? "";
    expect(party).toContain('<cbc:ID schemeID="TCKN">11111111111</cbc:ID>');
    expect(readTag(party, "FirstName")).toBe("Ayşe Nur");
    expect(readTag(party, "FamilyName")).toBe("Yılmaz & Oğlu");
    expect(party).toContain("Yılmaz &amp; Oğlu");
  });

  it("totals add up to the charged amount", () => {
    const total = readTag(archive, "LegalMonetaryTotal") ?? "";
    expect(readTag(total, "PayableAmount")).toBe("1375.00");
    expect(readTag(total, "LineExtensionAmount")).toBe("1361.38");
    const lines = readAllTags(archive, "InvoiceLine");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('<cbc:InvoicedQuantity unitCode="KGM">1.5</cbc:InvoicedQuantity>');
  });

  it("writes an e-Fatura for a company without the e-Arşiv flags", () => {
    const xml = buildUblInvoice(
      { ...doc, buyer: { kind: "company", taxId: "1234567890", title: "Örnek Gıda Ltd.", taxOffice: "Malatya", address, email: null } },
      "efatura",
      "APH2026000000002",
    );
    expect(readTag(xml, "ProfileID")).toBe("TEMELFATURA");
    expect(xml).not.toContain("IsInternetSale");
    const party = readTag(xml, "AccountingCustomerParty") ?? "";
    expect(party).toContain('<cbc:ID schemeID="VKN">1234567890</cbc:ID>');
    expect(readTag(party, "Name")).toBe("Örnek Gıda Ltd.");
  });
});
