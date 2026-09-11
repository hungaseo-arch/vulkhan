-- Customer profile columns: the invoice identity fields (owner, address, tax id,
-- email) and the sales fields (account salesperson, internal note).
-- Mirrors ensurePelanggan() in api-server.js, which runs the same ALTERs at boot;
-- this file exists so the schema change is recorded like every other migration.
--
-- Additive-only and idempotent: ADD COLUMN IF NOT EXISTS on an existing table.
-- NOT NULL DEFAULT '' rather than nullable, so the UI never has to tell "empty"
-- apart from NULL, and existing rows get '' without a rewrite of user data.
BEGIN;

ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS pemilik TEXT NOT NULL DEFAULT '';
ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS alamat  TEXT NOT NULL DEFAULT '';
ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS email   TEXT NOT NULL DEFAULT '';
ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS npwp    TEXT NOT NULL DEFAULT '';
ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS sales   TEXT NOT NULL DEFAULT '';
ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS catatan TEXT NOT NULL DEFAULT '';

SELECT count(*) AS pelanggan FROM pelanggan;

COMMIT;
