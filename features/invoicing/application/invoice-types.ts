/**
 * Types the admin UI needs from the invoicing feature. Kept out of
 * invoice-admin.ts: every export of a "use server" module is compiled as a
 * server action, so even a type re-export there breaks the build.
 */
export type { InvoiceListRow } from "@/features/invoicing/infrastructure/invoice.repository";
