-- =====================================================================
-- 13_stok_mutasi.sql
-- 재고 이동(stok_mutasi) 생성 — 판매 출고분
--
-- 【중요 · 먼저 읽어 주십시오】
-- stok_20260723.xlsx 의 재고 수량은 실물 재고조사 결과가 아닙니다.
-- 31품목 전부에 대해  재고 = −(판매 누적수량)  으로 정확히 일치했습니다.
--   · 스냅샷 합계          −2,087 EA
--   · 구버전 판매 누적합계  2,087 EA   (370 라인 기준, 5월 보완 전)
--   · 품목별 불일치         0 / 31
-- 즉 이 파일은 "입고 0 + 판매만 차감" 상태의 계산값이며,
-- 게다가 5월 누락분(141 EA) 보완 이전 버전입니다.
--
-- → 따라서 이 값을 opname(실사) 조정으로 넣으면 낡은 수치를 고정시키게 됩니다.
--   재고는 아래처럼 판매(OUT)·구매(IN) 이동으로 산출하고,
--   실물 재고는 pembelian(구매·입고) 원장을 받은 뒤 맞추는 것이 맞습니다.
--
-- ⚠ 컬럼명 추정 구간은 [가정] 주석. 00_cek_skema.sql 결과로 확정하세요.
--    [가정] stok_mutasi(id, tgl, gudang, produk, jenis, qty, ref, keterangan)
--           jenis : 'IN' | 'OUT' | 'ADJ'   /  qty : 부호 있는 증감 수량
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 판매 출고 이동 생성 (394 라인 → OUT, qty 는 음수)
--    ref = 전표번호 이므로 재실행 시 해당 전표분만 정확히 교체됩니다.
-- ---------------------------------------------------------------------
DELETE FROM stok_mutasi
 WHERE jenis = 'OUT'
   AND ref IN (SELECT DISTINCT so_no FROM stg_spb_sales);

INSERT INTO stok_mutasi (id, tgl, gudang, produk, jenis, qty, ref, keterangan)
SELECT s.so_no || '-M' || lpad(s.so_seq::text, 2, '0'),
       s.tgl,
       'UTM',
       s.item_no,
       'OUT',
       -s.qty,
       s.so_no,
       'Penjualan ' || s.buyer || ' / ' || s.destination
FROM   stg_spb_sales s;

COMMIT;

-- =====================================================================
-- 2. 검증
-- =====================================================================

-- 2-1) 출고 이동 394행 / 합계 −2,228 EA
SELECT count(*) AS baris, sum(qty) AS qty_total
FROM   stok_mutasi
WHERE  jenis = 'OUT' AND ref LIKE 'SO-26%';

-- 2-2) 판매 라인 ↔ 재고이동 전수 대사 : 0 행이어야 정상
SELECT s.so_no, s.so_seq, s.item_no, s.qty, m.qty AS mutasi_qty
FROM   stg_spb_sales s
LEFT   JOIN stok_mutasi m
       ON m.id = s.so_no || '-M' || lpad(s.so_seq::text, 2, '0')
WHERE  m.id IS NULL OR m.qty <> -s.qty OR m.produk <> s.item_no;

-- 2-3) 품목별 현재고 (입고 미등록 상태이므로 전부 음수 — 정상)
--      구매 원장 적재 후 다시 실행하면 실재고가 나옵니다.
SELECT p.id, p.nama, p.kategori,
       COALESCE(sum(m.qty), 0)::int AS stok_kini,
       p.stok_min
FROM   produk p
LEFT   JOIN stok_mutasi m ON m.produk = p.id
GROUP  BY p.id, p.nama, p.kategori, p.stok_min
ORDER  BY stok_kini;

-- =====================================================================
-- 3. (대안) 실물 재고조사 결과가 별도로 있을 때만 사용하는 조정 전표
--    stg_stok_snapshot 에 실사값을 넣고 아래 블록을 실행하세요.
--    ※ 현재 stok_20260723.xlsx 값은 실사값이 아니므로 실행하지 마십시오.
-- =====================================================================
/*
BEGIN;

CREATE TEMP TABLE _adj AS
WITH cur AS (
  SELECT produk, gudang, sum(qty)::int AS qty
  FROM   stok_mutasi GROUP BY produk, gudang
)
SELECT s.kode AS produk, s.gudang, s.tgl,
       s.qty                      AS qty_fisik,
       COALESCE(c.qty, 0)         AS qty_sistem,
       s.qty - COALESCE(c.qty, 0) AS qty_adj
FROM   stg_stok_snapshot s
LEFT   JOIN cur c ON c.produk = s.kode AND c.gudang = s.gudang
WHERE  s.qty - COALESCE(c.qty, 0) <> 0;

SELECT * FROM _adj ORDER BY abs(qty_adj) DESC;   -- 반드시 눈으로 확인

DELETE FROM stok_mutasi WHERE ref = 'OPNAME-20260723';

INSERT INTO stok_mutasi (id, tgl, gudang, produk, jenis, qty, ref, keterangan)
SELECT 'ADJ-20260723-' || lpad((row_number() OVER (ORDER BY produk))::text, 3, '0'),
       tgl, gudang, produk, 'ADJ', qty_adj, 'OPNAME-20260723',
       'Opname fisik 2026-07-23 (fisik ' || qty_fisik || ' / sistem ' || qty_sistem || ')'
FROM   _adj;

COMMIT;
*/

-- =====================================================================
-- 4. 다음 단계 — 구매·입고 원장 필요
--    pembelian / pembelian_item 에 입고 이력을 넣고 아래 형태로 IN 이동을 만들면
--    재고가 정상화됩니다. (구매 원장 파일 주시면 동일 형식으로 작성해 드립니다.)
-- =====================================================================
/*
INSERT INTO stok_mutasi (id, tgl, gudang, produk, jenis, qty, ref, keterangan)
SELECT pb.no || '-M' || lpad(row_number() OVER (PARTITION BY pb.id ORDER BY pi.id)::text, 2, '0'),
       pb.tgl, pb.gudang, pi.produk, 'IN', pi.qty, pb.no, 'Pembelian'
FROM   pembelian pb JOIN pembelian_item pi ON pi.pembelian = pb.id;
*/
