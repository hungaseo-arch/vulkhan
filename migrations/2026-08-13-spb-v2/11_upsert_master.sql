-- =====================================================================
-- 11_upsert_master.sql
-- 마스터 추가 + 업데이트 (gudang / pelanggan / produk)
-- 재실행 안전(idempotent). 신규는 INSERT, 기존은 값이 바뀐 행만 UPDATE.
--
-- ⚠ 컬럼명 추정 구간은 [가정] 주석으로 표시했습니다. 00_cek_skema.sql 결과로 확정하세요.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. gudang (창고)
--    stok_20260723 파일의 재고 창고는 'UTM' 1개뿐이므로 재고 기준 창고는 UTM.
--    판매의 Destination(SURABAYA/SEMARANG/JAKARTA)은 '납품지'이지 창고가 아니므로
--    penjualan.keterangan 에 보관합니다(12번 스크립트).
--    ※ 지점별 재고를 따로 관리하실 계획이면 아래 두 번째 INSERT 주석을 해제하세요.
-- ---------------------------------------------------------------------
INSERT INTO gudang (id, nama)                                  -- [가정] gudang(id, nama)
VALUES ('UTM', 'UTM')
ON CONFLICT (id) DO UPDATE
   SET nama = EXCLUDED.nama
 WHERE gudang.nama IS DISTINCT FROM EXCLUDED.nama;

-- INSERT INTO gudang (id, nama) VALUES
--   ('SBY','Surabaya'), ('SMG','Semarang'), ('JKT','Jakarta')
-- ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. pelanggan (거래처) — 52개
--    매칭키 : 거래처명 대문자·공백정규화. 신규만 채번(C0001~).
-- ---------------------------------------------------------------------
WITH src AS (
  SELECT DISTINCT btrim(buyer) AS nama,
         upper(btrim(buyer))   AS nama_key
  FROM   stg_spb_sales
),
baru AS (                                    -- 아직 DB 에 없는 거래처만
  SELECT s.nama, s.nama_key
  FROM   src s
  WHERE  NOT EXISTS (
           SELECT 1 FROM pelanggan p
           WHERE upper(btrim(p.nama)) = s.nama_key)
),
mulai AS (                                   -- 기존 C#### 최대 번호 이어서 채번
  SELECT COALESCE(max(NULLIF(regexp_replace(id, '\D', '', 'g'), '')::int), 0) AS n
  FROM   pelanggan WHERE id ~ '^C\d+$'
)
INSERT INTO pelanggan (id, nama)                               -- [가정] pelanggan(id, nama)
SELECT 'C' || lpad((m.n + row_number() OVER (ORDER BY b.nama))::text, 4, '0'),
       b.nama
FROM   baru b CROSS JOIN mulai m
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. produk (품목) — 31개, 가격까지 갱신
--    출처 : stok_20260723.xlsx [Stok] 시트 (판매 명세보다 정보량이 많음)
--    가격이 바뀐 품목만 UPDATE 됩니다.
-- ---------------------------------------------------------------------
INSERT INTO produk (id, nama, kategori, ukuran, pola, grade,
                    harga_beli, harga_agen, harga_user, stok_min, satuan)
                                                               -- [가정] 위 11개 컬럼
SELECT p.kode, p.nama, p.kategori, p.ukuran, p.pola, p.grade,
       p.harga_beli, p.harga_agen, p.harga_user,
       COALESCE(p.stok_min, 0), COALESCE(p.satuan, 'pcs')
FROM   stg_produk p
ON CONFLICT (id) DO UPDATE
   SET nama       = EXCLUDED.nama,
       kategori   = EXCLUDED.kategori,
       ukuran     = COALESCE(EXCLUDED.ukuran, produk.ukuran),
       pola       = COALESCE(EXCLUDED.pola,   produk.pola),
       grade      = COALESCE(EXCLUDED.grade,  produk.grade),
       harga_beli = EXCLUDED.harga_beli,
       harga_agen = EXCLUDED.harga_agen,
       harga_user = COALESCE(EXCLUDED.harga_user, produk.harga_user),
       stok_min   = EXCLUDED.stok_min,
       satuan     = EXCLUDED.satuan
 WHERE (produk.nama, produk.kategori, produk.harga_beli, produk.harga_agen, produk.stok_min, produk.satuan)
       IS DISTINCT FROM
       (EXCLUDED.nama, EXCLUDED.kategori, EXCLUDED.harga_beli, EXCLUDED.harga_agen, EXCLUDED.stok_min, EXCLUDED.satuan);

COMMIT;

-- =====================================================================
-- 검증 : 아래 3개 쿼리 모두 0 행이어야 정상
-- =====================================================================
SELECT 'pelanggan 미등록' AS cek, s.buyer AS nilai, count(*) AS lines
FROM   stg_spb_sales s
LEFT   JOIN pelanggan p ON upper(btrim(p.nama)) = upper(btrim(s.buyer))
WHERE  p.id IS NULL GROUP BY 1,2
UNION ALL
SELECT 'produk 미등록', s.item_no, count(*)
FROM   stg_spb_sales s
LEFT   JOIN produk pr ON pr.id = s.item_no
WHERE  pr.id IS NULL GROUP BY 1,2
UNION ALL
SELECT 'gudang 미등록', 'UTM', 1
WHERE  NOT EXISTS (SELECT 1 FROM gudang WHERE id = 'UTM');

-- 거래처 중복 등록 점검 (표기 흔들림 탐지)
SELECT upper(btrim(nama)) AS nama_key, count(*), string_agg(id, ', ')
FROM   pelanggan GROUP BY 1 HAVING count(*) > 1;
