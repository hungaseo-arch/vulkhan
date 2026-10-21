-- 00: 현재 상태 (읽기 전용)
-- 1) 지점(kota) 값별 고객 수 — 같은 지점이 철자만 달리 여러 줄이면 대상
SELECT kota, COUNT(*) AS n
FROM pelanggan
GROUP BY kota
ORDER BY UPPER(TRIM(kota)), kota;

-- 2) 영업담당(sales) 값별 고객 수
SELECT sales, COUNT(*) AS n
FROM pelanggan
GROUP BY sales
ORDER BY UPPER(TRIM(sales)), sales;
