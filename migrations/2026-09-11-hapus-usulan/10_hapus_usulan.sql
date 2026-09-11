-- Delete proposals: anyone logged in files one, an admin approves or rejects it.
-- Approval performs the delete. Mirrors ensureHapus() in api-server.js, which
-- creates the same table at runtime; this file exists so the schema change is
-- recorded like every other migration.
-- Additive-only: one new table plus its partial unique index. No existing row is touched.
--
-- There is deliberately NO foreign key to the target row. Approving a proposal
-- means deleting that row: ON DELETE CASCADE would take the approval record with
-- it — the one piece of evidence most worth keeping — and a plain FK would make
-- the deletion fail. sasaran_no / sasaran_ket / nilai are therefore SNAPSHOTS
-- taken when the proposal is filed; after the row is gone they are the only
-- answer to "what was deleted".
--
-- pengusul / penentu are NOT foreign keys to pengguna, for the same reason as
-- limit_usulan: deleting an account must keep working, and the *_nama snapshots
-- keep the history readable after a user is gone.
BEGIN;

CREATE TABLE IF NOT EXISTS hapus_usulan (
  id          TEXT PRIMARY KEY,
  jenis       TEXT NOT NULL CHECK (jenis IN ('penjualan','pembelian','pelanggan')),
  sasaran     TEXT NOT NULL,
  sasaran_no  TEXT NOT NULL,
  sasaran_ket TEXT NOT NULL DEFAULT '',
  nilai       NUMERIC NOT NULL DEFAULT 0,
  alasan      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak')),
  pengusul    TEXT NOT NULL, pengusul_nama TEXT NOT NULL,
  diusulkan   TIMESTAMPTZ NOT NULL DEFAULT now(),
  penentu     TEXT, penentu_nama TEXT, diputuskan TIMESTAMPTZ,
  catatan     TEXT NOT NULL DEFAULT ''
);

-- One pending proposal per target row, so an admin is never asked to decide the
-- same deletion twice.
CREATE UNIQUE INDEX IF NOT EXISTS hapus_usulan_menunggu
  ON hapus_usulan (jenis, sasaran) WHERE status = 'menunggu';

SELECT count(*) AS usulan FROM hapus_usulan;

COMMIT;
