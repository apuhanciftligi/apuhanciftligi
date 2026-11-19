-- urun_kdv_orani
--
-- Ürünlere KDV oranı (yüzde, tam sayı) ekler. QNB e-Arşiv fatura satırları
-- bu oranla kesilecek: satış fiyatları KDV dahil, fatura matrahı ve KDV'yi
-- bu orandan ayırır (kod: features/products/domain/vat.ts).
--
-- Oranlar: 2007/13033 sayılı KDV oranları kararı, (I) sayılı liste
-- "A) GIDA MADDELERİ" (GİB güncel metni, son değişiklik 9126 s. CK, 15/11/2024).
-- Sattığımız her ürün bu listede, yani %1:
--   canlı tavuk           GTP 01.05 (canlı kümes hayvanları)
--   süt, yoğurt, peynir,
--   çökelek, yumurta      4 no.lu fasıl
--   kayısı, dut (yaş/kuru),
--   Kışlık Sepet içeriği  8 no.lu fasıl (meyveler)
--   kayısı çekirdeği      12 no.lu fasıl / (I) liste B-2/b'de adıyla sayılmış
--   dut pekmezi           17 / 21 no.lu fasıl
-- Bu yüzden default 1: mevcut bütün satırlar doğru orana oturur, ayrıca
-- update gerekmez. Gıda dışı bir ürün eklenirse admin fiyat kartından
-- oranını seçer (genel oran %20).
--
-- Geriye dönük uyumlu: default'lu yeni kolon. Eski kod kolonu bilmeden
-- insert ettiğinde de default alır. products tablosunun RLS politikaları ve
-- tablo düzeyindeki select/update yetkileri yeni kolonu da kapsar. Index yok:
-- kolon filtrelenmiyor, sadece okunuyor.

alter table public.products
  add column vat_rate smallint not null default 1
    check (vat_rate in (0, 1, 10, 20));

comment on column public.products.vat_rate is
  'KDV oranı (yüzde). Fiyatlar KDV dahil; fatura matrah/KDV ayrımı bu orandan yapılır. Gıda (I) sayılı liste: 1, (II): 10, genel: 20.';
