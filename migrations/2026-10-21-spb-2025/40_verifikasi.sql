-- 적재 결과 확인. 읽기 전용이라 몇 번이든 돌려도 됩니다.
-- 스테이징(stg_spb_2025)을 지우지 않았다면 5번까지 전부 나옵니다.

-- 1) 월별 대사 — README 의 표와 열두 줄 모두 같아야 합니다
SELECT to_char(p.tgl,'YYYY-MM') AS bulan,
       count(DISTINCT p.id)     AS transaksi,
       sum(pi.qty)              AS qty,
       sum(pi.qty * pi.harga)   AS nilai
FROM penjualan p JOIN penjualan_item pi ON pi.penjualan = p.id
WHERE p.tgl >= '2025-01-01' AND p.tgl < '2026-01-01'
GROUP BY 1 ORDER BY 1;

-- 2) 연간 합계 — 290 / 398 / 2650 / 2785930000
SELECT count(DISTINCT p.id) AS transaksi, count(*) AS baris,
       sum(pi.qty) AS qty, sum(pi.qty * pi.harga) AS nilai
FROM penjualan p JOIN penjualan_item pi ON pi.penjualan = p.id
WHERE p.tgl >= '2025-01-01' AND p.tgl < '2026-01-01';

-- 3) 상태·출고일·창고 — lunas 290, tgl_kirim = tgl 290, 창고 NULL 0, 재고 이동 0
SELECT count(*) FILTER (WHERE status = 'lunas')          AS lunas,
       count(*) FILTER (WHERE tgl_kirim = tgl)           AS tgl_kirim_sama,
       count(*) FILTER (WHERE gudang IS NULL)            AS tanpa_gudang,
       (SELECT count(*) FROM stok_mutasi m
         WHERE m.ref LIKE 'SO-25__-___')                 AS mutasi_2025
FROM penjualan
WHERE tgl >= '2025-01-01' AND tgl < '2026-01-01';

-- 4) 마스터 — 신규 거래처 20, 신규 품목 1
SELECT 'pelanggan baru' AS cek, count(*) AS n FROM pelanggan
WHERE upper(trim(nama)) IN (
  'AGUNG TRANSPORT','BAPAK RAYMOND','BAPAK ROBI','CV. ASTRA RAHARJA','CV. HUTAMA MILENIAL',
  'DWI EKA SUTRESNA','FADILAH WIDIARSANTI','GIARSO','INDRA IRAWAN (PAK NDUT)','LAS TRANSPORT',
  'PAK BAYU','POLING LINDAJATI, ST','PT. HANA AHN TECHNOLOGY','PT. KURNIA MAKMUR ABADI JAYA',
  'PT. MARABUNTA','SALIM GUNADI PUTRA','VIVI TYRE','WIDYASTUTI MALIK','YAYAN MARYANTO','YULIANA SUSANTO')
UNION ALL
SELECT 'produk baru', count(*) FROM produk WHERE id = 'VG182516AJ101';

-- 5) 스테이징 대 본테이블 라인 대사 — 0행이어야 완전 일치
--    (한 전표 안에 같은 품목이 두 줄인 경우는 원본에 없습니다)
SELECT s.so_no, s.item_no, s.qty AS qty_csv, pi.qty AS qty_db,
       s.harga AS harga_csv, pi.harga AS harga_db
FROM stg_spb_2025 s
LEFT JOIN penjualan p       ON p.no = s.so_no
LEFT JOIN penjualan_item pi ON pi.penjualan = p.id AND pi.produk = s.item_no
WHERE pi.produk IS NULL OR pi.qty <> s.qty OR pi.harga <> s.harga
ORDER BY 1, 2;

-- 6) 정리 — 위 결과가 모두 맞으면 스테이징을 지워도 됩니다
-- DROP TABLE stg_spb_2025;
