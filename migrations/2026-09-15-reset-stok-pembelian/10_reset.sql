-- 창고 재고 원장과 구매 데이터를 전부 비웁니다. 되돌릴 수 없습니다.
-- 00_cek.sql 을 먼저 실행해서 지워질 내용을 확인한 뒤에 돌리십시오.
--
-- 판매(penjualan / penjualan_item)는 건드리지 않습니다. 매출 숫자는 그대로입니다.

BEGIN;

-- 구매 — 현재 0건이지만 나중에 생겨도 이 파일이 그대로 쓰이도록 함께 둡니다.
DELETE FROM pembelian_item;
DELETE FROM pembelian;

-- 재고 이동 원장 전체. 판매 출고분(ref = penjualan.no)도 여기 포함됩니다.
-- 남겨 두면 재고가 크게 음수로 시작하므로 부분 삭제는 오히려 더 나쁩니다.
DELETE FROM stok_mutasi;

-- 지운 뒤 확인: 셋 다 0, 판매는 그대로여야 합니다.
SELECT (SELECT count(*) FROM stok_mutasi)   AS stok_mutasi,
       (SELECT count(*) FROM pembelian)     AS pembelian,
       (SELECT count(*) FROM pembelian_item) AS pembelian_item,
       (SELECT count(*) FROM penjualan)     AS penjualan,
       (SELECT count(*) FROM penjualan_item) AS penjualan_item;

COMMIT;
