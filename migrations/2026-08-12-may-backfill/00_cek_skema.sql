-- =====================================================================
-- 00_cek_skema.sql — 실행 전 실제 스키마 확인
-- =====================================================================

-- 1) 컬럼 구조
SELECT table_name, ordinal_position AS pos, column_name, data_type,
       is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name IN ('penjualan','penjualan_item','produk','pelanggan','gudang','stok_mutasi')
ORDER  BY table_name, ordinal_position;

-- 2) PK / UNIQUE 제약 (ON CONFLICT 대상 확인용)
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
FROM   information_schema.table_constraints tc
JOIN   information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema    = tc.table_schema
WHERE  tc.table_schema = 'public'
  AND  tc.constraint_type IN ('PRIMARY KEY','UNIQUE','FOREIGN KEY')
  AND  tc.table_name IN ('penjualan','penjualan_item','produk','pelanggan','gudang','stok_mutasi')
GROUP  BY 1,2,3
ORDER  BY 1,2;

-- 3) 현재 적재 상태 (기존 데이터 유무)
SELECT 'penjualan' t, count(*) n FROM penjualan
UNION ALL SELECT 'penjualan_item', count(*) FROM penjualan_item
UNION ALL SELECT 'produk',         count(*) FROM produk
UNION ALL SELECT 'pelanggan',      count(*) FROM pelanggan
UNION ALL SELECT 'gudang',         count(*) FROM gudang
UNION ALL SELECT 'stok_mutasi',    count(*) FROM stok_mutasi;
