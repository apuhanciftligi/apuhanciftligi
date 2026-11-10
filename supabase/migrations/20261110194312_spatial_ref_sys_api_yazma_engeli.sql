-- spatial_ref_sys_api_yazma_engeli
--
-- Ne yapıyor ve NEDEN?
-- PostGIS'in public.spatial_ref_sys tablosu (koordinat sistemi tanımları) Supabase'in
-- kendi rolüne (supabase_admin) ait. O rol anon ve authenticated'a tabloda tam yazma
-- yetkisi vermiş ve RLS kapalı. Yani giriş yapmamış biri bile site API'si üzerinden
-- satır silip değiştirebiliyor; geography mesafe hesapları (rota, teslimat bölgesi) bu
-- tablodan okuduğu için bozulur. Tablonun sahibi biz olmadığımız için RLS'i açamıyor,
-- yetkileri de geri alamıyoruz. Elimizdeki tek yetki TRIGGER; bu migration anon ve
-- authenticated'dan gelen her yazmayı (insert/update/delete/truncate) reddeden bir
-- trigger ekler. Okuma serbest kalır; PostGIS ve sunucu tarafı (service_role,
-- postgres, supabase_admin — ör. eklenti güncellemesi) etkilenmez.
-- Supabase'in "RLS Disabled in Public" uyarısı yalnızca RLS bayrağına baktığı için
-- listede kalır; onu kapatmak tablo sahibinin (Supabase destek) işidir.

create or replace function public.block_spatial_ref_sys_api_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only for API roles'
      using errcode = 'insufficient_privilege';
  end if;
  return null;
end;
$$;

-- Trigger functions are never called directly; firing a trigger needs no EXECUTE
-- on the function, so nobody gets to call it as an RPC.
revoke execute on function public.block_spatial_ref_sys_api_writes() from public, anon, authenticated;

drop trigger if exists spatial_ref_sys_block_api_writes on public.spatial_ref_sys;
create trigger spatial_ref_sys_block_api_writes
  before insert or update or delete or truncate on public.spatial_ref_sys
  for each statement
  execute function public.block_spatial_ref_sys_api_writes();
