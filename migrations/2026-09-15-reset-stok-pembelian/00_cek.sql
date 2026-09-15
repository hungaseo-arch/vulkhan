-- 읽기 전용. 무엇이 지워지는지 먼저 확인합니다. 아무것도 쓰지 않습니다.

-- 1) 재고 이동 원장 — 유형별로 몇 건이 지워지는지
SELECT tipe, count(*) AS baris, min(tgl) AS dari, max(tgl) AS sampai
FROM stok_mutasi GROUP BY tipe ORDER BY tipe;

-- 2) 그 중 판매 전표에서 나온 출고분 (ref 가 penjualan.no 와 연결된 것)
--    이 줄들이 가장 중요합니다 — 1~8월 판매 477라인의 출고 기록입니다.
SELECT count(*) AS mutasi_dari_penjualan
FROM stok_mutasi m JOIN penjualan p ON p.no = m.ref;

-- 3) 구매 — 기대값 0건
SELECT (SELECT count(*) FROM pembelian)      AS pembelian,
       (SELECT count(*) FROM pembelian_item) AS pembelian_item;

-- 4) 지우기 전 현재 창고 재고 (나중에 비교용으로 남겨 두십시오)
SELECT gudang, count(*) AS jenis, sum(stok) AS total FROM v_stok GROUP BY gudang ORDER BY gudang;

-- 5) 판매 전표는 손대지 않습니다 — 이 수치는 전후가 같아야 합니다
SELECT (SELECT count(*) FROM penjualan)      AS penjualan,
       (SELECT count(*) FROM penjualan_item) AS penjualan_item;
