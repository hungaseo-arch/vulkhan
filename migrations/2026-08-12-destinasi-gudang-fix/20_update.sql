-- Correct penjualan.gudang / stok_mutasi.gudang per-document using the
-- Destination column from spb_slim.csv (SURABAYA->SBY, SEMARANG->SMG,
-- JAKARTA->KRW), replacing the blanket KRW every row got from the
-- UTM->KRW rename in 2026-08-12-gudang-restructure. Only rows that
-- actually change are touched; rows with no matching so_no are untouched.
BEGIN;

UPDATE penjualan p
SET    gudang = s.gudang
FROM   stg_destinasi_gudang s
WHERE  s.so_no = p.no
  AND  p.gudang IS DISTINCT FROM s.gudang;

UPDATE stok_mutasi sm
SET    gudang = s.gudang
FROM   stg_destinasi_gudang s
WHERE  s.so_no = sm.ref
  AND  sm.gudang IS DISTINCT FROM s.gudang;

-- verification
SELECT gudang, count(*) AS n FROM penjualan GROUP BY 1 ORDER BY 1;
SELECT gudang, count(*) AS n FROM stok_mutasi GROUP BY 1 ORDER BY 1;

COMMIT;
