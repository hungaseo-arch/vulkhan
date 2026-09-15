-- 적재 결과 확인. 읽기 전용이라 몇 번이든 돌려도 됩니다.
-- 스테이징(stg_spb_2608)을 지우지 않았다면 5번까지 전부 나옵니다.

-- 1) 월별 대사 — 2026-08 이 58 / 405 / 523816000 이어야 원본과 일치
SELECT to_char(p.tgl,'YYYY-MM') AS bulan,
       count(DISTINCT p.id)     AS transaksi,
       sum(pi.qty)              AS qty,
       sum(pi.qty * pi.harga)   AS nilai
FROM penjualan p JOIN penjualan_item pi ON pi.penjualan = p.id
GROUP BY 1 ORDER BY 1;

-- 2) 전체 건수 — penjualan 348 / penjualan_item 477 이어야 함
SELECT (SELECT count(*) FROM penjualan)      AS penjualan,
       (SELECT count(*) FROM penjualan_item) AS item;

-- 3) 8월 출고 이동이 83건 다 생겼는지 (창고별로 쪼개 봄)
SELECT gudang, count(*) AS baris, sum(-qty) AS keluar
FROM stok_mutasi
WHERE catatan = 'Pengiriman penjualan (import historis)'
  AND tgl >= '2026-08-01' AND tgl < '2026-09-01'
GROUP BY 1 ORDER BY 1;

-- 4) 마스터 보정 결과 — TRI DOMINITAMA 는 1행, 신규 4곳 + 신규 품목 1종
SELECT 'TRI DOMINITAMA' AS cek, count(*) AS n FROM pelanggan
  WHERE upper(replace(trim(nama),' ','')) = 'PT.TRIDOMINITAMA'
UNION ALL
SELECT 'pelanggan baru', count(*) FROM pelanggan WHERE nama IN
  ('GLX KARGO LOGISTIK','PT. BERKAT ACI MULIA',
   'PT. HARMONI AWOT NUSANTARA','PT. PERKASA JAYA TRANSPORT')
UNION ALL
SELECT 'produk baru', count(*) FROM produk WHERE id = 'G175015AJ101';

-- 5) 스테이징 대 본테이블 라인 단위 대사 — 0행이어야 완전 일치
--    (한 줄이라도 나오면 그 전표가 누락됐거나 값이 다릅니다)
SELECT s.so_no, s.item_no, s.qty AS qty_csv, pi.qty AS qty_db,
       s.harga AS harga_csv, pi.harga AS harga_db
FROM stg_spb_2608 s
LEFT JOIN penjualan p       ON p.no = s.so_no
LEFT JOIN penjualan_item pi ON pi.penjualan = p.id AND pi.produk = s.item_no
WHERE pi.produk IS NULL OR pi.qty <> s.qty OR pi.harga <> s.harga
ORDER BY 1, 2;
