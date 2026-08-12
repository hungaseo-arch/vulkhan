-- Warehouse restructure: production had only a single warehouse, UTM
-- ("Gudang Utama"), but that was actually a misnamed entry for the real
-- Karawang warehouse. This migration:
--   1) registers the real warehouses Karawang(KRW)/Semarang(SMG)/Surabaya(SBY)
--   2) re-points every existing penjualan/pembelian/stok_mutasi row that
--      referenced gudang='UTM' to gudang='KRW' (no data loss, pure rename)
--   3) deletes the now-unreferenced UTM row
BEGIN;

INSERT INTO gudang (id, kode, nama, kota) VALUES
  ('KRW', 'KRW', 'Gudang Karawang', 'Karawang'),
  ('SMG', 'SMG', 'Gudang Semarang', 'Semarang'),
  ('SBY', 'SBY', 'Gudang Surabaya', 'Surabaya')
ON CONFLICT (id) DO NOTHING;

UPDATE penjualan   SET gudang = 'KRW' WHERE gudang = 'UTM';
UPDATE pembelian    SET gudang = 'KRW' WHERE gudang = 'UTM';
UPDATE stok_mutasi SET gudang = 'KRW' WHERE gudang = 'UTM';

DELETE FROM gudang WHERE id = 'UTM';

SELECT id, kode, nama, kota FROM gudang ORDER BY id;

COMMIT;
