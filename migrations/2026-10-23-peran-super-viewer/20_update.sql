-- 20: 실제 변경. '여기에_아이디' 를 수퍼관리자가 될 username 으로 바꾼 뒤 실행하세요.
-- UPDATE 가 1건이 아니면 COMMIT 대신 ROLLBACK.
BEGIN;

ALTER TABLE pengguna DROP CONSTRAINT pengguna_peran_check;
ALTER TABLE pengguna ADD CONSTRAINT pengguna_peran_check
  CHECK (peran IN ('super','admin','manager','staff','viewer'));

UPDATE pengguna SET peran = 'super' WHERE username = '여기에_아이디';

-- 재확인
SELECT peran, COUNT(*) AS n, string_agg(username, ', ' ORDER BY username) AS akun
FROM pengguna GROUP BY peran ORDER BY peran;

COMMIT;
