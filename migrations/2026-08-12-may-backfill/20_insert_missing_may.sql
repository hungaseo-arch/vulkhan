-- Additive-only backfill: insert ONLY the 17 May-2026 documents (24 lines) present in the
-- source CSV but absent from production penjualan.no. Zero updates/deletes to existing rows.
-- All 52 buyers and 31 products in the missing rows already exist in pelanggan/produk (verified).
BEGIN;

CREATE TEMP TABLE missing_so AS
SELECT DISTINCT s.so_no
FROM stg_spb_sales s
LEFT JOIN penjualan p ON p.no = s.so_no
WHERE p.no IS NULL;

-- 1) penjualan headers (id derived with the same formula already used in production:
--    'SO-' || upper(substr(md5(no),1,6))), status='lunas' matching existing historical-import rows
INSERT INTO penjualan (id, no, tgl, pelanggan, gudang, status)
SELECT 'SO-' || upper(substr(md5(h.so_no), 1, 6)),
       h.so_no,
       h.tgl,
       c.id,
       'UTM',
       'lunas'
FROM (
  SELECT so_no, min(tgl) AS tgl, min(buyer) AS buyer
  FROM stg_spb_sales
  WHERE so_no IN (SELECT so_no FROM missing_so)
  GROUP BY so_no
) h
JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(h.buyer));

-- 2) penjualan_item lines (id auto-increment)
INSERT INTO penjualan_item (penjualan, produk, qty, harga)
SELECT p.id, s.item_no, s.qty, s.harga
FROM stg_spb_sales s
JOIN penjualan p ON p.no = s.so_no
WHERE s.so_no IN (SELECT so_no FROM missing_so);

-- 3) stok_mutasi outbound movements, matching the convention of existing historical-import rows
--    (tipe='keluar', qty negative, ref=so_no, catatan fixed string)
INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
SELECT s.tgl, 'UTM', s.item_no, 'keluar', -s.qty, s.so_no, 'Pengiriman penjualan (import historis)'
FROM stg_spb_sales s
JOIN penjualan p ON p.no = s.so_no
WHERE s.so_no IN (SELECT so_no FROM missing_so);

-- verification
SELECT 'missing_so' t, count(*) n FROM missing_so
UNION ALL SELECT 'penjualan_inserted', count(*) FROM penjualan WHERE no IN (SELECT so_no FROM missing_so)
UNION ALL SELECT 'penjualan_item_inserted', count(*) FROM penjualan_item pi JOIN penjualan p ON p.id = pi.penjualan WHERE p.no IN (SELECT so_no FROM missing_so)
UNION ALL SELECT 'stok_mutasi_inserted', count(*) FROM stok_mutasi WHERE ref IN (SELECT so_no FROM missing_so);

COMMIT;

-- post-commit totals — expect penjualan=290, penjualan_item=394, stok_mutasi=394
SELECT 'penjualan' t, count(*) n FROM penjualan
UNION ALL SELECT 'penjualan_item', count(*) FROM penjualan_item
UNION ALL SELECT 'stok_mutasi',    count(*) FROM stok_mutasi;

-- monthly reconciliation vs source (expect exact match to the "All Sum 2026" sheet per month)
SELECT to_char(tgl,'YYYY-MM') AS bulan, count(*) AS docs
FROM penjualan GROUP BY 1 ORDER BY 1;
