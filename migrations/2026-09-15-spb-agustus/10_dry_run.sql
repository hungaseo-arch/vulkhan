-- 읽기 전용 사전 점검. 20_master.sql / 30_insert.sql 을 실행하기 전에 돌리고
-- 출력을 반드시 확인하십시오. 여기서는 아무것도 쓰지 않습니다.

-- 1) 이미 들어와 있는 전표가 있는지 (있으면 30_insert.sql 이 건너뜁니다)
SELECT 'SO 이미 존재' AS cek, count(*) AS n
FROM (SELECT DISTINCT so_no FROM stg_spb_2608) s
JOIN penjualan p ON p.no = s.so_no;

-- 2) pelanggan 에 매칭되지 않는 buyer — 이대로 두면 해당 전표가 통째로 누락됩니다
SELECT s.buyer, count(*) AS baris, count(DISTINCT s.so_no) AS transaksi, sum(s.total) AS nilai
FROM stg_spb_2608 s
LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
WHERE c.id IS NULL
GROUP BY 1 ORDER BY 1;

-- 3) produk 에 매칭되지 않는 품목 — 이대로 두면 해당 라인이 누락됩니다
SELECT s.item_no, min(s.deskripsi) AS deskripsi, min(s.tipe) AS tipe,
       count(*) AS baris, sum(s.qty) AS qty, max(s.harga) AS harga
FROM stg_spb_2608 s
LEFT JOIN produk pr ON pr.id = s.item_no
WHERE pr.id IS NULL
GROUP BY 1 ORDER BY 1;

-- 4) 창고 매핑 확인 (SURABAYA->SBY, SEMARANG->SMG, JAKARTA->KRW)
--    2026-08-12-destinasi-gudang-fix 와 같은 규칙. NULL 이 나오면 매핑 누락.
SELECT s.destination,
       CASE s.destination WHEN 'SURABAYA' THEN 'SBY'
                          WHEN 'SEMARANG' THEN 'SMG'
                          WHEN 'JAKARTA'  THEN 'KRW' END AS gudang,
       count(DISTINCT s.so_no) AS transaksi
FROM stg_spb_2608 s GROUP BY 1,2 ORDER BY 1;

-- 5) 채번 충돌 확인 — penjualan.id 는 'SO-'||upper(substr(md5(no),1,6)) 로 만들어집니다
SELECT 'id 충돌' AS cek, count(*) AS n
FROM (SELECT DISTINCT 'SO-' || upper(substr(md5(so_no),1,6)) AS id FROM stg_spb_2608) s
JOIN penjualan p ON p.id = s.id;

-- 6) 적재 후 예상 월별 건수 (참고: 8월 이전은 기존 290전표)
SELECT to_char(tgl,'YYYY-MM') AS bulan, count(*) AS transaksi
FROM penjualan GROUP BY 1 ORDER BY 1;

-- 7) 신규 마스터를 만들 때 쓸 채번 형식 확인 (id / kode 실제 모양)
SELECT id, kode, nama FROM pelanggan ORDER BY kode DESC LIMIT 3;
SELECT id, kode, nama, kategori, harga FROM produk ORDER BY kode LIMIT 3;

-- 8) 철자만 다른 동일 거래처 후보 — 병합할지 따로 만들지 판단용
SELECT c.kode, c.nama AS di_basis_data, s.buyer AS di_excel
FROM (SELECT DISTINCT buyer FROM stg_spb_2608) s
JOIN pelanggan c
  ON replace(upper(trim(c.nama)),' ','') = replace(upper(trim(s.buyer)),' ','')
 AND upper(trim(c.nama)) <> upper(trim(s.buyer));
