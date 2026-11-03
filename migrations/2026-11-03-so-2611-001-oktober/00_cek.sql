-- 읽기 전용: SO-2611-001 현재 상태와 재고 원장 날짜 확인
SELECT id, no, tgl, tgl_kirim, status, pelanggan, gudang
FROM penjualan WHERE no = 'SO-2611-001';

SELECT id, tgl, gudang, produk, tipe, qty, ref
FROM stok_mutasi WHERE ref = 'SO-2611-001' ORDER BY id;
-- 기대: penjualan 1행(tgl 2026-11-02, tgl_kirim 2026-10-31), stok_mutasi keluar 1행(tgl 2026-10-31)
