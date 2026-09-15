-- 2026년 8월 판매 83라인 / 58전표를 적재합니다. 추가만 하고 기존 행은
-- 수정·삭제하지 않습니다. 이미 존재하는 so_no 는 건너뜁니다(재실행 안전).
-- 규칙은 2026-08-12-may-backfill/20_insert_missing_may.sql 과 동일합니다.
--   · penjualan.id = 'SO-' || upper(substr(md5(no),1,6))
--   · status       = 'lunas' (과거분 임포트와 동일)
--   · gudang       = Destination 매핑 (SURABAYA→SBY / SEMARANG→SMG / JAKARTA→KRW)
--   · stok_mutasi  = tipe 'keluar', qty 음수, ref = so_no
BEGIN;

CREATE TEMP TABLE so_baru AS
SELECT DISTINCT s.so_no
FROM stg_spb_2608 s
LEFT JOIN penjualan p ON p.no = s.so_no
WHERE p.no IS NULL;

-- 매칭 안 되는 거래처/품목이 하나라도 남아 있으면 중단합니다.
-- (inner join 으로 조용히 흘려보내면 매출이 비는 채로 커밋되어 버립니다)
DO $x$
DECLARE n_buyer int; n_produk int;
BEGIN
  SELECT count(*) INTO n_buyer FROM (
    SELECT DISTINCT s.buyer FROM stg_spb_2608 s
    LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
    WHERE c.id IS NULL) a;
  SELECT count(*) INTO n_produk FROM (
    SELECT DISTINCT s.item_no FROM stg_spb_2608 s
    LEFT JOIN produk pr ON pr.id = s.item_no
    WHERE pr.id IS NULL) b;
  IF n_buyer > 0 OR n_produk > 0 THEN
    RAISE EXCEPTION '미매칭 남아 있음 — buyer %, produk %. 20_master.sql 을 먼저 실행하십시오.',
      n_buyer, n_produk;
  END IF;
END $x$;

-- 1) 전표 머리
INSERT INTO penjualan (id, no, tgl, pelanggan, gudang, status)
SELECT 'SO-' || upper(substr(md5(h.so_no), 1, 6)),
       h.so_no, h.tgl, c.id,
       CASE h.destination WHEN 'SURABAYA' THEN 'SBY'
                          WHEN 'SEMARANG' THEN 'SMG'
                          WHEN 'JAKARTA'  THEN 'KRW' END,
       'lunas'
FROM (
  SELECT so_no, min(tgl) AS tgl, min(buyer) AS buyer, min(destination) AS destination
  FROM stg_spb_2608
  WHERE so_no IN (SELECT so_no FROM so_baru)
  GROUP BY so_no
) h
JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(h.buyer));

-- 2) 전표 품목
INSERT INTO penjualan_item (penjualan, produk, qty, harga)
SELECT p.id, s.item_no, s.qty, s.harga
FROM stg_spb_2608 s
JOIN penjualan p ON p.no = s.so_no
WHERE s.so_no IN (SELECT so_no FROM so_baru);

-- 3) 출고 이동
INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
SELECT s.tgl,
       CASE s.destination WHEN 'SURABAYA' THEN 'SBY'
                          WHEN 'SEMARANG' THEN 'SMG'
                          WHEN 'JAKARTA'  THEN 'KRW' END,
       s.item_no, 'keluar', -s.qty, s.so_no, 'Pengiriman penjualan (import historis)'
FROM stg_spb_2608 s
JOIN penjualan p ON p.no = s.so_no
WHERE s.so_no IN (SELECT so_no FROM so_baru);

-- 4) 커밋 전 확인 — 기대값 58 / 83 / 83
SELECT 'so_baru' AS t, count(*) AS n FROM so_baru
UNION ALL SELECT 'penjualan',      count(*) FROM penjualan      WHERE no  IN (SELECT so_no FROM so_baru)
UNION ALL SELECT 'penjualan_item', count(*) FROM penjualan_item pi
            JOIN penjualan p ON p.id = pi.penjualan WHERE p.no IN (SELECT so_no FROM so_baru)
UNION ALL SELECT 'stok_mutasi',    count(*) FROM stok_mutasi    WHERE ref IN (SELECT so_no FROM so_baru);

COMMIT;

-- 커밋 후 대사 — 8월이 58전표 / 405 EA / IDR 523,816,000 이어야 원본과 일치합니다
SELECT to_char(p.tgl,'YYYY-MM') AS bulan,
       count(DISTINCT p.id)     AS transaksi,
       sum(pi.qty)              AS qty,
       sum(pi.qty * pi.harga)   AS nilai
FROM penjualan p JOIN penjualan_item pi ON pi.penjualan = p.id
GROUP BY 1 ORDER BY 1;
