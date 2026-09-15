-- 2026-08 판매 원장을 스테이징에 적재. 이 파일은 staging 테이블만 건드리며
-- penjualan / pelanggan / produk / stok_mutasi 에는 아무것도 쓰지 않습니다.
-- 실행: psql "$DATABASE_URL" -f 00_staging.sql   (CSV와 같은 디렉터리에서)

DROP TABLE IF EXISTS stg_spb_2608;
CREATE TABLE stg_spb_2608 (
  so_no            text,
  so_seq           int,
  so_ref           text,
  tgl              date,
  target_delivery  text,
  buyer            text,
  pic              text,
  destination      text,
  brand            text,
  kategori         text,
  tipe             text,
  item_no          text,
  deskripsi        text,
  qty              numeric,
  harga            numeric,
  total            numeric,
  mata_uang        text
);

\copy stg_spb_2608 FROM 'spb_sales_2026_08.csv' WITH (FORMAT csv, HEADER true)

-- 기대값: 83행 / 58전표 / 405 EA / IDR 523,816,000
SELECT count(*)                AS baris,
       count(DISTINCT so_no)   AS transaksi,
       sum(qty)                AS qty,
       sum(total)              AS nilai,
       min(tgl)                AS dari,
       max(tgl)                AS sampai
FROM stg_spb_2608;
