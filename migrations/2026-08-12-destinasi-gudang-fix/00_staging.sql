-- Load the SO -> Destination -> gudang mapping derived from spb_slim.csv
-- (Destination column), so production gudang can be corrected per-document
-- instead of the blanket KRW every penjualan row currently has.
DROP TABLE IF EXISTS stg_destinasi_gudang;
CREATE TABLE stg_destinasi_gudang (
  so_no       text,
  destination text,
  gudang      text
);

\copy stg_destinasi_gudang FROM 'destinasi_gudang.csv' WITH (FORMAT csv, HEADER true)

SELECT count(*) AS rows_loaded, count(DISTINCT so_no) AS distinct_so FROM stg_destinasi_gudang;
