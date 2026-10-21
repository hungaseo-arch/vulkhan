-- 읽기 전용. 20_unique_no.sql 을 돌리기 전에 먼저 실행하십시오.

-- 1) 이미 걸린 UNIQUE 제약/인덱스가 있는지. 'penjualan_no_key' 등이 나오면
--    20번은 실행할 필요가 없습니다(그대로 두면 IF NOT EXISTS 로 넘어갑니다).
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'penjualan' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(no)%';

-- 2) 같은 전표번호가 두 건 이상인지. 0행이어야 제약을 걸 수 있습니다.
--    행이 나오면 멈추고 결과를 알려 주십시오. 번호 정리는 데이터 변경이라
--    별도 결정이 필요합니다.
SELECT no, count(*) AS jumlah,
       array_agg(id ORDER BY id) AS id_list,
       array_agg(pelanggan ORDER BY id) AS pelanggan_list,
       array_agg(tgl ORDER BY id) AS tgl_list
FROM penjualan
GROUP BY no
HAVING count(*) > 1
ORDER BY no;
