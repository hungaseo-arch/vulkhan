-- D1 지점 분리: 같은 회사를 지점별로 관리하는 쌍은 "회사명 - 지점" 으로 이름을 바꿉니다.
-- 30_d1_dry_run.sql 1번 결과에서 kota 가 정말 Surabaya/Jakarta/Semarang 인지 확인한 뒤 실행하세요.
-- 코드(kode)·거래 내역은 그대로이고 이름만 바뀝니다.
BEGIN;
UPDATE pelanggan SET nama = nama || ' - SURABAYA'  WHERE kode = 'PLG-024' AND nama NOT LIKE '% - %';
UPDATE pelanggan SET nama = nama || ' - JAKARTA'   WHERE kode = 'PLG-029' AND nama NOT LIKE '% - %';
UPDATE pelanggan SET nama = nama || ' - SURABAYA'  WHERE kode = 'PLG-008' AND nama NOT LIKE '% - %';
UPDATE pelanggan SET nama = nama || ' - SEMARANG'  WHERE kode = 'PLG-030' AND nama NOT LIKE '% - %';
SELECT kode, nama, kota FROM pelanggan WHERE kode IN ('PLG-024','PLG-029','PLG-008','PLG-030') ORDER BY kode;
-- 결과 4행이 맞으면 COMMIT; , 아니면 ROLLBACK;
