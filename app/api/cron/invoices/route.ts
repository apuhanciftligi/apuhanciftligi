/**
 * Daily invoice sweep (Vercel Cron, vercel.json). The normal path invoices
 * right after a payment; this retries anything that failed or was left
 * behind. Vercel sends "Authorization: Bearer $CRON_SECRET"; without the
 * secret configured every call is refused.
 */
import { timingSafeEqual } from "node:crypto";

import { processDueInvoices } from "@/features/invoicing/application/process-invoices";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";

function authorized(header: string | null): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  // A few batches per run; each is at most 10 invoices.
  let processed = 0;
  let issued = 0;
  for (let batch = 0; batch < 5; batch++) {
    const result = await processDueInvoices();
    if (!result || result.processed === 0) break;
    processed += result.processed;
    issued += result.issued;
  }
  logger.info({ processed, issued }, "invoice_cron_done");
  return Response.json({ processed, issued });
}
