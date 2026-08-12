-- Adds the "hargaUser" (end-user price) column to produk and backfills it from
-- harga_user.csv (kode -> harga_user), sourced from stok_2026-07-23.xlsx (sheet "Lia").
-- Additive-only: new nullable column, update by kode, no rows added/removed.
BEGIN;

ALTER TABLE produk ADD COLUMN IF NOT EXISTS "hargaUser" numeric(14,2);

DROP TABLE IF EXISTS stg_harga_user;
CREATE TEMP TABLE stg_harga_user (kode text, harga_user numeric(14,2));
\copy stg_harga_user FROM 'harga_user.csv' WITH (FORMAT csv, HEADER true)

UPDATE produk p SET "hargaUser" = s.harga_user
FROM stg_harga_user s WHERE s.kode = p.kode;

SELECT count(*) AS updated FROM produk WHERE "hargaUser" IS NOT NULL;

COMMIT;
