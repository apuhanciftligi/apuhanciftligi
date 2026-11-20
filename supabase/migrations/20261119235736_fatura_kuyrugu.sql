-- fatura_kuyrugu
--
-- QNB e-Arşiv / e-Fatura için fatura kuyruğu. Bir web siparişi kartla
-- (PayTR) ya da havaleyle TAMAMEN ödendiğinde (payment_status → 'paid')
-- trigger buraya bir satır ekler; uygulama satırı QNB'ye gönderir ve sonucu
-- (fatura no, görüntüleme linki ya da hata) aynı satıra yazar.
--
-- Kurallar:
--   * Sipariş başına tek fatura (order_id unique). Trigger "on conflict do
--     nothing" yapar: ödeme silinip yeniden girilse de ikinci fatura açılmaz.
--   * Kapıda ödeme (cash_on_delivery) ve toplamı 0 olan siparişler kuyruğa
--     girmez (owner kararı 2026-11-19: önce kart + havale).
--   * Faturası kesilmiş siparişin tutarı değiştirilemez (aşağıdaki kilit).
--   * id = faturanın ETTN'si; QNB'ye islemId/belgeNo olarak da gider, böylece
--     yeniden deneme aynı faturayı tanır, ikinci fatura kesmez.
--
-- Geriye dönük uyumlu: yeni tablo + yeni trigger'lar. Mevcut kolon/fonksiyon
-- imzası değişmez. Geçmiş siparişler kuyruğa girmez (trigger sadece bundan
-- sonraki 'paid' geçişlerinde çalışır).

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  -- restrict: a fiscal record must outlive any attempt to delete its order.
  order_id uuid not null unique references public.orders(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'issued', 'failed', 'needs_attention', 'cancelled')),
  channel text check (channel in ('earsiv', 'efatura')),
  invoice_number text,
  view_url text,
  qnb_document_oid text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  -- A 'processing' row whose lock expired (worker crashed) is claimed again.
  locked_until timestamptz,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Worker scan: due rows only. Partial, so issued/cancelled history (the bulk
-- of the table over time) never enters it.
create index invoices_due_idx on public.invoices (next_attempt_at)
  where status in ('pending', 'failed', 'processing');
-- Admin list: newest first, paginated.
create index invoices_created_at_idx on public.invoices (created_at desc);

alter table public.invoices enable row level security;
create policy invoices_admin_all on public.invoices
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.invoices to authenticated;

comment on table public.invoices is
  'QNB e-Arşiv/e-Fatura queue + record, one per order. Filled by orders_enqueue_invoice when a card/havale order becomes paid.';

-- ---- enqueue on paid ---------------------------------------------------------

create or replace function enqueue_invoice_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from 'paid'
     and new.payment_method in ('credit_card', 'bank_transfer')
     and new.total_minor > 0
     and new.status <> 'cancelled' then
    insert into invoices (order_id) values (new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger orders_enqueue_invoice
  after update of payment_status on public.orders
  for each row execute function enqueue_invoice_on_paid();

-- ---- lock amounts once invoiced ---------------------------------------------

create or replace function block_invoiced_order_amount_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.subtotal_minor is distinct from old.subtotal_minor
      or new.delivery_fee_minor is distinct from old.delivery_fee_minor)
     and exists (
       select 1 from invoices
       where order_id = new.id and status in ('processing', 'issued')
     ) then
    raise exception 'Faturası kesilmiş siparişin tutarı değiştirilemez. Önce faturayı iptal edin.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_block_invoiced_amount_change
  before update of subtotal_minor, delivery_fee_minor on public.orders
  for each row execute function block_invoiced_order_amount_change();

-- ---- worker claim ------------------------------------------------------------

-- Atomically hand up to p_limit due invoices to one worker. skip locked lets
-- concurrent workers (payment hook + daily cron) never take the same row.
create or replace function claim_due_invoices(p_limit integer)
returns setof invoices
language sql
security definer
set search_path = public
as $$
  update invoices
  set status = 'processing',
      locked_until = now() + interval '5 minutes',
      attempts = attempts + 1,
      updated_at = now()
  where id in (
    select id from invoices
    where (status in ('pending', 'failed') and next_attempt_at <= now())
       or (status = 'processing' and locked_until < now())
    order by next_attempt_at
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  )
  returning *;
$$;

revoke all on function claim_due_invoices(integer) from public;
revoke all on function claim_due_invoices(integer) from anon, authenticated;
grant execute on function claim_due_invoices(integer) to service_role;
