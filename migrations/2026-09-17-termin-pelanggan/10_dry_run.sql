-- 읽기 전용. 20_termin.sql 을 돌리기 전에 먼저 실행해서 1·2번이 비어 있는지
-- 확인하십시오. 비어 있지 않으면 그 거래처는 갱신되지 않거나(1번), 어느 행을
-- 고쳐야 할지 알 수 없습니다(2번).
--
-- 이름 대조는 대소문자·공백·'PT.' 의 마침표를 무시합니다. 원본 파일의
-- 'PT. TRI DOMINIC' 과 마스터의 'PT TRI DOMINIC' 을 같은 회사로 보기 위한
-- 것이고, 'TRI DOMINIC' 과 'TRI DOMINITAMA' 는 그래도 서로 다르게 남습니다.
WITH baru(nama, hari) AS (VALUES
  ('PT. GAYADIA TANGGUH INSANI',    14),
  ('PT. ILC LOGISTICS INDONESIA',   14),
  ('PT. KUALA DELI TRANS',          14),
  ('PT. COTRANS JAYA ABADI',        14),
  ('PT. BONA PASOGIT SEMESTA',      14),
  ('ZELDA JAYA BAN',                14),
  ('GARASI HAJI ULIL',              14),
  ('ARTO MORO ANUGERAH LAUTAN',     45),
  ('PT. HARMONI AWOT NUSANTARA',    45),
  ('PT. CIPTA SARANA TRANSPORT',    45),
  ('ADI PAMADI',                    60),
  ('PT. BUNGA DARU',                60),
  ('PT. EKA PS',                    60),
  ('PT. SAMUDERA PERDANA SELARAS',  60),
  ('PT. TRI DOMINIC',               60),
  ('PT. TRI DOMINITAMA',            60),
  ('PT. TRIKUSUMA JAYA PERKASA',    60),
  ('PT. SIBA SURYA',                90)
), kunci AS (
  SELECT nama, hari, upper(regexp_replace(nama, '[^a-zA-Z0-9]', '', 'g')) AS k FROM baru
), mst AS (
  SELECT id, kode, nama, termin, upper(regexp_replace(nama, '[^a-zA-Z0-9]', '', 'g')) AS k FROM pelanggan
)
-- 1) 파일에는 있는데 마스터에서 못 찾은 거래처 — 있으면 이름 표기를 맞춰야 합니다
SELECT '1. 마스터 미매칭' AS cek, k.nama AS nama_file, NULL::text AS kode, NULL::int AS termin_lama, k.hari AS termin_baru
FROM kunci k LEFT JOIN mst m ON m.k = k.k
WHERE m.id IS NULL

UNION ALL
-- 2) 한 이름에 마스터 행이 둘 이상 — 중복 거래처. 먼저 정리해야 합니다
SELECT '2. 중복 마스터', k.nama, string_agg(m.kode || ' ' || m.nama, ' / '), NULL, k.hari
FROM kunci k JOIN mst m ON m.k = k.k
GROUP BY k.nama, k.hari HAVING count(*) > 1

UNION ALL
-- 3) 실제로 바뀌는 행 (여기만 UPDATE 됩니다)
SELECT '3. 변경', m.nama, m.kode, m.termin, k.hari
FROM kunci k JOIN mst m ON m.k = k.k
WHERE m.termin IS DISTINCT FROM k.hari

UNION ALL
-- 4) 이미 같은 값이라 손대지 않는 행
SELECT '4. 그대로', m.nama, m.kode, m.termin, k.hari
FROM kunci k JOIN mst m ON m.k = k.k
WHERE m.termin IS NOT DISTINCT FROM k.hari
ORDER BY 1, 2;

-- 5) 파일에 없는 나머지 거래처 — 이번 작업이 건드리지 않는 쪽입니다.
--    기존 값을 그대로 둡니다(기본값 30). 이쪽도 정리하려면 파일에 추가하십시오.
SELECT '5. 파일에 없음' AS cek, kode, nama, termin
FROM pelanggan
WHERE upper(regexp_replace(nama, '[^a-zA-Z0-9]', '', 'g')) NOT IN (
  SELECT upper(regexp_replace(x, '[^a-zA-Z0-9]', '', 'g')) FROM (VALUES
    ('PT. GAYADIA TANGGUH INSANI'),('PT. ILC LOGISTICS INDONESIA'),('PT. KUALA DELI TRANS'),
    ('PT. COTRANS JAYA ABADI'),('PT. BONA PASOGIT SEMESTA'),('ZELDA JAYA BAN'),
    ('GARASI HAJI ULIL'),('ARTO MORO ANUGERAH LAUTAN'),('PT. HARMONI AWOT NUSANTARA'),
    ('PT. CIPTA SARANA TRANSPORT'),('ADI PAMADI'),('PT. BUNGA DARU'),('PT. EKA PS'),
    ('PT. SAMUDERA PERDANA SELARAS'),('PT. TRI DOMINIC'),('PT. TRI DOMINITAMA'),
    ('PT. TRIKUSUMA JAYA PERKASA'),('PT. SIBA SURYA')) v(x))
ORDER BY termin, nama;
