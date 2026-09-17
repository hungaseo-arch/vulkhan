-- 'Termin Customer.xlsx' 에 맞춰 거래처 결제조건(termin, 일)을 맞춥니다.
-- 10_dry_run.sql 의 1·2번이 비어 있는 것을 확인한 뒤 실행하십시오.
--
-- limit_kredit(여신한도)는 건드리지 않습니다. 화면의 여신한도 기안·승인
-- 절차를 거치지 않는 직접 수정이라, 기안 이력에는 남지 않습니다 — 일괄
-- 정정이라 그 편이 맞지만, 앞으로 개별 변경은 화면에서 하십시오.
BEGIN;

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
)
UPDATE pelanggan p
SET termin = b.hari
FROM baru b
WHERE upper(regexp_replace(p.nama, '[^a-zA-Z0-9]', '', 'g'))
    = upper(regexp_replace(b.nama, '[^a-zA-Z0-9]', '', 'g'))
  AND p.termin IS DISTINCT FROM b.hari;

-- 확인: 18곳 모두 파일과 같은 값이어야 합니다. n = 18 이면 COMMIT 하십시오.
SELECT count(*) AS n_cocok FROM pelanggan p
JOIN (VALUES
  ('PT. GAYADIA TANGGUH INSANI',14),('PT. ILC LOGISTICS INDONESIA',14),
  ('PT. KUALA DELI TRANS',14),('PT. COTRANS JAYA ABADI',14),
  ('PT. BONA PASOGIT SEMESTA',14),('ZELDA JAYA BAN',14),('GARASI HAJI ULIL',14),
  ('ARTO MORO ANUGERAH LAUTAN',45),('PT. HARMONI AWOT NUSANTARA',45),
  ('PT. CIPTA SARANA TRANSPORT',45),('ADI PAMADI',60),('PT. BUNGA DARU',60),
  ('PT. EKA PS',60),('PT. SAMUDERA PERDANA SELARAS',60),('PT. TRI DOMINIC',60),
  ('PT. TRI DOMINITAMA',60),('PT. TRIKUSUMA JAYA PERKASA',60),('PT. SIBA SURYA',90)
) b(nama, hari)
  ON upper(regexp_replace(p.nama, '[^a-zA-Z0-9]', '', 'g'))
   = upper(regexp_replace(b.nama, '[^a-zA-Z0-9]', '', 'g'))
WHERE p.termin = b.hari;

COMMIT;
