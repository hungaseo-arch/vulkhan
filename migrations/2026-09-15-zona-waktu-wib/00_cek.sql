-- 읽기 전용. 지금 DB가 어느 시간대로 도는지, 그리고 WIB와 몇 시간 차이인지.
-- 기대: tz = GMT, today_server 와 today_wib 가 WIB 00:00~07:00 사이에는 다름.
SELECT current_setting('TimeZone')              AS tz,
       now()                                    AS now_server,
       CURRENT_DATE                             AS today_server,
       (now() AT TIME ZONE 'Asia/Jakarta')::date AS today_wib;

-- wib_today() 가 이미 있는지 (없으면 0행)
SELECT p.proname, pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.proname = 'wib_today';

-- 지금 CURRENT_DATE 를 쓰고 있는 자리 — 기본값 3개
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE column_name = 'tgl'
  AND table_name IN ('penjualan','pembelian','stok_mutasi')
ORDER BY table_name;
