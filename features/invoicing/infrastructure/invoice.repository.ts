/**
 * Invoice queue persistence. The worker runs on behalf of no signed-in user
 * (payment webhook, cron), so it uses the service-role client — the
 * sanctioned use of the admin client. Admin screens read through the
 * session client, where RLS limits the table to admins.
 *
 * `invoices` and `claim_due_invoices` are not in the generated Database type
 * yet; rows are Zod-parsed instead (the un-generated-table cast pattern).
 */
import "server-only";

import { z } from "zod";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { vatRateSchema } from "@/shared/vat";

import type { InvoiceChannel } from "@/features/invoicing/domain/invoice";
import type { InvoiceOrder } from "@/features/invoicing/domain/order-invoice";

export type InvoiceStatus =
  | "pending"
  | "processing"
  | "issued"
  | "failed"
  | "needs_attention"
  | "cancelled";

const invoiceRowSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  status: z.enum(["pending", "processing", "issued", "failed", "needs_attention", "cancelled"]),
  channel: z.enum(["earsiv", "efatura"]).nullable(),
  invoice_number: z.string().nullable(),
  view_url: z.string().nullable(),
  attempts: z.number().int(),
  last_error: z.string().nullable(),
  issued_at: z.string().nullable(),
  created_at: z.string(),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

const INVOICE_COLUMNS =
  "id, order_id, status, channel, invoice_number, view_url, attempts, last_error, issued_at, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any;

function dbError(event: string, error: { code?: string; message: string }, context: object) {
  logger.error({ ...context, code: error.code }, event);
  return err(new ExternalApiError({ message: error.message, cause: error }));
}

/** Hand due invoices to this worker (atomic, skip-locked). */
export async function claimDueInvoices(limit: number): Promise<Result<InvoiceRow[], ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase.rpc("claim_due_invoices", { p_limit: limit });
  if (error) return dbError("invoice_claim_failed", error, {});
  const parsed = z.array(invoiceRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    logger.error({ issueCount: parsed.error.issues.length }, "invoice_claim_invalid_rows");
    return err(new ExternalApiError({ message: "Fatura kuyruğu okunamadı." }));
  }
  return ok(parsed.data);
}

const orderBundleSchema = z.object({
  order_number: z.string(),
  status: z.string(),
  payment_status: z.string(),
  payment_method: z.string(),
  paid_at: z.string().nullable(),
  total_minor: z.coerce.number().int(),
  delivery_fee_minor: z.coerce.number().int(),
  fulfillment_channel: z.enum(["delivery", "shipping"]),
  delivery_address_snapshot: z.record(z.unknown()),
  customers: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  order_items: z.array(
    z.object({
      product_key: z.string(),
      quantity: z.coerce.number(),
      line_total_minor: z.coerce.number().int().nullable(),
      product_snapshot: z.record(z.unknown()),
      products: z.object({ vat_rate: vatRateSchema }),
    }),
  ),
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Load everything the invoice needs for one order, in one query. */
export async function loadInvoiceOrder(orderId: string): Promise<Result<InvoiceOrder, ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_number, status, payment_status, payment_method, paid_at, total_minor, delivery_fee_minor, " +
        "fulfillment_channel, delivery_address_snapshot, customers(first_name, last_name, email), " +
        "order_items(product_key, quantity, line_total_minor, product_snapshot, products(vat_rate))",
    )
    .eq("id", orderId)
    .single();
  if (error) return dbError("invoice_order_load_failed", error, { orderId });
  const parsed = orderBundleSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ orderId, issueCount: parsed.error.issues.length }, "invoice_order_invalid");
    return err(new ExternalApiError({ message: "Sipariş fatura için okunamadı." }));
  }
  const o = parsed.data;
  const a = o.delivery_address_snapshot;
  const street =
    [text(a.neighborhood), text(a.street), text(a.building_no) && `No:${text(a.building_no)}`,
      text(a.apartment_no) && `D:${text(a.apartment_no)}`]
      .filter(Boolean)
      .join(" ") || text(a.raw_text);
  return ok({
    orderNumber: o.order_number,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    paidAt: o.paid_at ? new Date(o.paid_at) : null,
    totalMinor: o.total_minor,
    deliveryFeeMinor: o.delivery_fee_minor,
    fulfillmentChannel: o.fulfillment_channel,
    customer: {
      firstName: o.customers.first_name ?? "",
      lastName: o.customers.last_name ?? "",
      email: o.customers.email,
    },
    address: {
      street,
      district: text(a.district),
      city: text(a.city),
      postalCode: text(a.postal_code) || null,
    },
    items: o.order_items.map((i) => ({
      name: text(i.product_snapshot.display_name) || i.product_key,
      unit: text(i.product_snapshot.unit),
      quantity: i.quantity,
      lineTotalMinor: i.line_total_minor ?? 0,
      vatRate: i.products.vat_rate,
    })),
  });
}

async function updateInvoice(
  id: string,
  patch: Record<string, unknown>,
  event: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { error } = await supabase
    .from("invoices")
    .update({ ...patch, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError(event, error, { invoiceId: id });
  return ok(undefined);
}

export function markInvoiceIssued(
  id: string,
  issued: { channel: InvoiceChannel; invoiceNumber: string; viewUrl: string | null; issuedAt: Date },
): Promise<Result<void, ExternalApiError>> {
  return updateInvoice(
    id,
    {
      status: "issued",
      channel: issued.channel,
      invoice_number: issued.invoiceNumber,
      view_url: issued.viewUrl,
      issued_at: issued.issuedAt.toISOString(),
      last_error: null,
    },
    "invoice_mark_issued_failed",
  );
}

/** A failed try: retried at `nextAttemptAt`, or parked for a human when null. */
export function markInvoiceFailed(
  id: string,
  reason: string,
  nextAttemptAt: Date | null,
): Promise<Result<void, ExternalApiError>> {
  return updateInvoice(
    id,
    nextAttemptAt
      ? { status: "failed", last_error: reason, next_attempt_at: nextAttemptAt.toISOString() }
      : { status: "needs_attention", last_error: reason },
    "invoice_mark_failed_failed",
  );
}

// ---- admin (session client, RLS: admins only) --------------------------------

export interface InvoiceListRow extends InvoiceRow {
  readonly order_number: string;
}

export async function listInvoices(
  page: number,
  pageSize: number,
): Promise<Result<{ rows: InvoiceListRow[]; total: number }, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as Untyped;
  const from = page * pageSize;
  const { data, error, count } = await supabase
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, orders(order_number)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return dbError("invoice_list_failed", error, { page });
  const parsed = z
    .array(invoiceRowSchema.extend({ orders: z.object({ order_number: z.string() }) }))
    .safeParse(data ?? []);
  if (!parsed.success) {
    logger.error({ issueCount: parsed.error.issues.length }, "invoice_list_invalid");
    return err(new ExternalApiError({ message: "Faturalar okunamadı." }));
  }
  return ok({
    rows: parsed.data.map(({ orders, ...row }) => ({ ...row, order_number: orders.order_number })),
    total: count ?? 0,
  });
}

/** Put a failed / parked invoice back in the queue, due now. */
export async function requeueInvoice(id: string): Promise<Result<boolean, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as Untyped;
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "pending", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["failed", "needs_attention"])
    .select("id");
  if (error) return dbError("invoice_requeue_failed", error, { invoiceId: id });
  return ok((data ?? []).length > 0);
}
