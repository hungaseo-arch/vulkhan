-- Staging table for source sales CSV (real schema does not match original 10_staging_v2.sql assumptions,
-- so this is a minimal staging load: just the sales lines, used only to diff against production).
DROP TABLE IF EXISTS stg_spb_sales;
CREATE TABLE stg_spb_sales (
  so_no           text,
  so_seq          int,
  so_ref          text,
  tgl             date,
  target_delivery text,
  buyer           text,
  pic             text,
  destination     text,
  brand           text,
  kategori        text,
  tipe            text,
  item_no         text,
  deskripsi       text,
  qty             numeric,
  harga           numeric,
  total           numeric,
  mata_uang       text
);

\copy stg_spb_sales FROM 'spb_sales_2026_v2.csv' WITH (FORMAT csv, HEADER true)

-- sanity totals: expect 394 lines / 290 docs / 2228 EA / 3,001,976,000
SELECT count(*) AS line_cnt, count(DISTINCT so_no) AS doc_cnt,
       sum(qty) AS qty_total, sum(total) AS amt_total
FROM   stg_spb_sales;
