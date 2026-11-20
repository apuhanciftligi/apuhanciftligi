-- fatura_sadece_kart
--
-- Otomatik fatura yalnızca siteden verilip KARTLA (PayTR) ödenen siparişlere
-- kesilir. Owner kararı 2026-11-20: havale ve elden (kapıda) ödemeli
-- siparişlerin faturası zaten elle kesiliyor, sistem onlara dokunmaz.
-- Admin panelinden girilen siparişler de internet satışı olmadığı için
-- dışarıda kalır (source = 'customer_web' şartı).
--
-- 1. enqueue_invoice_on_paid() aynı imzayla, daha dar koşulla yeniden yazılır
--    (create or replace; trigger aynı fonksiyonu çağırmaya devam eder).
-- 2. 20261119235736_fatura_kuyrugu yayınından bu yana kuyruğa girmiş ama
--    QNB'ye HİÇ gönderilmemiş, kart dışı siparişlere ait satırlar silinir.
--    Fatura kesimi o zamandan beri kapalı (QNB ayarları girilmedi), yani
--    bu satırların hiçbiri fatura değil; silinmezse kesim açıldığında
--    elle faturalanan siparişlere ikinci fatura kesilirdi. Fatura numarası
--    almış ya da işlenmekte olan satırlara dokunulmaz.
--
-- Geriye dönük uyumlu: fonksiyon imzası ve tablo yapısı değişmez.

create or replace function enqueue_invoice_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from 'paid'
     and new.payment_method = 'credit_card'
     and new.source = 'customer_web'
     and new.total_minor > 0
     and new.status <> 'cancelled' then
    insert into invoices (order_id) values (new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

delete from public.invoices i
using public.orders o
where o.id = i.order_id
  and i.status in ('pending', 'failed', 'needs_attention')
  and i.invoice_number is null
  and i.qnb_document_oid is null
  and (o.payment_method <> 'credit_card' or o.source <> 'customer_web');
