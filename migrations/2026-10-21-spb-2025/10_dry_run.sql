-- 읽기 전용 사전 점검. 20_master.sql / 30_insert.sql 을 실행하기 전에 돌리고
-- 출력을 확인하십시오. 여기서는 아무것도 쓰지 않습니다.

-- 1) 이미 들어와 있는 2025년 전표 — 0 이어야 정상입니다.
--    (0 이 아니어도 30_insert.sql 은 같은 so_no 를 건너뛰지만, 누가 언제 넣었는지 먼저 확인하십시오)
SELECT '2025 전표 이미 존재' AS cek, count(*) AS n FROM penjualan
WHERE tgl >= '2025-01-01' AND tgl < '2026-01-01';

SELECT 'so_no 이미 존재' AS cek, count(*) AS n
FROM (SELECT DISTINCT so_no FROM stg_spb_2025) s
JOIN penjualan p ON p.no = s.so_no;

-- 2) pelanggan 에 매칭되지 않는 buyer — 20_master.sql 이 만들 20곳이 나와야 합니다.
--    20곳보다 적으면 그 사이 화면에서 누가 먼저 등록한 것이고, 그래도 문제없습니다.
--    20곳에 없는 이름이 나오면 20_master.sql 실행 전에 알려주십시오.
SELECT s.buyer, count(*) AS baris, count(DISTINCT s.so_no) AS transaksi, sum(s.total) AS nilai
FROM stg_spb_2025 s
LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
WHERE c.id IS NULL
GROUP BY 1 ORDER BY 1;

-- 3) produk 에 매칭되지 않는 품목 — VG182516AJ101 한 줄만 나와야 합니다.
SELECT s.item_no, min(s.deskripsi) AS deskripsi, min(s.tipe) AS tipe,
       count(*) AS baris, sum(s.qty) AS qty, max(s.harga) AS harga
FROM stg_spb_2025 s
LEFT JOIN produk pr ON pr.id = s.item_no
WHERE pr.id IS NULL
GROUP BY 1 ORDER BY 1;

-- 4) 창고 매핑 — SURABAYA→SBY, SEMARANG→SMG, JAKARTA→KRW. 세 id 가 gudang 에 있어야 합니다.
SELECT s.destination, m.gudang, g.id IS NOT NULL AS ada_di_gudang,
       count(DISTINCT s.so_no) AS transaksi
FROM stg_spb_2025 s
CROSS JOIN LATERAL (SELECT CASE s.destination WHEN 'SURABAYA' THEN 'SBY'
                                              WHEN 'SEMARANG' THEN 'SMG'
                                              WHEN 'JAKARTA'  THEN 'KRW' END AS gudang) m
LEFT JOIN gudang g ON g.id = m.gudang
GROUP BY 1, 2, 3 ORDER BY 1;

-- 5) id 충돌 — penjualan.id 는 'SO-'||upper(substr(md5(no),1,6)). 0 이어야 합니다.
SELECT 'id 충돌' AS cek, count(*) AS n
FROM (SELECT DISTINCT so_no, 'SO-' || upper(substr(md5(so_no),1,6)) AS id FROM stg_spb_2025) s
JOIN penjualan p ON p.id = s.id AND p.no <> s.so_no;

-- 6) 신규 거래처 채번 기준 — 20_master.sql 은 'C숫자' / 'PLG-숫자' 모양만 보고 다음 번호를 매깁니다.
SELECT max(NULLIF(substring(id   FROM '^C([0-9]+)$'), '')::int)     AS id_maks,
       max(NULLIF(substring(kode FROM '^PLG-([0-9]+)$'), '')::int)  AS kode_maks,
       count(*) AS pelanggan
FROM pelanggan;

-- 7) 철자만 다른 동일 거래처 후보 — 병합할지 따로 둘지 판단용.
--    'KARTIKA SEMESTA LOGISTIK' 과 'CV. KARTIKA SEMESTA LOGISTIK' 은 2026년에도
--    따로 들어가 있습니다. 2025년분은 엑셀 표기대로 CV 가 없는 쪽에 붙습니다.
SELECT c.kode, c.nama AS di_basis_data, s.buyer AS di_excel
FROM (SELECT DISTINCT buyer FROM stg_spb_2025) s
JOIN pelanggan c
  ON regexp_replace(upper(c.nama), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(upper(s.buyer), '[^A-Z0-9]', '', 'g') || '%'
 AND upper(trim(c.nama)) <> upper(trim(s.buyer))
ORDER BY 3, 2;

-- 8) 현재 월별 판매 — 적재 후 2025-01 ~ 2025-12 열두 줄이 앞에 붙습니다.
SELECT to_char(tgl,'YYYY-MM') AS bulan, count(*) AS transaksi
FROM penjualan GROUP BY 1 ORDER BY 1;
