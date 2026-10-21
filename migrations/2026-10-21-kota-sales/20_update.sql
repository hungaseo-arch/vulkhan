-- 20: 실제 변경. 10_dry_run.sql 결과를 확인한 뒤 실행하세요.
-- UPDATE 건수가 10번 1)·2) 의 행 수와 같은지 보고 COMMIT, 다르면 ROLLBACK.
BEGIN;

UPDATE pelanggan
SET kota = UPPER(REGEXP_REPLACE(TRIM(kota), '\s+', ' ', 'g'))
WHERE kota IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(kota), '\s+', ' ', 'g'));

UPDATE pelanggan
SET sales = UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g'))
WHERE sales IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g'));

-- 재확인: 0행이어야 함
SELECT kode, kota, sales FROM pelanggan
WHERE kota  IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(kota),  '\s+', ' ', 'g'))
   OR sales IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g'));

COMMIT;

-- (보류) 담당자 병합 — 동일 인물임을 확인한 뒤에만 주석을 풀어 실행
-- SELECT kode, nama, sales FROM pelanggan WHERE sales IN ('PUTRA', 'PUTRA LUBIS') ORDER BY sales, kode;
-- UPDATE pelanggan SET sales = 'PUTRA LUBIS' WHERE sales = 'PUTRA';
