-- 시스템 기준시각을 WIB(Asia/Jakarta)로 고정합니다.
-- 이 스크립트는 데이터를 한 줄도 건드리지 않습니다. 함수 1개 생성,
-- 기본값 3개 교체, 트리거 함수 2개 재정의가 전부이며 몇 번을 돌려도 같습니다.
BEGIN;

CREATE OR REPLACE FUNCTION wib_today() RETURNS date
  LANGUAGE sql STABLE
  AS $$ SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date $$;

ALTER TABLE penjualan   ALTER COLUMN tgl SET DEFAULT wib_today();
ALTER TABLE pembelian   ALTER COLUMN tgl SET DEFAULT wib_today();
ALTER TABLE stok_mutasi ALTER COLUMN tgl SET DEFAULT wib_today();

CREATE OR REPLACE FUNCTION trg_penjualan_kirim() RETURNS TRIGGER AS $wib$
BEGIN
  IF NEW.status = 'kirim' AND OLD.status IS DISTINCT FROM 'kirim' THEN
    INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
    SELECT wib_today(), NEW.gudang, i.produk, 'keluar', -i.qty, NEW.no, 'Pengiriman penjualan'
    FROM penjualan_item i WHERE i.penjualan = NEW.id;
  END IF;
  RETURN NEW;
END;
$wib$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_pembelian_terima() RETURNS TRIGGER AS $wib$
BEGIN
  IF NEW.status = 'diterima' AND OLD.status IS DISTINCT FROM 'diterima' THEN
    INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
    SELECT wib_today(), NEW.gudang, i.produk, 'masuk', i.qty, NEW.no, 'Penerimaan pembelian'
    FROM pembelian_item i WHERE i.pembelian = NEW.id;
  END IF;
  RETURN NEW;
END;
$wib$ LANGUAGE plpgsql;

COMMIT;
