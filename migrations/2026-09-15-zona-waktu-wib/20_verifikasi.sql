-- 읽기 전용 사후 확인.
-- 1) 함수가 오늘의 WIB 날짜를 돌려주는가
SELECT wib_today() AS today_wib, CURRENT_DATE AS today_server,
       wib_today() - CURRENT_DATE AS selisih_hari;   -- WIB 00~07시엔 1, 그 밖엔 0

-- 2) 기본값 3개가 전부 wib_today() 인가
SELECT table_name, column_default
FROM information_schema.columns
WHERE column_name = 'tgl' AND table_name IN ('penjualan','pembelian','stok_mutasi')
ORDER BY table_name;

-- 3) 트리거 함수 본문에 CURRENT_DATE 가 남아 있지 않은가 (기대: 0행)
SELECT proname FROM pg_proc
WHERE proname IN ('trg_penjualan_kirim','trg_pembelian_terima')
  AND pg_get_functiondef(oid) LIKE '%CURRENT_DATE%';
