"use server";

/**
 * Admin actions on the invoice queue. Reads go through the session client
 * (RLS: admins only); assertAdmin runs first so a non-admin gets a clear
 * error instead of an empty list.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { scheduleInvoiceProcessing } from "@/features/invoicing/application/process-invoices";
import { listInvoices, requeueInvoice } from "@/features/invoicing/infrastructure/invoice.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { ValidationError, type AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { InvoiceListRow } from "@/features/invoicing/infrastructure/invoice.repository";

export type { InvoiceListRow };

// Not exported: a "use server" module may export async functions only.
const INVOICE_PAGE_SIZE = 25;

export async function listInvoicesAction(
  page: number,
): Promise<Result<{ rows: InvoiceListRow[]; total: number; pageSize: number }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const res = await listInvoices(safePage, INVOICE_PAGE_SIZE);
  return res.ok ? ok({ ...res.value, pageSize: INVOICE_PAGE_SIZE }) : res;
}

export async function retryInvoiceAction(raw: unknown): Promise<Result<void, AppError>> {
  const parsed = z.object({ invoice_id: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return err(new ValidationError({ message: "Geçersiz fatura." }));
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const res = await requeueInvoice(parsed.data.invoice_id);
  if (!res.ok) return err(res.error);
  if (!res.value) {
    return err(new ValidationError({ message: "Bu fatura tekrar denenecek durumda değil." }));
  }
  await logAudit({
    actor_id: auth.value.id,
    action: "invoice.retried",
    entity_type: "invoice",
    entity_id: parsed.data.invoice_id,
    after: {},
  });
  scheduleInvoiceProcessing();
  revalidatePath("/faturalar");
  return ok(undefined);
}
