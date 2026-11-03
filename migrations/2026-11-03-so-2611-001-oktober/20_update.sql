-- SO-2611-001 전표일을 2026-10-31로 옮겨 10월 판매로 집계되게 합니다.
-- 번호(SO-2611-001)는 stok_mutasi.ref 키라서 바꾸지 않습니다.
BEGIN;

UPDATE penjualan
   SET tgl = '2026-10-31', tgl_kirim = '2026-10-31'
 WHERE no = 'SO-2611-001' AND tgl = '2026-11-02';
-- 기대: UPDATE 1

UPDATE stok_mutasi
   SET tgl = '2026-10-31'
 WHERE ref = 'SO-2611-001' AND tipe = 'keluar' AND tgl <> '2026-10-31';
-- 기대: UPDATE 0 (이미 10-31이면) 또는 1

SELECT no, tgl, tgl_kirim, status FROM penjualan WHERE no = 'SO-2611-001';

COMMIT;
