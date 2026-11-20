/**
 * Faturalar — the QNB invoice queue and record. Card and havale orders land
 * here automatically once fully paid; issued ones link to the invoice, failed
 * ones show why and can be retried. Paginated (25 per page).
 */
import Link from "next/link";

import { listInvoicesAction } from "@/features/invoicing/application/invoice-admin";
import { InvoiceTable } from "@/features/invoicing/ui/invoice-table";

export default async function FaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listInvoicesAction(page - 1);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Faturalar yüklenemedi: {result.error.message}
      </div>
    );
  }

  const { rows, total, pageSize } = result.value;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Faturalar</h1>
        <p className="text-sm text-muted-foreground">
          Kartla ya da havaleyle tamamen ödenen siparişlerin e-Arşiv faturaları QNB üzerinden otomatik kesilir.
        </p>
      </div>
      <InvoiceTable rows={rows} />
      {pageCount > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Sayfalar">
          {page > 1 ? <Link href={`/faturalar?page=${page - 1}`} className="hover:underline">← Önceki</Link> : <span />}
          <span className="text-muted-foreground">{page} / {pageCount}</span>
          {page < pageCount ? <Link href={`/faturalar?page=${page + 1}`} className="hover:underline">Sonraki →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
