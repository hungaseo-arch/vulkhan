-- 10: 바뀔 행 미리 보기 (읽기 전용)
-- 규칙은 서버 besar() 와 같음: 앞뒤 공백 제거, 연속 공백 1칸, 대문자
-- 1) kota
SELECT kode, nama, kota AS sekarang,
       UPPER(REGEXP_REPLACE(TRIM(kota), '\s+', ' ', 'g')) AS baru
FROM pelanggan
WHERE kota IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(kota), '\s+', ' ', 'g'))
ORDER BY kota, kode;

-- 2) sales
SELECT kode, nama, sales AS sekarang,
       UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g')) AS baru
FROM pelanggan
WHERE sales IS DISTINCT FROM UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g'))
ORDER BY sales, kode;

-- 3) 통일 후 모습 — 같은 지점/담당자가 한 줄로 모이는지 확인
SELECT UPPER(REGEXP_REPLACE(TRIM(kota), '\s+', ' ', 'g')) AS kota, COUNT(*) AS n
FROM pelanggan GROUP BY 1 ORDER BY 1;
SELECT UPPER(REGEXP_REPLACE(TRIM(sales), '\s+', ' ', 'g')) AS sales, COUNT(*) AS n
FROM pelanggan GROUP BY 1 ORDER BY 1;
