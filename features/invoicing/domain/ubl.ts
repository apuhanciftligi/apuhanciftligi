/**
 * UBL-TR 1.2 invoice XML for GİB e-Fatura (TEMELFATURA) and e-Arşiv
 * (EARSIVFATURA). Hand-built: the document is a fixed shape and UBL is strict
 * about element ORDER, so the order below follows the UBL 2.1 Invoice schema
 * sequence and must not be rearranged.
 *
 * The XML is unsigned. QNB, as the special integrator, signs it; the
 * cac:Signature block only names the signing party, as GİB requires.
 */
import { formatInTimeZone } from "date-fns-tz";

import { escapeXml } from "@/shared/xml";

import {
  CONSUMER_PLACEHOLDER_TCKN,
  computeInvoiceTotals,
  type InvoiceAddress,
  type InvoiceChannel,
  type InvoiceDocument,
  type InvoicePaymentMethod,
} from "@/features/invoicing/domain/invoice";

const TZ = "Europe/Istanbul";

/** kuruş → "128.71" */
export function formatAmount(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Decimal quantity without float noise: 1.5 → "1.5", 2 → "2". */
function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(3)));
}

/**
 * Unit price = line base / quantity, 4 decimals at most, trailing zeros cut.
 * 4 places keep price × quantity equal to the line amount at the kuruş for
 * every quantity we sell, without printing 742,57333333 on the invoice.
 */
function formatUnitPrice(netMinor: number, quantity: number): string {
  return String(Number((netMinor / 100 / quantity).toFixed(4)));
}

function t(tag: string, value: string, attrs = ""): string {
  return `<${tag}${attrs}>${escapeXml(value)}</${tag}>`;
}

function money(tag: string, minor: number): string {
  return t(tag, formatAmount(minor), ' currencyID="TRY"');
}

function schemeFor(taxId: string): "VKN" | "TCKN" {
  return taxId.length === 11 ? "TCKN" : "VKN";
}

function address(a: InvoiceAddress): string {
  return (
    "<cac:PostalAddress>" +
    t("cbc:StreetName", a.street) +
    t("cbc:CitySubdivisionName", a.district) +
    t("cbc:CityName", a.city) +
    (a.postalCode ? t("cbc:PostalZone", a.postalCode) : "") +
    "<cac:Country>" + t("cbc:Name", "Türkiye") + "</cac:Country>" +
    "</cac:PostalAddress>"
  );
}

function taxScheme(taxOffice: string): string {
  return (
    "<cac:PartyTaxScheme><cac:TaxScheme>" + t("cbc:Name", taxOffice) +
    "</cac:TaxScheme></cac:PartyTaxScheme>"
  );
}

function person(firstName: string, familyName: string): string {
  return (
    "<cac:Person>" + t("cbc:FirstName", firstName) +
    t("cbc:FamilyName", familyName) + "</cac:Person>"
  );
}

/** A TCKN holder known only by one full-name string: last word is the surname. */
function personFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const familyName = parts.length > 1 ? (parts.pop() ?? "") : "";
  return person(parts.join(" "), familyName);
}

function partyId(taxId: string): string {
  return (
    "<cac:PartyIdentification>" +
    t("cbc:ID", taxId, ` schemeID="${schemeFor(taxId)}"`) +
    "</cac:PartyIdentification>"
  );
}

function supplier(doc: InvoiceDocument): string {
  const s = doc.seller;
  return (
    "<cac:AccountingSupplierParty><cac:Party>" +
    t("cbc:WebsiteURI", s.website) +
    partyId(s.taxId) +
    "<cac:PartyName>" + t("cbc:Name", s.title) + "</cac:PartyName>" +
    address(s.address) +
    taxScheme(s.taxOffice) +
    (schemeFor(s.taxId) === "TCKN" ? personFromFullName(s.title) : "") +
    "</cac:Party></cac:AccountingSupplierParty>"
  );
}

function customer(doc: InvoiceDocument): string {
  const b = doc.buyer;
  const contact = b.email ? "<cac:Contact>" + t("cbc:ElectronicMail", b.email) + "</cac:Contact>" : "";
  if (b.kind === "consumer") {
    return (
      "<cac:AccountingCustomerParty><cac:Party>" +
      partyId(CONSUMER_PLACEHOLDER_TCKN) +
      address(b.address) +
      contact +
      person(b.firstName, b.familyName) +
      "</cac:Party></cac:AccountingCustomerParty>"
    );
  }
  const isPerson = schemeFor(b.taxId) === "TCKN";
  return (
    "<cac:AccountingCustomerParty><cac:Party>" +
    partyId(b.taxId) +
    (isPerson ? "" : "<cac:PartyName>" + t("cbc:Name", b.title) + "</cac:PartyName>") +
    address(b.address) +
    taxScheme(b.taxOffice) +
    contact +
    (isPerson ? personFromFullName(b.title) : "") +
    "</cac:Party></cac:AccountingCustomerParty>"
  );
}

/**
 * UN/ECE 4461 payment means codes as GİB lists them for internet sales, plus
 * the wording printed on the invoice (QNB's template shows only the note).
 */
const PAYMENT_MEANS: Record<InvoicePaymentMethod, { code: string; label: string }> = {
  card: { code: "48", label: "Kredi Kartı / Banka Kartı" },
  bank_transfer: { code: "30", label: "EFT / Havale" },
};

function taxSubtotal(taxableMinor: number, vatMinor: number, rate: number): string {
  return (
    "<cac:TaxSubtotal>" +
    money("cbc:TaxableAmount", taxableMinor) +
    money("cbc:TaxAmount", vatMinor) +
    t("cbc:Percent", String(rate)) +
    "<cac:TaxCategory><cac:TaxScheme>" +
    t("cbc:Name", "KDV") + t("cbc:TaxTypeCode", "0015") +
    "</cac:TaxScheme></cac:TaxCategory>" +
    "</cac:TaxSubtotal>"
  );
}

/**
 * Build the invoice XML. `invoiceId` is the 16-character GİB number
 * (series + year + sequence); when the integrator numbers the invoice it
 * overwrites this value.
 */
export function buildUblInvoice(
  doc: InvoiceDocument,
  channel: InvoiceChannel,
  invoiceId: string,
): string {
  const totals = computeInvoiceTotals(doc.lines);
  const issueDate = formatInTimeZone(doc.issuedAt, TZ, "yyyy-MM-dd");
  const issueTime = formatInTimeZone(doc.issuedAt, TZ, "HH:mm:ss");
  const paidDate = formatInTimeZone(doc.payment.paidAt, TZ, "yyyy-MM-dd");
  const isArchive = channel === "earsiv";

  // Internet-sale details (carrier, despatch date, payment). Mandatory on an
  // e-Arşiv internet sale and valid on e-Fatura too, so always written.
  const delivery =
    "<cac:Delivery><cac:CarrierParty>" +
    partyId(doc.carrier.taxId) +
    "<cac:PartyName>" + t("cbc:Name", doc.carrier.title) + "</cac:PartyName>" +
    address(doc.carrier.address) +
    "</cac:CarrierParty><cac:Despatch>" +
    t("cbc:ActualDespatchDate", issueDate) +
    "</cac:Despatch></cac:Delivery>";
  const paymentMeans =
    "<cac:PaymentMeans>" +
    t("cbc:PaymentMeansCode", PAYMENT_MEANS[doc.payment.method].code) +
    t("cbc:PaymentDueDate", paidDate) +
    t("cbc:InstructionNote", PAYMENT_MEANS[doc.payment.method].label) +
    "</cac:PaymentMeans>";

  const lines = totals.lines
    .map(
      (line, i) =>
        "<cac:InvoiceLine>" +
        t("cbc:ID", String(i + 1)) +
        t("cbc:InvoicedQuantity", formatQuantity(line.quantity), ` unitCode="${line.unitCode}"`) +
        money("cbc:LineExtensionAmount", line.netMinor) +
        "<cac:TaxTotal>" + money("cbc:TaxAmount", line.vatMinor) +
        taxSubtotal(line.netMinor, line.vatMinor, line.vatRate) + "</cac:TaxTotal>" +
        "<cac:Item>" + t("cbc:Name", line.name) + "</cac:Item>" +
        "<cac:Price>" + t("cbc:PriceAmount", formatUnitPrice(line.netMinor, line.quantity), ' currencyID="TRY"') + "</cac:Price>" +
        "</cac:InvoiceLine>",
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' +
    ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
    ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">' +
    "<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>" +
    t("cbc:UBLVersionID", "2.1") +
    t("cbc:CustomizationID", "TR1.2") +
    t("cbc:ProfileID", isArchive ? "EARSIVFATURA" : "TEMELFATURA") +
    t("cbc:ID", invoiceId) +
    t("cbc:CopyIndicator", "false") +
    t("cbc:UUID", doc.uuid) +
    t("cbc:IssueDate", issueDate) +
    t("cbc:IssueTime", issueTime) +
    t("cbc:InvoiceTypeCode", "SATIS") +
    t("cbc:Note", `Sipariş No: ${doc.orderNumber}`) +
    // QNB requires the e-Arşiv delivery method as a note in exactly this form.
    (isArchive ? t("cbc:Note", "Gönderim Şekli: ELEKTRONIK") : "") +
    t("cbc:DocumentCurrencyCode", "TRY") +
    t("cbc:LineCountNumeric", String(totals.lines.length)) +
    "<cac:OrderReference>" + t("cbc:ID", doc.orderNumber) + t("cbc:IssueDate", paidDate) + "</cac:OrderReference>" +
    "<cac:Signature>" +
    t("cbc:ID", doc.seller.taxId, ' schemeID="VKN_TCKN"') +
    "<cac:SignatoryParty>" + partyId(doc.seller.taxId) + address(doc.seller.address) + "</cac:SignatoryParty>" +
    "<cac:DigitalSignatureAttachment><cac:ExternalReference>" +
    t("cbc:URI", "#Signature") +
    "</cac:ExternalReference></cac:DigitalSignatureAttachment>" +
    "</cac:Signature>" +
    supplier(doc) +
    customer(doc) +
    delivery +
    paymentMeans +
    "<cac:TaxTotal>" + money("cbc:TaxAmount", totals.vatMinor) +
    totals.taxSubtotals.map((s) => taxSubtotal(s.taxableMinor, s.vatMinor, s.vatRate)).join("") +
    "</cac:TaxTotal>" +
    "<cac:LegalMonetaryTotal>" +
    money("cbc:LineExtensionAmount", totals.netMinor) +
    money("cbc:TaxExclusiveAmount", totals.netMinor) +
    money("cbc:TaxInclusiveAmount", totals.grossMinor) +
    money("cbc:PayableAmount", totals.grossMinor) +
    "</cac:LegalMonetaryTotal>" +
    lines +
    "</Invoice>"
  );
}
