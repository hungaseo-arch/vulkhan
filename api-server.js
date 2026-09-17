// ============================================================
// VULKANISIR — API Server (Express + Neon serverless)
// ------------------------------------------------------------
// Jalankan:  DATABASE_URL="postgres://..." AUTH_SECRET="rahasia-panjang" node api-server.js
// Env: DATABASE_URL (wajib), AUTH_SECRET (produksi), CORS_ORIGIN (opsional), PORT (opsional).
// Stok tidak pernah disimpan langsung — dihitung dari view v_stok.
// ============================================================

import express from "express";
import cors from "cors";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { neon, types } from "@neondatabase/serverless";

// Kembalikan kolom DATE (oid 1082) apa adanya sebagai 'YYYY-MM-DD'.
// Tanpa ini, driver mem-parsing ke JS Date dan menggeser tanggal karena
// zona waktu (mis. 2026-07-08 → "2026-07-07T17:00:00Z" di UTC+7).
types.setTypeParser(1082, (v) => v);

// Pesan bawaan driver ("connection string format should be…") tidak menyebut
// variabel mana yang salah, jadi diperiksa di sini lebih dulu — ini kesalahan
// pertama yang hampir selalu muncul saat menjalankan server lokal.
// Dilempar sebagai Error, bukan process.exit(), karena berkas ini juga di-import
// sebagai fungsi serverless Vercel; di sana keluar paksa akan mematikan runtime.
const DB_URL = process.env.DATABASE_URL;
if (!/^postgres(ql)?:\/\/[^:@/]+:[^@]*@[^/]+\/.+/.test(DB_URL || ""))
  throw new Error(
    (DB_URL ? "DATABASE_URL bukan connection string Postgres yang sah." : "DATABASE_URL belum diisi.") +
      "\nAmbil dari Neon Console → Connection string, lalu jalankan:" +
      '\n  DATABASE_URL="postgresql://user:sandi@ep-xxx.aws.neon.tech/neondb?sslmode=require" node api-server.js',
  );
const sql = neon(DB_URL);
const app = express();

// CORS dibatasi ke origin yang diizinkan (set CORS_ORIGIN, dipisah koma).
// Default: port dev Vite lokal.
const ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: ORIGINS }));
app.use(express.json());

// Seluruh /api butuh sesi login — baca maupun tulis. Data pelanggan, harga,
// dan transaksi tidak boleh terbuka untuk anonim. Pemeriksaan can() di App.jsx
// hanya menyembunyikan tombol, bukan pengaman.
// Pengecualian: /login (belum punya token) dan /health (cek koneksi sebelum login).
// Ditaruh sebelum penyiapan basis data agar permintaan anonim tidak menyentuh DB.
const TERBUKA = new Set(["/api/login", "/api/health"]);
app.use((req, res, next) => (TERBUKA.has(req.path) ? next() : requireRole("staff")(req, res, next)));

// Cek koneksi, dipakai layar login sebelum ada sesi.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Seed pengguna bawaan sekali (memoized) — berjalan di lokal & serverless.
// Reset ke null bila gagal agar dicoba lagi pada request berikutnya.
let ready;
const ensureReady = () => (ready ||= ensureUsers()
  // ensurePenjualan() punya FK ke pengguna, jadi tabel itu harus ada lebih dulu.
  .then(() => Promise.all([ensureUsulan(), ensureHapus(), ensurePelanggan(), ensurePenjualan()]))
  // ensureWaktu() membuat wib_today(), lalu memakainya di DEFAULT kolom dan di
  // badan trigger — jadi ia harus jalan sesudah tabel-tabelnya ada.
  .then(() => ensureWaktu())
  .catch((e) => { ready = null; throw e; }));
app.use((req, res, next) => ensureReady().then(() => next()).catch(next));

// Kolom teks pelanggan NOT NULL DEFAULT '' — undefined/null dari klien lama
// harus jadi string kosong, bukan NULL yang ditolak basis data.
const teks = (v) => String(v ?? "").trim();

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

// ---------- auth & hak akses (RBAC) ----------
// Kata sandi di-hash dengan scrypt (tanpa dependensi tambahan).
const hashPw = (pw) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
};
const verifyPw = (pw, stored) => {
  const [salt, dk] = String(stored).split(":");
  if (!salt || !dk) return false;
  const calc = crypto.scryptSync(pw, salt, 64);
  const a = Buffer.from(dk, "hex");
  return a.length === calc.length && crypto.timingSafeEqual(a, calc);
};

// Token sesi bertanda tangan (HMAC-SHA256, tanpa dependensi — mini-JWT).
// Peran diambil dari payload yang TERVERIFIKASI, bukan dari header yang bisa
// dipalsukan klien. Set AUTH_SECRET di produksi agar token bertahan lintas restart.
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.AUTH_SECRET)
  console.warn("⚠  AUTH_SECRET tak diset — token jadi tak valid tiap restart. Set AUTH_SECRET untuk produksi.");
const TOKEN_TTL = 12 * 3600 * 1000; // 12 jam

const signToken = (u) => {
  const body = Buffer.from(JSON.stringify({ id: u.id, username: u.username, peran: u.peran, exp: Date.now() + TOKEN_TTL })).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return body + "." + sig;
};
const verifyToken = (token) => {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expect = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp && data.exp > Date.now() ? data : null;
  } catch { return null; }
};

const RANK = { staff: 1, manager: 2, admin: 3 };
// requireRole("staff") berarti "cukup harus login" karena staff peran terendah.
// Dipakai sebagai penjaga global di atas; rute yang butuh peran lebih tinggi
// memasangnya lagi secara eksplisit (manager untuk hapus, admin untuk pengguna).
const requireRole = (min) => (req, res, next) => {
  const auth = verifyToken((req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!auth) return res.status(401).json({ error: "Sesi tidak valid. Silakan login ulang." });
  if ((RANK[auth.peran] || 0) < RANK[min])
    return res.status(403).json({ error: `Akses ditolak: butuh peran ${min} ke atas.` });
  req.user = auth;
  next();
};

// Seed 3 pengguna bawaan bila tabel masih kosong.
const DEFAULT_USERS = [
  { id: "U1", username: "admin",   nama: "Administrator",   peran: "admin",   sandi: "admin123" },
  { id: "U2", username: "manager", nama: "Manajer Operasi",  peran: "manager", sandi: "manager123" },
  { id: "U3", username: "staff",   nama: "Staf Penjualan",   peran: "staff",   sandi: "staff123" },
];
// Pemulihan akses lewat env — aplikasi ini sengaja tidak punya layar
// pendaftaran, jadi kalau tidak tersisa satu pun admin yang bisa login, tidak
// ada jalan masuk sama sekali. Set ADMIN_USER + ADMIN_PASS (opsional
// ADMIN_NAMA) di Vercel, deploy ulang, lalu HAPUS lagi env-nya.
//
// Hanya MEMBUAT bila username-nya belum ada — tidak pernah menimpa akun yang
// sudah ada. Kalau menimpa, sandi yang sudah diganti lewat aplikasi akan
// ter-reset ke nilai env pada setiap cold start. Untuk reset sandi akun yang
// sudah ada, pakai scripts/buat-admin.mjs.
async function bootstrapAdmin() {
  const username = (process.env.ADMIN_USER || "").trim();
  const sandi = process.env.ADMIN_PASS || "";
  if (!username || !sandi) return;
  if (sandi.length < 8) return console.warn("ADMIN_PASS kurang dari 8 karakter — bootstrap dilewati.");

  const [ada] = await sql`SELECT 1 FROM pengguna WHERE username = ${username}`;
  if (ada) return; // sudah ada — jangan sentuh sandinya
  const [{ maks }] = await sql`
    SELECT COALESCE(MAX(SUBSTRING(id FROM 2)::int), 0) AS maks
    FROM pengguna WHERE id ~ '^U[0-9]+$'`;
  await sql`
    INSERT INTO pengguna (id, username, nama, peran, sandi_hash)
    VALUES (${"U" + (Number(maks) + 1)}, ${username}, ${process.env.ADMIN_NAMA || username},
            'admin', ${hashPw(sandi)})
    ON CONFLICT (username) DO NOTHING`;
  console.log(`Admin dibuat dari env: ${username} — hapus ADMIN_USER/ADMIN_PASS setelah bisa login.`);
}

// Usulan perubahan limit kredit. Dibuat di sini — bukan hanya lewat migrasi —
// mengikuti pola tabel pengguna, supaya basis data baru langsung siap pakai.
//
// pengusul/penentu disimpan sebagai teks TANPA foreign key ke pengguna, dan
// nama pemakainya ikut disalin: riwayat persetujuan harus tetap terbaca setelah
// akunnya dihapus, dan FK akan membuat penghapusan akun gagal.
async function ensureUsulan() {
  await sql`
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
      catatan     TEXT NOT NULL DEFAULT '',
      termin_lama INTEGER,
      termin_baru INTEGER CHECK (termin_baru >= 0)
    )`;
  // Kolom termin (TOP) menyusul setelah tabel dipakai, jadi ditambahkan juga
  // lewat ALTER untuk basis data yang sudah ada — CREATE TABLE IF NOT EXISTS
  // di atas tidak menyentuh tabel yang sudah terbentuk. NULL pada baris lama
  // berarti "usulan itu tidak menyangkut termin", bukan termin nol.
  await sql`ALTER TABLE limit_usulan ADD COLUMN IF NOT EXISTS termin_lama INTEGER`;
  await sql`ALTER TABLE limit_usulan ADD COLUMN IF NOT EXISTS termin_baru INTEGER CHECK (termin_baru >= 0)`;
  // Satu usulan menunggu per pelanggan — mencegah dua angka berbeda menunggu
  // keputusan untuk pelanggan yang sama.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS limit_usulan_menunggu
    ON limit_usulan (pelanggan) WHERE status = 'menunggu'`;
}

// Usulan penghapusan data. Menghapus penjualan/pembelian membuang juga mutasi
// stoknya, jadi satu klik yang salah menggeser saldo gudang tanpa jejak — sejak
// ada tabel ini, penghapusan langsung hanya untuk admin dan peran lain
// mengajukannya lebih dulu.
//
// TIDAK ada foreign key ke baris sasaran, dan itu disengaja: menyetujui usulan
// berarti menghapus baris itu. FK dengan ON DELETE CASCADE akan ikut menghapus
// catatan persetujuannya — justru bukti yang paling perlu disimpan — sedangkan
// FK biasa akan membuat penghapusannya gagal. Nomor dan keterangan sasaran
// karena itu DISALIN saat usulan dibuat: setelah barisnya hilang, hanya salinan
// ini yang masih bisa menjawab "apa yang dihapus".
async function ensureHapus() {
  await sql`
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
    )`;
  // Satu usulan menunggu per baris sasaran — dua permintaan untuk transaksi yang
  // sama hanya membuat admin memutuskan hal yang sama dua kali.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS hapus_usulan_menunggu
    ON hapus_usulan (jenis, sasaran) WHERE status = 'menunggu'`;
}

/* Tabel pelanggan sudah ada sejak awal, jadi kolom profil ditambahkan lewat
   ALTER ... IF NOT EXISTS: tidak ada migrasi manual yang harus dijalankan
   orang, dan basis data yang sudah menerimanya tidak berubah lagi.
   DEFAULT '' supaya UI tidak perlu membedakan "belum diisi" dari NULL. */
async function ensurePelanggan() {
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS pemilik TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS alamat  TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS email   TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS npwp    TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS sales   TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE pelanggan ADD COLUMN IF NOT EXISTS catatan TEXT NOT NULL DEFAULT ''`;
}

/* Kolom pemilik dokumen penjualan. Dipakai aturan "boleh ubah/hapus sendiri
   selama masih bulan berjalan" — lihat tolakUbahSO() di bawah. Boleh NULL:
   348 baris hasil import historis tidak punya pembuat, jadi hanya admin yang
   bisa menyentuhnya, dan itu memang yang diinginkan.

   ON DELETE SET NULL, bukan penolakan: menghapus pengguna tidak boleh gagal
   hanya karena ia pernah membuat transaksi. Dokumennya tetap ada, pemiliknya
   kosong, dan haknya jatuh kembali ke admin — sama seperti baris import.

   v_penjualan menyebut kolomnya satu per satu, jadi ALTER saja tidak membuat
   kolom ini muncul di /bootstrap — view-nya harus dibuat ulang. CREATE OR
   REPLACE VIEW hanya boleh MENAMBAH kolom di URUTAN PALING BELAKANG, jadi
   dibuat_oleh ditaruh sesudah total, bukan mengikuti urutan tabelnya. */
async function ensurePenjualan() {
  await sql`ALTER TABLE penjualan ADD COLUMN IF NOT EXISTS dibuat_oleh TEXT
    REFERENCES pengguna(id) ON DELETE SET NULL`;
  /* Tanggal barang benar-benar keluar, terpisah dari tanggal dokumen: barang
     sering berangkat beberapa hari sesudah SO ditulis, dan yang dicari orang
     di buku mutasi adalah hari keberangkatannya. NULL selama dokumen belum
     dikirim — termasuk seluruh baris lama, yang memang tidak pernah punya
     tanggal ini. Jatuh tempo tetap dihitung dari p.tgl. */
  await sql`ALTER TABLE penjualan ADD COLUMN IF NOT EXISTS tgl_kirim DATE`;
  await sql`
    CREATE OR REPLACE VIEW v_penjualan AS
      SELECT p.id, p.no, p.tgl, p.pelanggan, p.gudang, p.status,
             COALESCE(SUM(i.qty * i.harga),0) AS total,
             p.dibuat_oleh, p.tgl_kirim
      FROM penjualan p
      LEFT JOIN penjualan_item i ON i.penjualan = p.id
      GROUP BY p.id`;
}

/* Satu jam untuk seluruh sistem: WIB (Asia/Jakarta).

   Basis datanya berjalan di UTC — `current_setting('TimeZone')` = GMT. Tujuh
   jam di belakang Jakarta, jadi setiap hari antara pukul 00:00 dan 07:00 WIB
   CURRENT_DATE masih menunjuk hari kemarin. Akibatnya nyata, bukan teori:

   - Setiap tanggal 1 pagi, dokumen yang baru saja dibuat ditolak sebagai
     "di luar bulan berjalan" karena basis data masih di bulan lalu.
   - Pengiriman yang dicatat pagi hari masuk buku mutasi dengan tanggal
     kemarin, dan rekap harian gudang ikut meleset.

   wib_today() menggantikan CURRENT_DATE di mana pun tanggal itu menentukan
   hari kerja, bukan sekadar stempel waktu. Dibuat lewat CREATE OR REPLACE dan
   dipasang ulang di setiap cold start, seperti ensure* yang lain: tidak ada
   migrasi manual yang harus diingat orang.

   'Asia/Jakarta' ditulis apa adanya, bukan interval +7, supaya yang terbaca
   adalah maksudnya. WIB memang tidak pernah punya daylight saving, tapi
   nama zona tetap lebih jujur daripada angka. */
async function ensureWaktu() {
  await sql`
    CREATE OR REPLACE FUNCTION wib_today() RETURNS date
      LANGUAGE sql STABLE
      AS $wib$ SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date $wib$`;

  // Tanggal bawaan tiga buku utama. Klien hampir selalu mengirim tanggalnya
  // sendiri, tapi yang tidak mengirim pun harus dapat hari yang benar.
  await sql`ALTER TABLE penjualan   ALTER COLUMN tgl SET DEFAULT wib_today()`;
  await sql`ALTER TABLE pembelian   ALTER COLUMN tgl SET DEFAULT wib_today()`;
  await sql`ALTER TABLE stok_mutasi ALTER COLUMN tgl SET DEFAULT wib_today()`;

  // Kedua trigger mencatat tanggal mutasi sendiri — di sinilah CURRENT_DATE
  // paling sering salah, karena pengiriman pagi hari adalah hal biasa.
  // Untuk penjualan, tanggal kirim yang dipilih orang menang atas hari ini;
  // wib_today() tinggal jaring pengaman untuk dokumen tanpa tgl_kirim.
  await sql`
    CREATE OR REPLACE FUNCTION trg_penjualan_kirim() RETURNS TRIGGER AS $wib$
    BEGIN
      IF NEW.status = 'kirim' AND OLD.status IS DISTINCT FROM 'kirim' THEN
        INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
        SELECT COALESCE(NEW.tgl_kirim, wib_today()), NEW.gudang, i.produk, 'keluar', -i.qty, NEW.no, 'Pengiriman penjualan'
        FROM penjualan_item i WHERE i.penjualan = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $wib$ LANGUAGE plpgsql`;
  await sql`
    CREATE OR REPLACE FUNCTION trg_pembelian_terima() RETURNS TRIGGER AS $wib$
    BEGIN
      IF NEW.status = 'diterima' AND OLD.status IS DISTINCT FROM 'diterima' THEN
        INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
        SELECT wib_today(), NEW.gudang, i.produk, 'masuk', i.qty, NEW.no, 'Penerimaan pembelian'
        FROM pembelian_item i WHERE i.pembelian = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $wib$ LANGUAGE plpgsql`;
}

async function ensureUsers() {
  await sql`
    CREATE TABLE IF NOT EXISTS pengguna (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nama TEXT NOT NULL,
      peran TEXT NOT NULL CHECK (peran IN ('admin','manager','staff')),
      sandi_hash TEXT NOT NULL, dibuat TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM pengguna`;
  if (n === 0) {
    for (const u of DEFAULT_USERS) {
      await sql`INSERT INTO pengguna (id, username, nama, peran, sandi_hash)
                VALUES (${u.id}, ${u.username}, ${u.nama}, ${u.peran}, ${hashPw(u.sandi)})
                ON CONFLICT (username) DO NOTHING`;
    }
    console.log("Seeded pengguna bawaan: admin / manager / staff");
  }
  await bootstrapAdmin();
}

app.post("/api/login", wrap(async (req, res) => {
  const { username, sandi } = req.body || {};
  const [u] = await sql`SELECT * FROM pengguna WHERE username = ${username}`;
  if (!u || !verifyPw(sandi || "", u.sandi_hash))
    return res.status(401).json({ error: "Username atau kata sandi salah." });
  res.json({ id: u.id, username: u.username, nama: u.nama, peran: u.peran, token: signToken(u) });
}));

app.get("/api/pengguna", requireRole("admin"), wrap(async (_req, res) => {
  res.json(await sql`SELECT id, username, nama, peran, dibuat FROM pengguna ORDER BY peran, username`);
}));

app.post("/api/pengguna", requireRole("admin"), wrap(async (req, res) => {
  const u = req.body;
  const [row] = await sql`
    INSERT INTO pengguna (id, username, nama, peran, sandi_hash)
    VALUES (${u.id}, ${u.username}, ${u.nama}, ${u.peran}, ${hashPw(u.sandi)})
    RETURNING id, username, nama, peran, dibuat`;
  res.status(201).json(row);
}));

// Ganti kata sandi sendiri — semua peran yang login. Memakai id dari token
// yang terverifikasi, jadi pengguna hanya bisa mengubah sandi miliknya.
app.post("/api/ganti-sandi", wrap(async (req, res) => {
  const { lama, baru } = req.body || {};
  if (!baru || String(baru).length < 6)
    return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter." });
  const [u] = await sql`SELECT sandi_hash FROM pengguna WHERE id = ${req.user.id}`;
  if (!u || !verifyPw(lama || "", u.sandi_hash))
    return res.status(400).json({ error: "Kata sandi lama salah." });
  await sql`UPDATE pengguna SET sandi_hash = ${hashPw(baru)} WHERE id = ${req.user.id}`;
  res.json({ ok: true });
}));

// Ubah nama & peran pengguna (admin). Username tidak ikut diubah: dipakai untuk
// login dan jadi acuan akun di seluruh riwayat. Kata sandi juga tidak disentuh —
// untuk itu ada /reset-sandi (admin) dan /ganti-sandi (pemilik akun).
app.put("/api/pengguna/:id", requireRole("admin"), wrap(async (req, res) => {
  const nama = String(req.body?.nama || "").trim();
  const { peran } = req.body || {};
  if (!nama) return res.status(400).json({ error: "Nama wajib diisi." });
  if (!RANK[peran]) return res.status(400).json({ error: "Peran tidak dikenal." });

  const [u] = await sql`SELECT id, peran FROM pengguna WHERE id = ${req.params.id}`;
  if (!u) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  // Dua penjagaan supaya layar ini tidak bisa mengunci dirinya sendiri: admin
  // yang menurunkan perannya sendiri langsung kehilangan akses, dan admin
  // terakhir yang diturunkan membuat tak ada lagi yang bisa mengelola akun.
  if (u.id === req.user.id && peran !== u.peran)
    return res.status(400).json({ error: "Tidak bisa mengubah peran akun sendiri." });
  if (u.peran === "admin" && peran !== "admin") {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM pengguna WHERE peran = 'admin'`;
    if (n <= 1) return res.status(400).json({ error: "Harus tersisa minimal satu admin." });
  }

  const [row] = await sql`
    UPDATE pengguna SET nama = ${nama}, peran = ${peran}
    WHERE id = ${req.params.id}
    RETURNING id, username, nama, peran, dibuat`;
  res.json(row);
}));

// Reset kata sandi pengguna lain ke SANDI_AWAL (admin) — untuk pengguna yang
// lupa sandinya, tanpa perlu menjalankan scripts/buat-admin.mjs dari terminal.
// Sandi awal sengaja konstan dan ditampilkan di layar admin supaya bisa
// disampaikan ke pengguna yang bersangkutan; nilainya digandakan di
// SANDI_AWAL pada src/App.jsx — kalau diubah, ubah keduanya bersamaan.
//
// Akun sendiri dikecualikan: admin yang masih bisa login tidak perlu reset,
// dan mengubah sandi sendiri ke nilai yang diketahui semua orang justru
// memperlemah akun dengan hak akses tertinggi.
const SANDI_AWAL = "ascendo123";

app.post("/api/pengguna/:id/reset-sandi", requireRole("admin"), wrap(async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: "Tidak bisa mereset sandi akun sendiri — pakai menu Ganti Kata Sandi." });
  const [u] = await sql`SELECT username FROM pengguna WHERE id = ${req.params.id}`;
  if (!u) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  await sql`UPDATE pengguna SET sandi_hash = ${hashPw(SANDI_AWAL)} WHERE id = ${req.params.id}`;
  res.json({ ok: true, username: u.username, sandi: SANDI_AWAL });
}));

// Hapus pengguna (admin) — tak boleh menghapus akun sendiri, agar selalu
// tersisa minimal satu admin yang bisa login.
app.delete("/api/pengguna/:id", requireRole("admin"), wrap(async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri." });
  const [u] = await sql`SELECT 1 FROM pengguna WHERE id = ${req.params.id}`;
  if (!u) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  await sql`DELETE FROM pengguna WHERE id = ${req.params.id}`;
  res.status(204).end();
}));

// Gabungkan baris item ke header-nya lewat Map — O(h + i), bukan filter per header.
const gabungItem = (head, items, kunci) => {
  const m = new Map();
  for (const it of items) {
    const k = it[kunci];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return head.map((h) => ({ ...h, items: m.get(h.id) || [] }));
};

// Buku mutasi untuk tampilan: 500 baris TERBARU, dikirim urut naik (lama→baru)
// supaya klien tinggal membalik. Ini bukan sumber kebenaran stok — lihat v_stok.
const MUTASI_LIMIT = 500;
const mutasiTerbaru = () => sql`
  SELECT * FROM (SELECT * FROM stok_mutasi ORDER BY id DESC LIMIT ${MUTASI_LIMIT}) t
  ORDER BY id ASC`;

// ---------- bootstrap: semua koleksi dalam SATU permintaan ----------
// Sebelumnya klien memanggil 7 endpoint sekaligus → di Vercel berarti sampai
// 7 invokasi fungsi (masing-masing bisa cold start + ensureUsers). Sekarang satu
// invokasi, kueri dijalankan paralel di sisi server.
app.get("/api/bootstrap", wrap(async (_req, res) => {
  const [gudang, produk, pelanggan, pemasok, stok, mutasi, soHead, soItem, poHead, poItem] = await Promise.all([
    sql`SELECT * FROM gudang ORDER BY kode`,
    sql`SELECT * FROM produk ORDER BY kode`,
    sql`
      SELECT p.*, COALESCE(pi.piutang,0) AS piutang
      FROM pelanggan p
      LEFT JOIN v_piutang pi ON pi.pelanggan = p.id
      ORDER BY p.kode`,
    sql`SELECT * FROM pemasok ORDER BY kode`,
    sql`SELECT * FROM v_stok`,
    mutasiTerbaru(),
    sql`SELECT * FROM v_penjualan ORDER BY tgl DESC, no DESC`,
    sql`SELECT * FROM penjualan_item`,
    sql`SELECT * FROM pembelian ORDER BY tgl DESC, no DESC`,
    sql`SELECT * FROM pembelian_item`,
  ]);
  res.json({
    gudang, produk, pelanggan, pemasok, stok, mutasi,
    mutasiLimit: MUTASI_LIMIT,
    penjualan: gabungItem(soHead, soItem, "penjualan"),
    pembelian: gabungItem(poHead, poItem, "pembelian"),
  });
}));

// ---------- master ----------
app.get("/api/gudang", wrap(async (_req, res) => {
  res.json(await sql`SELECT * FROM gudang ORDER BY kode`);
}));

app.get("/api/produk", wrap(async (_req, res) => {
  res.json(await sql`SELECT * FROM produk ORDER BY kode`);
}));

app.get("/api/pelanggan", wrap(async (_req, res) => {
  res.json(await sql`
    SELECT p.*, COALESCE(pi.piutang,0) AS piutang
    FROM pelanggan p
    LEFT JOIN v_piutang pi ON pi.pelanggan = p.id
    ORDER BY p.kode`);
}));

app.post("/api/pelanggan", wrap(async (req, res) => {
  const c = req.body;
  const [row] = await sql`
    INSERT INTO pelanggan (id, kode, nama, pemilik, pic, telp, email, alamat, kota, npwp,
                           sales, catatan, grade, limit_kredit, termin)
    VALUES (${c.id}, ${c.kode}, ${c.nama}, ${teks(c.pemilik)}, ${teks(c.pic)}, ${teks(c.telp)},
            ${teks(c.email)}, ${teks(c.alamat)}, ${teks(c.kota)}, ${teks(c.npwp)},
            ${teks(c.sales)}, ${teks(c.catatan)}, ${c.grade}, ${c.limit}, ${c.termin})
    RETURNING *`;
  res.status(201).json(row);
}));

// Limit kredit dan termin sengaja TIDAK ada di sini: keduanya hanya berubah
// lewat usulan yang disetujui admin, supaya jejak persetujuannya utuh.
app.put("/api/pelanggan/:id", wrap(async (req, res) => {
  const c = req.body || {};
  if (!String(c.nama || "").trim())
    return res.status(400).json({ error: "Nama pelanggan wajib diisi." });
  const [row] = await sql`
    UPDATE pelanggan SET
      nama = ${String(c.nama).trim()}, pemilik = ${teks(c.pemilik)}, pic = ${teks(c.pic)},
      telp = ${teks(c.telp)}, email = ${teks(c.email)}, alamat = ${teks(c.alamat)},
      kota = ${teks(c.kota)}, npwp = ${teks(c.npwp)}, sales = ${teks(c.sales)},
      catatan = ${teks(c.catatan)}, grade = ${c.grade}
    WHERE id = ${req.params.id}
    RETURNING *`;
  if (!row) return res.status(404).json({ error: "Pelanggan tidak ditemukan." });
  res.json(row);
}));

// ---------- usulan limit kredit (diajukan staf, diputuskan admin) ----------
// Limit kredit tidak pernah diubah langsung dari layar pelanggan: siapa pun yang
// login mengajukan angkanya, dan hanya admin yang mengesahkan. Angka di tabel
// pelanggan baru berubah pada saat usulan disetujui — dalam satu transaksi
// dengan pencatatan keputusannya, agar keduanya tidak pernah terpisah.
app.get("/api/limit-usulan", wrap(async (_req, res) => {
  res.json(await sql`
    SELECT u.*, p.kode AS pelanggan_kode, p.nama AS pelanggan_nama
    FROM limit_usulan u JOIN pelanggan p ON p.id = u.pelanggan
    ORDER BY (u.status = 'menunggu') DESC, u.diusulkan DESC
    LIMIT 200`);
}));

app.post("/api/limit-usulan", wrap(async (req, res) => {
  const { pelanggan, limit, termin, alasan } = req.body || {};
  const baru = Number(limit);
  if (!Number.isFinite(baru) || baru < 0)
    return res.status(400).json({ error: "Limit kredit harus angka nol atau lebih." });
  // Termin = TOP, jumlah HARI jatuh tempo, jadi harus bulat. Pecahan hari tidak
  // punya arti di faktur dan akan membuat perhitungan umur piutang meleset.
  const terminBaru = Number(termin);
  if (!Number.isInteger(terminBaru) || terminBaru < 0)
    return res.status(400).json({ error: "Termin harus bilangan bulat nol hari atau lebih." });

  const [c] = await sql`SELECT limit_kredit, termin FROM pelanggan WHERE id = ${pelanggan}`;
  if (!c) return res.status(404).json({ error: "Pelanggan tidak ditemukan." });
  // Cukup salah satu yang berubah. Usulan yang tidak mengubah apa pun ditolak
  // supaya tidak ada baris yang meminta admin memutuskan hal yang nihil.
  if (Number(c.limit_kredit) === baru && Number(c.termin) === terminBaru)
    return res.status(400).json({ error: "Limit dan termin sama dengan yang berlaku sekarang." });

  const [menunggu] = await sql`
    SELECT 1 FROM limit_usulan WHERE pelanggan = ${pelanggan} AND status = 'menunggu'`;
  if (menunggu)
    return res.status(409).json({ error: "Masih ada usulan yang menunggu keputusan untuk pelanggan ini." });

  const [{ maks }] = await sql`
    SELECT COALESCE(MAX(SUBSTRING(id FROM 3)::int), 0) AS maks
    FROM limit_usulan WHERE id ~ '^UL[0-9]+$'`;
  const [row] = await sql`
    INSERT INTO limit_usulan (id, pelanggan, limit_lama, limit_baru, termin_lama, termin_baru,
                              alasan, pengusul, pengusul_nama)
    VALUES (${"UL" + (Number(maks) + 1)}, ${pelanggan}, ${Number(c.limit_kredit)}, ${baru},
            ${Number(c.termin)}, ${terminBaru},
            ${String(alasan || "").trim()}, ${req.user.id}, ${req.user.username})
    RETURNING *`;
  res.status(201).json(row);
}));

app.post("/api/limit-usulan/:id/putusan", requireRole("admin"), wrap(async (req, res) => {
  const { putusan, catatan } = req.body || {};
  if (putusan !== "disetujui" && putusan !== "ditolak")
    return res.status(400).json({ error: "Putusan harus 'disetujui' atau 'ditolak'." });

  const [u] = await sql`SELECT * FROM limit_usulan WHERE id = ${req.params.id}`;
  if (!u) return res.status(404).json({ error: "Usulan tidak ditemukan." });
  if (u.status !== "menunggu")
    return res.status(400).json({ error: "Usulan ini sudah diputuskan." });

  // Syarat status='menunggu' diulang di UPDATE, bukan hanya diperiksa di atas:
  // dua admin yang menekan tombol bersamaan tidak boleh sama-sama berhasil.
  const tandai = () => sql`
    UPDATE limit_usulan
    SET status = ${putusan}, penentu = ${req.user.id}, penentu_nama = ${req.user.username},
        diputuskan = now(), catatan = ${String(catatan || "").trim()}
    WHERE id = ${u.id} AND status = 'menunggu'
    RETURNING *`;

  if (putusan === "ditolak") {
    const [row] = await tandai();
    if (!row) return res.status(409).json({ error: "Usulan ini baru saja diputuskan pengguna lain." });
    return res.json(row);
  }

  // Limit diambil dari baris usulan yang BARU saja ditandai oleh admin ini,
  // bukan dari hasil baca di atas: kalau admin lain menang balapan, UPDATE
  // pertama tidak kena baris apa pun dan syarat penentu di sini juga tidak
  // terpenuhi — limit pelanggan tidak ikut berubah.
  const [[row]] = await sql.transaction([
    tandai(),
    sql`
      UPDATE pelanggan p
      SET limit_kredit = u.limit_baru,
          -- COALESCE: usulan lama dibuat sebelum termin ikut diusulkan dan
          -- menyimpan NULL. Menyetujuinya tidak boleh menghapus termin berjalan.
          termin = COALESCE(u.termin_baru, p.termin)
      FROM limit_usulan u
      WHERE u.id = ${u.id} AND u.status = 'disetujui' AND u.penentu = ${req.user.id}
        AND p.id = u.pelanggan`,
  ]);
  if (!row) return res.status(409).json({ error: "Usulan ini baru saja diputuskan pengguna lain." });
  res.json(row);
}));

// ---------- usulan hapus (diajukan siapa pun, dieksekusi admin) ----------
// Menghapus penjualan/pembelian membuang juga mutasi stoknya, jadi satu klik
// yang salah menggeser saldo gudang tanpa meninggalkan jejak. Penghapusan
// langsung karena itu hanya untuk admin; peran lain mengajukannya lebih dulu.

// Keterangan sasaran dibaca DI SERVER, bukan diterima dari klien: yang disalin
// ke baris usulan adalah satu-satunya keterangan yang tersisa setelah datanya
// hilang, jadi tidak boleh berasal dari pihak yang meminta penghapusan.
const SASARAN = {
  penjualan: {
    baca: (id) => sql`
      SELECT p.no, p.tgl, COALESCE(c.nama, '-') AS pihak,
             (SELECT COALESCE(SUM(i.qty * i.harga), 0) FROM penjualan_item i WHERE i.penjualan = p.id) AS nilai
      FROM penjualan p LEFT JOIN pelanggan c ON c.id = p.pelanggan WHERE p.id = ${id}`,
    ket: (r) => `${String(r.tgl).slice(0, 10)} · ${r.pihak}`,
  },
  pembelian: {
    baca: (id) => sql`
      SELECT p.no, p.tgl, COALESCE(s.nama, '-') AS pihak,
             (SELECT COALESCE(SUM(i.qty * i.harga), 0) FROM pembelian_item i WHERE i.pembelian = p.id) AS nilai
      FROM pembelian p LEFT JOIN pemasok s ON s.id = p.pemasok WHERE p.id = ${id}`,
    ket: (r) => `${String(r.tgl).slice(0, 10)} · ${r.pihak}`,
  },
  pelanggan: {
    baca: (id) => sql`SELECT kode AS no, nama, kota, 0 AS nilai FROM pelanggan WHERE id = ${id}`,
    ket: (r) => [r.nama, r.kota].filter(Boolean).join(" · "),
    // Diperiksa saat usulan dibuat DAN saat disetujui: penjualan bisa masuk di
    // antara keduanya, dan usulan yang tak mungkin disetujui hanya menambah
    // baris yang harus ditolak seseorang.
    halangan: async (id) => {
      const [ada] = await sql`SELECT 1 FROM penjualan WHERE pelanggan = ${id} LIMIT 1`;
      return ada ? "Tidak bisa dihapus: pelanggan masih punya transaksi penjualan." : null;
    },
  },
};

app.get("/api/hapus-usulan", wrap(async (_req, res) => {
  res.json(await sql`
    SELECT * FROM hapus_usulan
    ORDER BY (status = 'menunggu') DESC, diusulkan DESC
    LIMIT 200`);
}));

app.post("/api/hapus-usulan", wrap(async (req, res) => {
  const { jenis, sasaran, alasan } = req.body || {};
  const def = SASARAN[jenis];
  if (!def) return res.status(400).json({ error: "Jenis data tidak dikenal." });
  const id = String(sasaran || "");
  const [row] = await def.baca(id);
  if (!row) return res.status(404).json({ error: "Data yang diminta tidak ditemukan." });
  const halangan = def.halangan ? await def.halangan(id) : null;
  if (halangan) return res.status(400).json({ error: halangan });

  const [menunggu] = await sql`
    SELECT 1 FROM hapus_usulan WHERE jenis = ${jenis} AND sasaran = ${id} AND status = 'menunggu'`;
  if (menunggu)
    return res.status(409).json({ error: "Sudah ada permintaan hapus yang menunggu keputusan untuk data ini." });

  const [{ maks }] = await sql`
    SELECT COALESCE(MAX(SUBSTRING(id FROM 3)::int), 0) AS maks
    FROM hapus_usulan WHERE id ~ '^UH[0-9]+$'`;
  const [u] = await sql`
    INSERT INTO hapus_usulan (id, jenis, sasaran, sasaran_no, sasaran_ket, nilai, alasan, pengusul, pengusul_nama)
    VALUES (${"UH" + (Number(maks) + 1)}, ${jenis}, ${id}, ${row.no}, ${def.ket(row)}, ${Number(row.nilai) || 0},
            ${String(alasan || "").trim()}, ${req.user.id}, ${req.user.username})
    RETURNING *`;
  res.status(201).json(u);
}));

/* Urutan statement sengaja terbalik dari usulan limit: penghapusan dijalankan
   LEBIH DULU, dan penandaan "disetujui" digantungkan pada hilangnya baris
   sasaran. Usulan karena itu tidak akan pernah tercatat disetujui kalau
   penghapusannya ternyata terhalang — persetujuan yang berbohong tentang apa
   yang terjadi lebih buruk daripada kegagalan yang terlihat. Syarat
   status='menunggu' tetap diulang di UPDATE supaya dua admin yang menekan
   tombol bersamaan hanya satu yang berhasil. */
const eksekusiHapus = (u, penentu, nama, catatan) => {
  if (u.jenis === "penjualan")
    return [
      sql`DELETE FROM stok_mutasi WHERE ref = ${u.sasaran_no}`,
      sql`DELETE FROM penjualan_item WHERE penjualan = ${u.sasaran}`,
      sql`DELETE FROM penjualan WHERE id = ${u.sasaran}`,
      sql`
        UPDATE hapus_usulan
        SET status = 'disetujui', penentu = ${penentu}, penentu_nama = ${nama},
            diputuskan = now(), catatan = ${catatan}
        WHERE id = ${u.id} AND status = 'menunggu'
          AND NOT EXISTS (SELECT 1 FROM penjualan WHERE id = ${u.sasaran})
        RETURNING *`,
    ];
  if (u.jenis === "pembelian")
    return [
      sql`DELETE FROM stok_mutasi WHERE ref = ${u.sasaran_no}`,
      sql`DELETE FROM pembelian_item WHERE pembelian = ${u.sasaran}`,
      sql`DELETE FROM pembelian WHERE id = ${u.sasaran}`,
      sql`
        UPDATE hapus_usulan
        SET status = 'disetujui', penentu = ${penentu}, penentu_nama = ${nama},
            diputuskan = now(), catatan = ${catatan}
        WHERE id = ${u.id} AND status = 'menunggu'
          AND NOT EXISTS (SELECT 1 FROM pembelian WHERE id = ${u.sasaran})
        RETURNING *`,
    ];
  return [
    sql`
      DELETE FROM pelanggan WHERE id = ${u.sasaran}
        AND NOT EXISTS (SELECT 1 FROM penjualan WHERE pelanggan = ${u.sasaran})`,
    sql`
      UPDATE hapus_usulan
      SET status = 'disetujui', penentu = ${penentu}, penentu_nama = ${nama},
          diputuskan = now(), catatan = ${catatan}
      WHERE id = ${u.id} AND status = 'menunggu'
        AND NOT EXISTS (SELECT 1 FROM pelanggan WHERE id = ${u.sasaran})
      RETURNING *`,
  ];
};

app.post("/api/hapus-usulan/:id/putusan", requireRole("admin"), wrap(async (req, res) => {
  const { putusan, catatan } = req.body || {};
  if (putusan !== "disetujui" && putusan !== "ditolak")
    return res.status(400).json({ error: "Putusan harus 'disetujui' atau 'ditolak'." });

  const [u] = await sql`SELECT * FROM hapus_usulan WHERE id = ${req.params.id}`;
  if (!u) return res.status(404).json({ error: "Permintaan hapus tidak ditemukan." });
  if (u.status !== "menunggu")
    return res.status(400).json({ error: "Permintaan ini sudah diputuskan." });
  const ket = String(catatan || "").trim();

  if (putusan === "ditolak") {
    const [row] = await sql`
      UPDATE hapus_usulan
      SET status = 'ditolak', penentu = ${req.user.id}, penentu_nama = ${req.user.username},
          diputuskan = now(), catatan = ${ket}
      WHERE id = ${u.id} AND status = 'menunggu'
      RETURNING *`;
    if (!row) return res.status(409).json({ error: "Permintaan ini baru saja diputuskan pengguna lain." });
    return res.json(row);
  }

  const hasil = await sql.transaction(eksekusiHapus(u, req.user.id, req.user.username, ket));
  const [row] = hasil[hasil.length - 1];
  if (!row)
    return res.status(409).json({
      error: "Penghapusan tidak jadi dijalankan — datanya sudah berubah atau baru saja diputuskan pengguna lain.",
    });
  res.json(row);
}));

app.get("/api/pemasok", wrap(async (_req, res) => {
  res.json(await sql`SELECT * FROM pemasok ORDER BY kode`);
}));

// ---------- stok (dihitung dari view) ----------
app.get("/api/stok", wrap(async (_req, res) => {
  res.json(await sql`SELECT * FROM v_stok`);
}));

app.get("/api/stok/total", wrap(async (_req, res) => {
  res.json(await sql`SELECT * FROM v_stok_total`);
}));

app.get("/api/mutasi", wrap(async (_req, res) => {
  res.json(await mutasiTerbaru());
}));

// transfer antar gudang → dua baris mutasi (keluar + masuk)
app.post("/api/mutasi/transfer", wrap(async (req, res) => {
  const { dari, ke, produk, qty, catatan } = req.body;
  if (dari === ke) return res.status(400).json({ error: "Gudang asal dan tujuan sama." });
  const q = Number(qty);
  if (!(q > 0)) return res.status(400).json({ error: "Qty tidak valid." });

  const [{ stok }] = await sql`
    SELECT COALESCE(SUM(qty),0) AS stok FROM stok_mutasi
    WHERE gudang = ${dari} AND produk = ${produk}`;
  if (Number(stok) < q) return res.status(400).json({ error: `Stok tidak cukup (${stok}).` });

  // Dua baris (keluar + masuk) dalam SATU transaksi — tidak mungkin tersisa
  // hanya baris keluar bila baris masuk gagal.
  await sql.transaction([
    sql`INSERT INTO stok_mutasi (gudang, produk, tipe, qty, ref, catatan)
        VALUES (${dari}, ${produk}, 'transfer', ${-q}, 'TRF', ${catatan || "Keluar transfer"})`,
    sql`INSERT INTO stok_mutasi (gudang, produk, tipe, qty, ref, catatan)
        VALUES (${ke}, ${produk}, 'transfer', ${q}, 'TRF', ${catatan || "Masuk transfer"})`,
  ]);
  res.status(201).json({ ok: true });
}));

// penyesuaian (stok opname) → satu baris selisih
app.post("/api/mutasi/penyesuaian", wrap(async (req, res) => {
  const { gudang, produk, fisik, catatan } = req.body;
  const [{ stok }] = await sql`
    SELECT COALESCE(SUM(qty),0) AS stok FROM stok_mutasi
    WHERE gudang = ${gudang} AND produk = ${produk}`;
  const selisih = Number(fisik) - Number(stok);
  if (selisih === 0) return res.status(400).json({ error: "Tidak ada selisih." });
  const [row] = await sql`
    INSERT INTO stok_mutasi (gudang, produk, tipe, qty, ref, catatan)
    VALUES (${gudang}, ${produk}, 'penyesuaian', ${selisih}, 'ADJ', ${catatan || "Hasil stok opname"})
    RETURNING *`;
  res.status(201).json(row);
}));

// ---------- saldo awal (기초재고) ----------
// Stok pembukaan dicatat sebagai baris buku mutasi biasa dengan ref 'AWAL'.
// Dua akibat yang memang diinginkan:
//   1. v_stok tetap satu-satunya definisi stok — saldo awal ikut dijumlahkan,
//      jadi masuk/keluar sesudahnya menumpuk di atasnya tanpa kode tambahan.
//   2. Tidak perlu mengubah CHECK tipe di stok_mutasi (butuh migrasi), cukup
//      memakai 'penyesuaian' dengan ref 'AWAL' sebagai penanda.
// Satu baris AWAL per (gudang, produk): menyimpan ulang MENGGANTI angkanya,
// tidak menambah. Jadi input yang diulang tidak pernah menggandakan stok.
const REF_AWAL = "AWAL";

app.get("/api/mutasi/saldo-awal", wrap(async (req, res) => {
  const { gudang } = req.query;
  if (!gudang) return res.status(400).json({ error: "Gudang wajib diisi." });
  const rows = await sql`
    SELECT produk, SUM(qty) AS qty, MIN(tgl) AS tgl
    FROM stok_mutasi
    WHERE ref = ${REF_AWAL} AND gudang = ${gudang}
    GROUP BY produk`;
  res.json(rows);
}));

app.post("/api/mutasi/saldo-awal", requireRole("manager"), wrap(async (req, res) => {
  const { gudang, tgl, items, catatan } = req.body;
  if (!gudang) return res.status(400).json({ error: "Gudang wajib diisi." });
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "Tidak ada barang yang diisi." });
  if (items.length > 500)
    return res.status(400).json({ error: "Maksimal 500 barang per pengiriman." });

  const [g] = await sql`SELECT id FROM gudang WHERE id = ${gudang}`;
  if (!g) return res.status(404).json({ error: "Gudang tidak ditemukan." });

  const ids = [], qtys = [];
  for (const it of items) {
    const q = Number(it?.qty);
    if (!it?.produk) return res.status(400).json({ error: "Barang tidak dikenal." });
    // Negatif diizinkan dengan sengaja. Transaksi keluar sudah tercatat lebih
    // dulu tanpa saldo pembukaan, sehingga stok berjalan bisa jadi minus; saldo
    // awal adalah satu-satunya baris yang bisa mengangkatnya kembali ke nol.
    // Arah sebaliknya juga perlu: menolkan stok yang terlanjur positif.
    if (!Number.isFinite(q))
      return res.status(400).json({ error: "Saldo awal harus berupa angka." });
    if (ids.includes(it.produk))
      return res.status(400).json({ error: `Barang ${it.produk} muncul dua kali.` });
    ids.push(it.produk);
    qtys.push(String(q));
  }
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM produk WHERE id = ANY(${ids}::text[])`;
  if (n !== ids.length) return res.status(400).json({ error: "Ada barang yang tidak dikenal." });

  // Ganti-bukan-tambah: baris AWAL lama untuk produk-produk ini dihapus lebih
  // dulu, lalu ditulis ulang. Qty 0 berarti "tidak ada saldo awal" — barisnya
  // memang tidak ditulis (WHERE q <> 0) supaya buku mutasi tidak penuh nol.
  const [, ditulis] = await sql.transaction([
    sql`DELETE FROM stok_mutasi
        WHERE ref = ${REF_AWAL} AND gudang = ${gudang} AND produk = ANY(${ids}::text[])`,
    sql`INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
        SELECT COALESCE(${tgl || null}::date, wib_today()), ${gudang}, t.p, 'penyesuaian',
               t.q, ${REF_AWAL}, ${String(catatan || "").trim() || "Saldo awal"}
        FROM unnest(${ids}::text[], ${qtys}::numeric[]) AS t(p, q)
        WHERE t.q <> 0
        RETURNING id`,
  ]);
  res.status(201).json({ ok: true, ditulis: ditulis.length, dihapus: ids.length });
}));

// ---------- alur status (harus sama dengan SO_FLOW / PO_FLOW di App.jsx) ----------
const SO_FLOW = ["penawaran", "pesanan", "kirim", "tagihan", "lunas"];

/* Masa stabilisasi sistem: sampai akhir September 2026 dokumen-dokumen lama
   masih dimasukkan menyusul, jadi tanggal kirim BOLEH mendahului tanggal
   dokumen. Sesudah tanggal itu pencatatan berjalan seiring hari, dan tanggal
   kirim yang lebih tua dari dokumennya hampir pasti salah ketik.

   Perbandingannya dikerjakan Postgres, sama seperti aturan bulan berjalan:
   satu jam saja yang dipercaya, jam Jakarta milik server. */
const AKHIR_MASA_STABILISASI = "2026-09-30";

async function tolakTglKirim(tglKirim, tglDok) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglKirim)) return "Tanggal kirim tidak valid.";
  const [{ ok }] = await sql`
    SELECT ${tglKirim}::date >= ${tglDok}::date
        OR wib_today() <= ${AKHIR_MASA_STABILISASI}::date AS ok`;
  return ok ? null : `Tanggal kirim tidak boleh mendahului tanggal dokumen (${tglDok}).`;
}
const PO_FLOW = ["order", "diterima", "lunas"];
// Mengembalikan pesan error bila perpindahan tidak sah, atau null bila sah.
//
// Maju selalu satu langkah — mencegah lompat status lewat API (mis. langsung
// 'lunas') dan mencegah pengiriman saat stok kurang.
//
// Mundur juga satu langkah, tapi hanya di atas `batas`: langkah yang
// menggerakkan stok (SO 'kirim', PO 'diterima'). Ini untuk membetulkan salah
// tandai pembayaran (lunas → tagihan). Mundur melewati batas dilarang karena
// mutasi stok yang sudah dibuat trigger tidak ikut dibatalkan — pembatalan
// pengiriman dilakukan dengan menghapus transaksinya.
const pindahStatus = (flow, batas, sekarang, tujuan) => {
  const i = flow.indexOf(sekarang), j = flow.indexOf(tujuan);
  if (j < 0) return `Status "${tujuan}" tidak dikenal.`;
  if (i < 0) return `Status saat ini tidak dikenal.`;
  if (j === i + 1) return null;
  if (j === i - 1 && j >= flow.indexOf(batas)) return null;
  return `Status hanya boleh maju satu langkah, atau mundur satu langkah setelah "${batas}".`;
};

// ---------- penjualan ----------
app.get("/api/penjualan", wrap(async (_req, res) => {
  const [head, items] = await Promise.all([
    sql`SELECT * FROM v_penjualan ORDER BY tgl DESC, no DESC`,
    sql`SELECT * FROM penjualan_item`,
  ]);
  res.json(gabungItem(head, items, "penjualan"));
}));

app.post("/api/penjualan", wrap(async (req, res) => {
  const s = req.body;
  if (!Array.isArray(s.items) || !s.items.length)
    return res.status(400).json({ error: "Minimal satu baris barang." });
  // Header + semua item dalam satu transaksi & satu perjalanan HTTP ke Neon:
  // tidak ada SO tanpa item bila salah satu insert gagal.
  const [[row]] = await sql.transaction([
    sql`INSERT INTO penjualan (id, no, tgl, pelanggan, gudang, status, dibuat_oleh)
        VALUES (${s.id}, ${s.no}, ${s.tgl}, ${s.pelanggan}, ${s.gudang}, 'penawaran', ${req.user.id})
        RETURNING *`,
    ...s.items.map((it) => sql`
        INSERT INTO penjualan_item (penjualan, produk, qty, harga)
        VALUES (${s.id}, ${it.produk}, ${it.qty}, ${it.harga})`),
  ]);
  res.status(201).json(row);
}));

/* "Dokumen bulan berjalan boleh diperbaiki sendiri."

   Aturannya: admin bebas; selain itu hanya PEMBUAT dokumen, dan hanya selama
   tanggal dokumen masih di bulan berjalan. Dokumen bulan lalu tetap lewat
   usulan penghapusan seperti sebelumnya. Baris hasil import historis tidak
   punya dibuat_oleh, jadi otomatis jatuh ke admin saja.

   Perbandingan bulannya dikerjakan Postgres, bukan Node: kalau server dan
   klien masing-masing punya "bulan berjalan" sendiri, tombolnya bisa muncul
   di hari yang servernya sudah menolak. Satu jam saja yang dipercaya. */
async function tolakUbahSO(user, so) {
  if (user.peran === "admin") return null;
  if (!so.dibuat_oleh)
    return "Dokumen lama tanpa pembuat — hanya admin yang bisa mengubah atau menghapusnya.";
  if (so.dibuat_oleh !== user.id)
    return "Hanya pembuat dokumen ini yang bisa mengubah atau menghapusnya.";
  const [{ ok }] = await sql`
    SELECT date_trunc('month', ${so.tgl}::date) = date_trunc('month', wib_today()) AS ok`;
  if (!ok) return "Dokumen di luar bulan berjalan — ubah/hapus harus lewat persetujuan admin.";
  return null;
}

/* Ubah isi SO. Nomor TIDAK ikut berubah: ia kunci yang menautkan buku mutasi
   (stok_mutasi.ref). Status dan tanggal kirim SEKARANG ikut — tombol maju/
   mundur hanya bisa melangkah satu per satu, sedangkan yang perlu dibetulkan
   biasanya dokumen yang sudah terlanjur salah beberapa langkah.

   Trigger t_penjualan_kirim hanya menyala saat status BERPINDAH, jadi pada
   penyuntingan biasa ia diam saja dan mutasi lamanya akan menggantung dengan
   qty/gudang yang sudah tidak cocok. Karena itu mutasinya disusun ulang di
   sini — tapi HANYA bila dokumen ini memang sudah punya jejak mutasi, atau
   baru sekarang dinyatakan terkirim. Kalau bukunya pernah dikosongkan dengan
   sengaja, penyuntingan tidak boleh menghidupkannya kembali satu per satu.

   Stok sengaja TIDAK diperiksa di sini (berbeda dari perpindahan ke 'kirim'):
   pemeriksaan itu perlu mengembalikan dulu qty yang dipesan dokumen ini
   sendiri, dan kalau bukunya tidak dipelihara, setiap koreksi bulan berjalan
   akan tertolak justru saat paling dibutuhkan. */
app.put("/api/penjualan/:id", wrap(async (req, res) => {
  const [so] = await sql`SELECT * FROM penjualan WHERE id = ${req.params.id}`;
  if (!so) return res.status(404).json({ error: "Data penjualan tidak ditemukan." });
  const tolak = await tolakUbahSO(req.user, so);
  if (tolak) return res.status(403).json({ error: tolak });

  const s = req.body || {};
  if (!Array.isArray(s.items) || !s.items.length)
    return res.status(400).json({ error: "Minimal satu baris barang." });

  const tgl = s.tgl || so.tgl;
  const pelanggan = s.pelanggan || so.pelanggan;
  const gudang = s.gudang || so.gudang;

  // Tanggal baru harus tetap di bulan berjalan. Tanpa ini satu penyuntingan
  // bisa memindahkan dokumen ke bulan lalu — keluar dari jangkauan aturan ini
  // sekaligus keluar dari angka bulan yang mungkin sudah dilaporkan.
  if (req.user.peran !== "admin") {
    const [{ ok }] = await sql`
      SELECT date_trunc('month', ${tgl}::date) = date_trunc('month', wib_today()) AS ok`;
    if (!ok) return res.status(400).json({ error: "Tanggal harus tetap di dalam bulan berjalan." });
  }

  /* Status & tanggal kirim ikut bisa diperbaiki dari sini. Tombol maju/mundur
     hanya melangkah satu per satu; yang dibetulkan lewat form justru dokumen
     yang sudah terlanjur salah beberapa langkah, mis. dikirim padahal belum,
     atau dikirim pada tanggal yang keliru. */
  const status = s.status || so.status;
  if (!SO_FLOW.includes(status))
    return res.status(400).json({ error: `Status "${status}" tidak dikenal.` });

  const dikirim = SO_FLOW.indexOf(status) >= SO_FLOW.indexOf("kirim");
  let tglKirim = null;
  if (dikirim) {
    // Dokumen yang sudah dikirim selalu punya tanggal kirim: pilihan orang,
    // lalu tanggal yang sudah tercatat, lalu tanggal dokumen sebagai dasar
    // terakhir — bukan hari ini, karena ini perbaikan dokumen lama.
    tglKirim = String(s.tgl_kirim || so.tgl_kirim || tgl);
    const salahTgl = await tolakTglKirim(tglKirim, tgl);
    if (salahTgl) return res.status(400).json({ error: salahTgl });
  }

  const [jejak] = await sql`
    SELECT catatan FROM stok_mutasi WHERE ref = ${so.no} AND tipe = 'keluar' ORDER BY id LIMIT 1`;

  /* Dokumen yang BARU sekarang dinyatakan terkirim menulis mutasinya seperti
     tombol kirim. Yang sejak dulu berstatus 'kirim' tapi bukunya kosong tetap
     kosong: buku mutasi pernah dikosongkan dengan sengaja (lihat
     migrations/2026-09-15-reset-stok-pembelian), dan penyuntingan biasa tidak
     boleh menghidupkannya kembali satu dokumen demi satu dokumen. */
  const naikKeKirim = dikirim && SO_FLOW.indexOf(so.status) < SO_FLOW.indexOf("kirim");
  const tulisMutasi = dikirim && (jejak || naikKeKirim);

  /* Satu transaksi: header, item, lalu mutasi. Urutannya bukan selera:
     - INSERT ... SELECT mutasi membaca penjualan_item yang baru ditulis;
     - DELETE mutasi harus SESUDAH UPDATE header, karena UPDATE itulah yang
       membangunkan trigger t_penjualan_kirim bila status baru menjadi
       'kirim'. Baris buatan trigger ikut terhapus, lalu ditulis ulang di
       sini dengan tanggal kirim yang benar.
     Status yang mundur ke bawah 'kirim' berhenti pada DELETE: dokumen yang
     belum jadi dikirim tidak boleh meninggalkan mutasi apa pun. */
  const perintah = [
    sql`UPDATE penjualan
        SET tgl = ${tgl}, pelanggan = ${pelanggan}, gudang = ${gudang},
            status = ${status}, tgl_kirim = ${tglKirim}
        WHERE id = ${so.id}`,
    sql`DELETE FROM penjualan_item WHERE penjualan = ${so.id}`,
    ...s.items.map((it) => sql`
        INSERT INTO penjualan_item (penjualan, produk, qty, harga)
        VALUES (${so.id}, ${it.produk}, ${it.qty}, ${it.harga})`),
    sql`DELETE FROM stok_mutasi WHERE ref = ${so.no} AND tipe = 'keluar'`,
  ];
  if (tulisMutasi) {
    perintah.push(sql`
        INSERT INTO stok_mutasi (tgl, gudang, produk, tipe, qty, ref, catatan)
        SELECT ${tglKirim}, ${gudang}, i.produk, 'keluar', -i.qty, ${so.no}, ${jejak?.catatan || "Pengiriman penjualan"}
        FROM penjualan_item i WHERE i.penjualan = ${so.id}`);
  }
  await sql.transaction(perintah);

  const [row] = await sql`SELECT * FROM v_penjualan WHERE id = ${so.id}`;
  const items = await sql`SELECT * FROM penjualan_item WHERE penjualan = ${so.id}`;
  res.json({ ...row, items });
}));

// pindah status (trigger DB otomatis membuat mutasi keluar saat 'kirim').
app.patch("/api/penjualan/:id/status", wrap(async (req, res) => {
  const [so] = await sql`SELECT * FROM penjualan WHERE id = ${req.params.id}`;
  if (!so) return res.status(404).json({ error: "Data penjualan tidak ditemukan." });

  /* Batas mundur untuk penjualan adalah 'pesanan', bukan 'kirim': salah tekan
     tombol kirim dulu hanya bisa dibetulkan dengan menghapus dokumennya.
     Mundur dari 'kirim' aman karena mutasi yang dibuat trigger ikut dihapus
     di bawah — satu-satunya jejak yang ditinggalkan langkah itu. */
  const salah = pindahStatus(SO_FLOW, "pesanan", so.status, req.body.status);
  if (salah) return res.status(400).json({ error: salah });

  // Pengelolaan stok tidak dipakai lagi: status 'kirim' tidak pernah ditahan
  // oleh jumlah stok di gudang pengirim. Trigger DB tetap mencatat mutasi
  // keluar, jadi stok boleh menjadi minus.

  /* Tanggal kirim hanya berarti pada langkah 'kirim' — di situlah trigger
     membuat mutasinya, dan sesudah itu tanggalnya tidak boleh bergeser diam-
     diam oleh langkah 'tagihan'/'lunas' berikutnya. Kalau klien tidak
     mengirimkannya, DEFAULT-nya tetap hari ini (wib_today di trigger). */
  let tglKirim = null;
  if (req.body.status === "kirim" && req.body.tgl != null) {
    tglKirim = String(req.body.tgl);
    const salahTgl = await tolakTglKirim(tglKirim, so.tgl);
    if (salahTgl) return res.status(400).json({ error: salahTgl });
  }

  /* Pada langkah 'kirim' kolomnya SELALU terisi — kalau klien tidak memilih
     tanggal, hari ini (WIB) yang tercatat. Dokumen yang sudah dikirim tanpa
     tanggal kirim akan terbaca seperti data yang hilang, dan trigger pun
     memakai nilai yang sama untuk buku mutasi. */
  /* Membatalkan pengiriman: mutasi keluar milik dokumen ini dihapus dan
     tanggal kirimnya ikut dikosongkan, supaya dokumen kembali persis seperti
     sebelum tombol kirim ditekan. Keduanya dalam satu transaksi — dokumen
     yang sudah mundur tapi mutasinya tertinggal adalah stok hantu. */
  const batalKirim = so.status === "kirim" && req.body.status === "pesanan";
  if (batalKirim) {
    await sql.transaction([
      sql`DELETE FROM stok_mutasi WHERE ref = ${so.no} AND tipe = 'keluar'`,
      sql`UPDATE penjualan SET status = 'pesanan', tgl_kirim = NULL WHERE id = ${so.id}`,
    ]);
    const [row] = await sql`SELECT * FROM penjualan WHERE id = ${so.id}`;
    return res.json(row);
  }

  const [row] = req.body.status === "kirim"
    ? await sql`
        UPDATE penjualan
        SET status = ${req.body.status}, tgl_kirim = COALESCE(${tglKirim}::date, wib_today())
        WHERE id = ${req.params.id} RETURNING *`
    : await sql`
        UPDATE penjualan SET status = ${req.body.status}
        WHERE id = ${req.params.id} RETURNING *`;
  res.json(row);
}));

// ---------- pembelian ----------
app.get("/api/pembelian", wrap(async (_req, res) => {
  const [head, items] = await Promise.all([
    sql`SELECT * FROM pembelian ORDER BY tgl DESC, no DESC`,
    sql`SELECT * FROM pembelian_item`,
  ]);
  res.json(gabungItem(head, items, "pembelian"));
}));

app.post("/api/pembelian", wrap(async (req, res) => {
  const p = req.body;
  if (!Array.isArray(p.items) || !p.items.length)
    return res.status(400).json({ error: "Minimal satu baris barang." });
  const [[row]] = await sql.transaction([
    sql`INSERT INTO pembelian (id, no, tgl, pemasok, gudang, status)
        VALUES (${p.id}, ${p.no}, ${p.tgl}, ${p.pemasok}, ${p.gudang}, 'order')
        RETURNING *`,
    ...p.items.map((it) => sql`
        INSERT INTO pembelian_item (pembelian, produk, qty, harga)
        VALUES (${p.id}, ${it.produk}, ${it.qty}, ${it.harga})`),
  ]);
  res.status(201).json(row);
}));

// pindah status (trigger DB otomatis membuat mutasi masuk saat 'diterima')
app.patch("/api/pembelian/:id/status", wrap(async (req, res) => {
  const [po] = await sql`SELECT status FROM pembelian WHERE id = ${req.params.id}`;
  if (!po) return res.status(404).json({ error: "Data pembelian tidak ditemukan." });

  const salah = pindahStatus(PO_FLOW, "diterima", po.status, req.body.status);
  if (salah) return res.status(400).json({ error: salah });

  const [row] = await sql`
    UPDATE pembelian SET status = ${req.body.status}
    WHERE id = ${req.params.id} RETURNING *`;
  res.json(row);
}));

// ---------- hapus langsung (admin; penjualan juga oleh pembuatnya) ----------
// Peran lain memakai /api/hapus-usulan; lihat catatan di sana.
// Penjualan/pembelian: buang juga baris item & mutasi stok yang dibuat (ref = no).
// Penjualan adalah satu-satunya yang longgar: pembuatnya boleh menghapus
// dokumen bulan berjalan tanpa persetujuan (lihat tolakUbahSO). Sisanya —
// bulan lalu, dokumen orang lain, import lama — tetap admin atau usulan hapus.
app.delete("/api/penjualan/:id", wrap(async (req, res) => {
  const [row] = await sql`SELECT no, tgl, dibuat_oleh FROM penjualan WHERE id = ${req.params.id}`;
  if (!row) return res.status(404).json({ error: "Data penjualan tidak ditemukan." });
  const tolak = await tolakUbahSO(req.user, row);
  if (tolak) return res.status(403).json({ error: tolak });
  // Tiga DELETE dalam satu transaksi — mutasi, item, dan header hilang bersama.
  await sql.transaction([
    sql`DELETE FROM stok_mutasi WHERE ref = ${row.no}`,
    sql`DELETE FROM penjualan_item WHERE penjualan = ${req.params.id}`,
    sql`DELETE FROM penjualan WHERE id = ${req.params.id}`,
  ]);
  res.status(204).end();
}));

app.delete("/api/pembelian/:id", requireRole("admin"), wrap(async (req, res) => {
  const [row] = await sql`SELECT no FROM pembelian WHERE id = ${req.params.id}`;
  if (!row) return res.status(404).json({ error: "Data pembelian tidak ditemukan." });
  await sql.transaction([
    sql`DELETE FROM stok_mutasi WHERE ref = ${row.no}`,
    sql`DELETE FROM pembelian_item WHERE pembelian = ${req.params.id}`,
    sql`DELETE FROM pembelian WHERE id = ${req.params.id}`,
  ]);
  res.status(204).end();
}));

app.delete("/api/pelanggan/:id", requireRole("admin"), wrap(async (req, res) => {
  const [ada] = await sql`SELECT 1 FROM penjualan WHERE pelanggan = ${req.params.id} LIMIT 1`;
  if (ada) return res.status(400).json({ error: "Tidak bisa dihapus: pelanggan masih punya transaksi penjualan." });
  await sql`DELETE FROM pelanggan WHERE id = ${req.params.id}`;
  res.status(204).end();
}));

// Entry lokal: listen hanya bila dijalankan langsung (bukan saat di-import Vercel).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`VULKANISIR API → http://localhost:${PORT}`));
}

// Handler serverless (Vercel) — app Express bisa langsung jadi (req,res) handler.
export default app;
