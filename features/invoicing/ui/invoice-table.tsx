"use client";

/**
 * Admin invoice list: one row per queued/issued invoice, newest first. Issued
 * rows link to QNB's viewer; failed or parked rows show the reason and a
 * "Tekrar dene" button that puts them back in the queue.
 */
import { ExternalLink, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/shared/utils/date";

import { retryInvoiceAction } from "@/features/invoicing/application/invoice-admin";
import type { InvoiceListRow } from "@/features/invoicing/application/invoice-types";

const STATUS_LABEL: Record<InvoiceListRow["status"], string> = {
  pending: "Sırada",
  processing: "Gönderiliyor",
  issued: "Kesildi",
  failed: "Tekrar denenecek",
  needs_attention: "İlgilenilmeli",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<InvoiceListRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "secondary",
  issued: "default",
  failed: "outline",
  needs_attention: "destructive",
  cancelled: "outline",
};

function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryInvoiceAction({ invoice_id: id });
          if (res.ok) toast.success("Fatura tekrar sıraya alındı.");
          else toast.error(res.error.message);
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
      Tekrar dene
    </Button>
  );
}

export function InvoiceTable({ rows }: { rows: readonly InvoiceListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
        Henüz fatura yok. Kartla ya da havaleyle tamamen ödenen siparişler burada görünür.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/orders/${row.order_id}`} className="font-medium hover:underline">
                {row.order_number}
              </Link>
              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              {row.invoice_number ? (
                <span className="font-mono text-xs text-muted-foreground">{row.invoice_number}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {row.issued_at ? `Kesildi: ${formatDateTime(row.issued_at)}` : `Sıraya girdi: ${formatDateTime(row.created_at)}`}
              {row.attempts > 0 && row.status !== "issued" ? ` · ${row.attempts}. deneme` : ""}
            </p>
            {row.last_error && row.status !== "issued" ? (
              <p className="break-words text-xs text-destructive">{row.last_error}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {row.view_url ? (
              <Button size="sm" variant="secondary" className="gap-1.5" render={<a href={row.view_url} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="h-3.5 w-3.5" />
                Faturayı gör
              </Button>
            ) : null}
            {row.status === "failed" || row.status === "needs_attention" ? <RetryButton id={row.id} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
