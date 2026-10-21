-- 2025년 판매 원장을 스테이징에 적재합니다. 이 파일은 staging 테이블만 만들며
-- penjualan / pelanggan / produk / stok_mutasi 에는 아무것도 쓰지 않습니다.
-- 실행: psql "$DATABASE_URL" -f 00_staging.sql   (CSV와 같은 디렉터리에서)
-- Neon 콘솔(SQL Editor)이면 이 파일 대신 00_staging_konsol.sql 을 쓰십시오.

DROP TABLE IF EXISTS stg_spb_2025;
CREATE TABLE stg_spb_2025 (
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

\copy stg_spb_2025 FROM 'spb_sales_2025.csv' WITH (FORMAT csv, HEADER true)

-- 기대값: 398행 / 290전표 / 2,650 EA / IDR 2,785,930,000 / 2025-01-02 ~ 2025-12-30
SELECT count(*)                AS baris,
       count(DISTINCT so_no)   AS transaksi,
       sum(qty)                AS qty,
       sum(total)              AS nilai,
       min(tgl)                AS dari,
       max(tgl)                AS sampai
FROM stg_spb_2025;
