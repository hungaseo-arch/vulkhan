-- =====================================================================
-- 12_upsert_penjualan.sql
-- 판매전표 추가 + 업데이트 (penjualan 290건 / penjualan_item 394건)
--
-- 동작 : staging 을 정본으로 보고 DB 를 맞춥니다 (재실행 안전).
--   · staging 에만 있는 전표/라인  → INSERT
--   · 양쪽에 있고 값이 다른 것       → UPDATE
--   · DB 에만 있는 라인(원본에서 삭제) → DELETE
--   · 값이 같은 것                   → 아무 것도 안 함
--
-- 이번 회차 예상 변경량 (2026-08-11 원본 기준)
--   신규 전표 17건 / 신규 라인 24건 — 전부 2026-05 분 (5월 명세 누락분 보완)
--   변경·삭제 0건
--
-- ⚠ 컬럼명 추정 구간은 [가정] 주석 표시. 00_cek_skema.sql 결과로 확정하세요.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. 변경 대상 미리보기 (COMMIT 전 확인용 — 실행만 하고 결과 확인)
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _hdr AS
SELECT s.so_no,
       min(s.tgl)              AS tgl,
       min(s.buyer)            AS buyer,
       min(s.pic)              AS pic,
       min(s.destination)      AS destination,
       min(s.target_delivery)  AS target_delivery,
       sum(s.total)            AS total,
       min(s.mata_uang)        AS mata_uang
FROM   stg_spb_sales s
GROUP  BY s.so_no;

SELECT 'INSERT 예정 전표' AS aksi, count(*) AS n
FROM   _hdr h WHERE NOT EXISTS (SELECT 1 FROM penjualan p WHERE p.no = h.so_no)
UNION ALL
SELECT 'UPDATE 예정 전표', count(*)
FROM   _hdr h JOIN penjualan p ON p.no = h.so_no
JOIN   pelanggan pl ON upper(btrim(pl.nama)) = upper(btrim(h.buyer))
WHERE  (p.tgl, p.pelanggan, p.total) IS DISTINCT FROM (h.tgl, pl.id, h.total)
UNION ALL
SELECT 'DB 에만 있는 전표(검토)', count(*)
FROM   penjualan p
WHERE  p.no LIKE 'SO-26%' AND NOT EXISTS (SELECT 1 FROM _hdr h WHERE h.so_no = p.no);

-- ---------------------------------------------------------------------
-- 1. penjualan (전표 헤더) UPSERT
--    id  : 기존 관례(SO-XXXXXX) 유지용 결정적 생성값.
--          DB 에 기본값(gen_random_uuid 등)이 있으면 id 컬럼을 목록에서 빼세요.
--    no  : SO-YYMM-###  ← 업무 유일키. ON CONFLICT 기준.
-- ---------------------------------------------------------------------
INSERT INTO penjualan (id, no, tgl, pelanggan, gudang, sales, total, mata_uang, keterangan)
                                                          -- [가정] gudang/sales/total/mata_uang/keterangan
SELECT 'SO-' || upper(substr(md5(h.so_no), 1, 6)),
       h.so_no,
       h.tgl,
       pl.id,
       'UTM',
       h.pic,
       h.total,
       h.mata_uang,
       'SPB ' || h.destination || ' / target: ' || h.target_delivery
FROM   _hdr h
JOIN   pelanggan pl ON upper(btrim(pl.nama)) = upper(btrim(h.buyer))
ON CONFLICT (no) DO UPDATE                                -- [가정] penjualan.no 에 UNIQUE 제약 필요
   SET tgl        = EXCLUDED.tgl,
       pelanggan  = EXCLUDED.pelanggan,
       sales      = EXCLUDED.sales,
       total      = EXCLUDED.total,
       mata_uang  = EXCLUDED.mata_uang,
       keterangan = EXCLUDED.keterangan
 WHERE (penjualan.tgl, penjualan.pelanggan, penjualan.sales, penjualan.total, penjualan.keterangan)
       IS DISTINCT FROM
       (EXCLUDED.tgl, EXCLUDED.pelanggan, EXCLUDED.sales, EXCLUDED.total, EXCLUDED.keterangan);

-- penjualan.no 에 UNIQUE 제약이 없으면 위 ON CONFLICT 가 실패합니다. 최초 1회만 실행:
--   ALTER TABLE penjualan ADD CONSTRAINT penjualan_no_key UNIQUE (no);

-- ---------------------------------------------------------------------
-- 2. penjualan_item (전표 라인) UPSERT
--    라인 id = 전표 id || '-' || 2자리 순번  (예: SO-1A2B3C-01)
-- ---------------------------------------------------------------------
INSERT INTO penjualan_item (id, penjualan, produk, qty, harga, subtotal)
                                                          -- [가정] 위 6개 컬럼
SELECT pj.id || '-' || lpad(s.so_seq::text, 2, '0'),
       pj.id, s.item_no, s.qty, s.harga, s.total
FROM   stg_spb_sales s
JOIN   penjualan pj ON pj.no = s.so_no
ON CONFLICT (id) DO UPDATE
   SET produk   = EXCLUDED.produk,
       qty      = EXCLUDED.qty,
       harga    = EXCLUDED.harga,
       subtotal = EXCLUDED.subtotal
 WHERE (penjualan_item.produk, penjualan_item.qty, penjualan_item.harga, penjualan_item.subtotal)
       IS DISTINCT FROM
       (EXCLUDED.produk, EXCLUDED.qty, EXCLUDED.harga, EXCLUDED.subtotal);

-- ---------------------------------------------------------------------
-- 3. 원본에서 사라진 라인 삭제 (전표 라인 수가 줄어든 경우)
--    이번 회차는 0건. 안전을 위해 SELECT 로 먼저 확인 후 DELETE 하세요.
-- ---------------------------------------------------------------------
-- 확인
SELECT pi.id, pj.no, pi.produk, pi.qty
FROM   penjualan_item pi
JOIN   penjualan pj ON pj.id = pi.penjualan
JOIN   _hdr h       ON h.so_no = pj.no
WHERE  NOT EXISTS (
         SELECT 1 FROM stg_spb_sales s
         WHERE  s.so_no = pj.no
           AND  pi.id = pj.id || '-' || lpad(s.so_seq::text, 2, '0'));

-- 삭제 (위 결과 확인 후 주석 해제)
-- DELETE FROM penjualan_item pi
--  USING penjualan pj, _hdr h
--  WHERE pj.id = pi.penjualan AND h.so_no = pj.no
--    AND NOT EXISTS (
--          SELECT 1 FROM stg_spb_sales s
--          WHERE  s.so_no = pj.no
--            AND  pi.id = pj.id || '-' || lpad(s.so_seq::text, 2, '0'));

COMMIT;

-- =====================================================================
-- 4. 적재 후 검증
-- =====================================================================

-- 4-1) 건수 : 전표 290 / 라인 394
SELECT (SELECT count(*) FROM penjualan WHERE no LIKE 'SO-26%')            AS doc_cnt,
       (SELECT count(*) FROM penjualan_item pi
          JOIN penjualan pj ON pj.id = pi.penjualan
        WHERE pj.no LIKE 'SO-26%')                                        AS line_cnt;

-- 4-2) 헤더 total vs 라인 합계 불일치 : 0 건
SELECT pj.no, pj.total, sum(pi.subtotal) AS line_sum
FROM   penjualan pj JOIN penjualan_item pi ON pi.penjualan = pj.id
WHERE  pj.no LIKE 'SO-26%'
GROUP  BY pj.no, pj.total HAVING pj.total <> sum(pi.subtotal);

-- 4-3) staging ↔ DB 라인 단위 전수 대사 : 0 건이어야 정상
SELECT s.so_no, s.so_seq, s.item_no, s.qty, s.harga,
       pi.produk AS db_produk, pi.qty AS db_qty, pi.harga AS db_harga
FROM   stg_spb_sales s
LEFT   JOIN penjualan pj ON pj.no = s.so_no
LEFT   JOIN penjualan_item pi
       ON pi.id = pj.id || '-' || lpad(s.so_seq::text, 2, '0')
WHERE  pi.id IS NULL
    OR (pi.produk, pi.qty, pi.harga, pi.subtotal)
       IS DISTINCT FROM (s.item_no, s.qty, s.harga, s.total);

-- 4-4) 월별 대사 (엑셀 All Sum 2026 과 일치해야 함)
SELECT to_char(pj.tgl,'YYYY-MM') AS bulan, count(DISTINCT pj.id) AS docs,
       sum(pi.qty) AS qty, sum(pi.subtotal) AS amt
FROM   penjualan pj JOIN penjualan_item pi ON pi.penjualan = pj.id
WHERE  pj.no LIKE 'SO-26%'
GROUP  BY 1 ORDER BY 1;
