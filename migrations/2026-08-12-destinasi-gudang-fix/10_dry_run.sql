-- Read-only dry run — run this BEFORE 20_update.sql and review the output.
-- No writes happen here.

-- 1) How many penjualan rows would actually change gudang, and to what.
SELECT p.gudang AS gudang_saat_ini, s.gudang AS gudang_baru, count(*) AS n
FROM penjualan p
JOIN stg_destinasi_gudang s ON s.so_no = p.no
WHERE p.gudang IS DISTINCT FROM s.gudang
GROUP BY 1, 2
ORDER BY 1, 2;

-- 2) Same, for stok_mutasi (ref = penjualan.no, per convention in
--    2026-08-12-may-backfill/20_insert_missing_may.sql).
SELECT sm.gudang AS gudang_saat_ini, s.gudang AS gudang_baru, count(*) AS n
FROM stok_mutasi sm
JOIN stg_destinasi_gudang s ON s.so_no = sm.ref
WHERE sm.gudang IS DISTINCT FROM s.gudang
GROUP BY 1, 2
ORDER BY 1, 2;

-- 3) so_no present in spb_slim.csv but with NO matching penjualan row yet
--    (would need a backfill first, not covered by this migration).
SELECT s.so_no
FROM stg_destinasi_gudang s
LEFT JOIN penjualan p ON p.no = s.so_no
WHERE p.no IS NULL
ORDER BY 1;

-- 4) penjualan rows with NO matching so_no in spb_slim.csv (would be left
--    untouched by this migration — worth checking these aren't silently wrong).
SELECT p.no, p.tgl, p.gudang
FROM penjualan p
LEFT JOIN stg_destinasi_gudang s ON s.so_no = p.no
WHERE s.so_no IS NULL
ORDER BY p.no;

-- 5) sanity: resulting gudang distribution across penjualan, if applied.
SELECT COALESCE(s.gudang, p.gudang) AS gudang_setelah, count(*) AS n
FROM penjualan p
LEFT JOIN stg_destinasi_gudang s ON s.so_no = p.no
GROUP BY 1
ORDER BY 1;
