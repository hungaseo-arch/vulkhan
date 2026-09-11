-- Credit-limit proposals: staff drafts a new limit, admin approves or rejects it.
-- Mirrors ensureUsulan() in api-server.js, which creates the same table at runtime;
-- this file exists so the schema change is recorded like every other migration.
-- Additive-only: one new table plus its partial unique index. No existing row is touched.
--
-- pengusul / penentu are NOT foreign keys to pengguna: deleting an account must keep
-- working, and the *_nama snapshots keep the history readable after a user is gone.
BEGIN;

CREATE TABLE IF NOT EXISTS limit_usulan (
  id          TEXT PRIMARY KEY,
  pelanggan   TEXT NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
  limit_lama  NUMERIC NOT NULL,
  limit_baru  NUMERIC NOT NULL CHECK (limit_baru >= 0),
  alasan      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak')),
  pengusul    TEXT NOT NULL, pengusul_nama TEXT NOT NULL,
  diusulkan   TIMESTAMPTZ NOT NULL DEFAULT now(),
  penentu     TEXT, penentu_nama TEXT, diputuskan TIMESTAMPTZ,
  catatan     TEXT NOT NULL DEFAULT ''
);

-- One pending proposal per customer, so two different numbers can never wait
-- for the same decision.
CREATE UNIQUE INDEX IF NOT EXISTS limit_usulan_menunggu
  ON limit_usulan (pelanggan) WHERE status = 'menunggu';

SELECT count(*) AS usulan FROM limit_usulan;

COMMIT;
