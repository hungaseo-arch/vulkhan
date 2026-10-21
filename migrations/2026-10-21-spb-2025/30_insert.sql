-- 2025년 판매 398라인 / 290전표를 적재합니다. 추가만 하고 기존 행은 수정·삭제하지
-- 않습니다. 이미 존재하는 so_no 는 건너뜁니다(재실행 안전).
--
-- 규칙은 2026-09-15-spb-agustus/30_insert.sql 과 같고, 두 가지가 다릅니다.
--   · penjualan.id = 'SO-' || upper(substr(md5(no),1,6))
--   · status       = 'lunas' (과거분 임포트 관례 — 미수금·여신한도 계산에서 빠집니다)
--   · gudang       = Destination 매핑 (SURABAYA→SBY / SEMARANG→SMG / JAKARTA→KRW)
--   · tgl_kirim    = tgl  ← 8월 적재 때는 비워 두었던 칸. 원본에 별도 출고일이 없고
--                          (SO Qty = Aktual Delivery Qty, 일자 칸도 PO Date 와 같은 날)
--                          전표 수정 화면도 비어 있으면 이 값으로 채웁니다.
--   · stok_mutasi  = 쓰지 않음 ← 재고 원장은 2026-09-15 에 전량 초기화했고
--                          (2026-09-15-reset-stok-pembelian) 2026년 1~8월 출고분도
--                          그때 지웠습니다. 2025년 출고만 다시 넣으면 2,650 EA 만큼
--                          현재 재고가 음수가 됩니다.
--
-- INSERT 이므로 출고 트리거(AFTER UPDATE OF status)는 돌지 않습니다.
BEGIN;

DROP TABLE IF EXISTS so_baru;
CREATE TEMP TABLE so_baru AS
SELECT DISTINCT s.so_no
FROM stg_spb_2025 s
LEFT JOIN penjualan p ON p.no = s.so_no
WHERE p.no IS NULL;

DO $x$
DECLARE n_stg int; n_buyer int; n_produk int; n_id int;
BEGIN
  -- Neon 콘솔에서 `\copy` 가 무시되면 스테이징이 빈 채로 여기까지 옵니다.
  SELECT count(*) INTO n_stg FROM stg_spb_2025;
  IF n_stg <> 398 THEN
    RAISE EXCEPTION '스테이징이 398행이 아님 (현재 %행). 00_staging.sql 또는 00_staging_konsol.sql 을 먼저 실행하십시오.', n_stg;
  END IF;
  -- 매칭 안 되는 거래처/품목이 남아 있으면 중단합니다. inner join 으로 흘려보내면
  -- 그 전표가 조용히 빠진 채 커밋됩니다.
  SELECT count(*) INTO n_buyer FROM (
    SELECT DISTINCT s.buyer FROM stg_spb_2025 s
    LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
    WHERE c.id IS NULL) a;
  SELECT count(*) INTO n_produk FROM (
    SELECT DISTINCT s.item_no FROM stg_spb_2025 s
    LEFT JOIN produk pr ON pr.id = s.item_no
    WHERE pr.id IS NULL) b;
  IF n_buyer > 0 OR n_produk > 0 THEN
    RAISE EXCEPTION '미매칭 남아 있음 — buyer %, produk %. 20_master.sql 을 먼저 실행하십시오.',
      n_buyer, n_produk;
  END IF;
  -- 같은 이름의 거래처가 둘이면 전표가 두 번 들어갑니다.
  SELECT count(*) INTO n_buyer FROM (
    SELECT upper(trim(c.nama)) FROM pelanggan c
    WHERE upper(trim(c.nama)) IN (SELECT upper(trim(buyer)) FROM stg_spb_2025)
    GROUP BY 1 HAVING count(*) > 1) d;
  IF n_buyer > 0 THEN
    RAISE EXCEPTION '같은 이름의 거래처가 둘 이상인 경우 %건 — 10_dry_run.sql 7번으로 확인하십시오.', n_buyer;
  END IF;
  -- 해시 id 가 다른 전표와 겹치면 PRIMARY KEY 에서 터지기 전에 이유를 알려 줍니다.
  SELECT count(*) INTO n_id FROM so_baru s
  JOIN penjualan p ON p.id = 'SO-' || upper(substr(md5(s.so_no),1,6));
  IF n_id > 0 THEN
    RAISE EXCEPTION 'penjualan.id 충돌 %건 — 10_dry_run.sql 5번을 확인하십시오.', n_id;
  END IF;
END $x$;

-- 1) 전표 머리
INSERT INTO penjualan (id, no, tgl, tgl_kirim, pelanggan, gudang, status)
SELECT 'SO-' || upper(substr(md5(h.so_no), 1, 6)),
       h.so_no, h.tgl, h.tgl, c.id,
       CASE h.destination WHEN 'SURABAYA' THEN 'SBY'
                          WHEN 'SEMARANG' THEN 'SMG'
                          WHEN 'JAKARTA'  THEN 'KRW' END,
       'lunas'
FROM (
  SELECT so_no, min(tgl) AS tgl, min(buyer) AS buyer, min(destination) AS destination
  FROM stg_spb_2025
  WHERE so_no IN (SELECT so_no FROM so_baru)
  GROUP BY so_no
) h
JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(h.buyer));

-- 2) 전표 품목
INSERT INTO penjualan_item (penjualan, produk, qty, harga)
SELECT p.id, s.item_no, s.qty, s.harga
FROM stg_spb_2025 s
JOIN penjualan p ON p.no = s.so_no
WHERE s.so_no IN (SELECT so_no FROM so_baru)
ORDER BY s.so_no, s.so_seq;

-- 3) 커밋 전 확인 — 처음 실행이면 290 / 290 / 398, 재고 이동 0
SELECT 'so_baru' AS t, count(*) AS n FROM so_baru
UNION ALL SELECT 'penjualan',      count(*) FROM penjualan WHERE no IN (SELECT so_no FROM so_baru)
UNION ALL SELECT 'penjualan_item', count(*) FROM penjualan_item pi
            JOIN penjualan p ON p.id = pi.penjualan WHERE p.no IN (SELECT so_no FROM so_baru)
UNION ALL SELECT 'stok_mutasi',    count(*) FROM stok_mutasi WHERE ref IN (SELECT so_no FROM so_baru);

COMMIT;

-- 커밋 후 대사 — 2025년 열두 달이 README 의 표와 같아야 합니다
SELECT to_char(p.tgl,'YYYY-MM') AS bulan,
       count(DISTINCT p.id)     AS transaksi,
       sum(pi.qty)              AS qty,
       sum(pi.qty * pi.harga)   AS nilai
FROM penjualan p JOIN penjualan_item pi ON pi.penjualan = p.id
WHERE p.tgl >= '2025-01-01' AND p.tgl < '2026-01-01'
GROUP BY 1 ORDER BY 1;
