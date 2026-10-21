-- D1 고객 중복 의심 4쌍 — 읽기 전용(데이터를 바꾸지 않음)
-- 결과를 보고 쌍마다 "지점 분리(이름 변경)" 또는 "진짜 중복(합치기)"을 정합니다.

-- 1) 4쌍의 기본 정보와 거래 건수
SELECT p.kode, p.nama, p.kota, p.pic, p.telp, p.sales,
       (SELECT count(*) FROM penjualan s WHERE s.pelanggan = p.id)       AS so_건수,
       (SELECT count(*) FROM penjualan s WHERE s.pelanggan_akhir = p.id) AS 최종고객_건수,
       (SELECT count(*) FROM hapus_usulan h WHERE h.jenis = 'pelanggan'
          AND h.sasaran = p.id AND h.status = 'menunggu')                AS 삭제요청_대기
FROM pelanggan p
WHERE p.kode IN ('PLG-114','PLG-393','PLG-024','PLG-029','PLG-008','PLG-030','PLG-035','PLG-044')
ORDER BY p.kode;

-- 2) 위 4쌍 말고도 이름이 같은 고객이 있는지 (PT/CV·문장부호·대소문자 무시)
WITH n AS (
  SELECT id, kode, nama, kota,
         trim(regexp_replace(regexp_replace(regexp_replace(upper(nama),
              '^(PT|CV|UD|TB|TOKO|PO)\.?\s+', ''), '[''’`]', '', 'g'), '[^A-Z0-9]+', ' ', 'g')) AS kunci
  FROM pelanggan)
SELECT kunci, string_agg(kode || ' ' || nama || ' (' || kota || ')', ' / ' ORDER BY kode) AS 고객
FROM n GROUP BY kunci HAVING count(*) > 1 ORDER BY kunci;
