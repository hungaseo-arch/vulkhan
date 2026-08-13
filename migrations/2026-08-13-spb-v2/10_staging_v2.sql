-- =====================================================================
-- 10_staging_v2.sql
-- 원천 3종 → staging 적재
--   ① SPB Daily Sales Report Jan - Juli 2026 (11082026)  → 394 라인 / 290 전표
--   ② stok_20260723.xlsx [Stok] 시트 품목·가격             → 31 품목
--   ③ stok_20260723.xlsx [Stok] 시트 재고 스냅샷           → 31 행 (2026-07-23 기준)
--
-- 실행:  psql "$DATABASE_URL" -f 10_staging_v2.sql
--        (Neon SQL Editor 는 \copy 미지원 → 콘솔 Import CSV 사용)
-- staging 은 매번 전량 재적재(TRUNCATE)합니다. 원천이 전체 스냅샷이기 때문입니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ① 판매 라인 staging
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stg_spb_sales (
  so_no            text    NOT NULL,
  so_seq           integer NOT NULL,
  so_ref           text    NOT NULL,
  tgl              date    NOT NULL,
  target_delivery  text,
  buyer            text    NOT NULL,
  pic              text,
  destination      text,
  brand            text,
  kategori         text,
  tipe             text,
  item_no          text    NOT NULL,
  deskripsi        text,
  qty              integer NOT NULL,
  harga            numeric(18,2) NOT NULL,
  total            numeric(18,2) NOT NULL,
  mata_uang        char(3) NOT NULL DEFAULT 'IDR',
  PRIMARY KEY (so_no, so_seq)
);

-- ---------------------------------------------------------------------
-- ② 품목 마스터 staging  (가격 포함)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stg_produk (
  kode        text PRIMARY KEY,
  nama        text NOT NULL,
  kategori    text,              -- Ban Jadi / Ban Jasa
  ukuran      text,              -- 10.00-20, 11R22.5 ...
  pola        text,              -- AJ101, AJ104, LL220 ...
  grade       text,
  harga_beli  numeric(18,2),
  harga_agen  numeric(18,2),
  harga_user  numeric(18,2),
  stok_min    integer DEFAULT 0,
  satuan      text DEFAULT 'pcs'
);

-- ---------------------------------------------------------------------
-- ③ 재고 스냅샷 staging
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stg_stok_snapshot (
  kode    text NOT NULL,
  gudang  text NOT NULL,
  qty     integer NOT NULL,
  tgl     date NOT NULL,
  PRIMARY KEY (kode, gudang, tgl)
);

TRUNCATE stg_spb_sales, stg_produk, stg_stok_snapshot;

\copy stg_spb_sales      FROM 'spb_sales_2026_v2.csv'        WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy stg_produk         FROM 'produk_master.csv'            WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy stg_stok_snapshot  FROM 'stok_snapshot_20260723.csv'   WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- =====================================================================
-- 적재 검증 — 기대값과 일치해야 다음 단계 진행
-- =====================================================================

-- ①  394 라인 / 290 전표 / 2,228 EA / IDR 3,001,976,000
SELECT count(*) AS line_cnt, count(DISTINCT so_no) AS doc_cnt,
       sum(qty) AS qty_total, sum(total) AS amt_total
FROM   stg_spb_sales;

-- 월별 (엑셀 All Sum 2026 시트와 전 월 일치 — 5월 보완 완료)
--   2026-01  226 /   308,080,000      2026-05  296 /   405,080,000
--   2026-02  292 /   389,630,000      2026-06  359 /   445,870,000
--   2026-03  171 /   251,190,000      2026-07  462 /   634,246,000
--   2026-04  422 /   567,880,000      합계   2,228 / 3,001,976,000
SELECT to_char(tgl,'YYYY-MM') AS bulan, count(*) AS lines,
       sum(qty) AS qty, sum(total) AS amt
FROM   stg_spb_sales GROUP BY 1 ORDER BY 1;

-- 금액 정합성 : 0 건이어야 정상
SELECT * FROM stg_spb_sales WHERE total <> qty * harga;

-- ②③ 31 품목 / 31 재고행, 판매 품번 26개가 모두 품목 마스터에 존재해야 함
SELECT (SELECT count(*) FROM stg_produk)        AS produk_cnt,
       (SELECT count(*) FROM stg_stok_snapshot) AS stok_cnt,
       (SELECT count(*) FROM (
          SELECT DISTINCT s.item_no FROM stg_spb_sales s
          LEFT JOIN stg_produk p ON p.kode = s.item_no
          WHERE p.kode IS NULL) x)              AS produk_hilang;  -- 0 이어야 정상
