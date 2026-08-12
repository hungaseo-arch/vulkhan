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

const sql = neon(process.env.DATABASE_URL);
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
const ensureReady = () => (ready ||= ensureUsers().catch((e) => { ready = null; throw e; }));
app.use((req, res, next) => ensureReady().then(() => next()).catch(next));

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
    INSERT INTO pelanggan (id, kode, nama, pic, telp, kota, grade, limit_kredit, termin)
    VALUES (${c.id}, ${c.kode}, ${c.nama}, ${c.pic}, ${c.telp}, ${c.kota},
            ${c.grade}, ${c.limit}, ${c.termin})
    RETURNING *`;
  res.status(201).json(row);
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
  res.json(await sql`SELECT * FROM stok_mutasi ORDER BY id DESC LIMIT 500`);
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

  await sql`INSERT INTO stok_mutasi (gudang, produk, tipe, qty, ref, catatan)
            VALUES (${dari}, ${produk}, 'transfer', ${-q}, 'TRF', ${catatan || "Keluar transfer"})`;
  await sql`INSERT INTO stok_mutasi (gudang, produk, tipe, qty, ref, catatan)
            VALUES (${ke}, ${produk}, 'transfer', ${q}, 'TRF', ${catatan || "Masuk transfer"})`;
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

// ---------- alur status (harus sama dengan SO_FLOW / PO_FLOW di App.jsx) ----------
const SO_FLOW = ["penawaran", "pesanan", "kirim", "tagihan", "lunas"];
const PO_FLOW = ["order", "diterima", "lunas"];
// Mengembalikan pesan error bila perpindahan tidak sah, atau null bila sah.
const langkahBerikut = (flow, sekarang, tujuan) => {
  const i = flow.indexOf(sekarang);
  if (!flow.includes(tujuan)) return `Status "${tujuan}" tidak dikenal.`;
  if (i < 0) return `Status saat ini tidak dikenal.`;
  if (flow[i + 1] !== tujuan) return `Status hanya boleh maju satu langkah: ${sekarang} → ${flow[i + 1] || "(selesai)"}.`;
  return null;
};

// ---------- penjualan ----------
app.get("/api/penjualan", wrap(async (_req, res) => {
  const head = await sql`SELECT * FROM v_penjualan ORDER BY tgl DESC, no DESC`;
  const items = await sql`SELECT * FROM penjualan_item`;
  res.json(head.map((h) => ({ ...h, items: items.filter((i) => i.penjualan === h.id) })));
}));

app.post("/api/penjualan", wrap(async (req, res) => {
  const s = req.body;
  const [row] = await sql`
    INSERT INTO penjualan (id, no, tgl, pelanggan, gudang, status)
    VALUES (${s.id}, ${s.no}, ${s.tgl}, ${s.pelanggan}, ${s.gudang}, 'penawaran')
    RETURNING *`;
  for (const it of s.items) {
    await sql`INSERT INTO penjualan_item (penjualan, produk, qty, harga)
              VALUES (${s.id}, ${it.produk}, ${it.qty}, ${it.harga})`;
  }
  res.status(201).json(row);
}));

// pindah status (trigger DB otomatis membuat mutasi keluar saat 'kirim').
// Hanya maju satu langkah menurut alur — mencegah lompat status lewat API
// (mis. langsung 'lunas') dan mencegah pengiriman saat stok kurang.
app.patch("/api/penjualan/:id/status", wrap(async (req, res) => {
  const [so] = await sql`SELECT * FROM penjualan WHERE id = ${req.params.id}`;
  if (!so) return res.status(404).json({ error: "Data penjualan tidak ditemukan." });

  const salah = langkahBerikut(SO_FLOW, so.status, req.body.status);
  if (salah) return res.status(400).json({ error: salah });

  if (req.body.status === "kirim") {
    const baris = await sql`
      SELECT p.kode, SUM(i.qty) AS butuh, COALESCE(s.stok, 0) AS ada
      FROM penjualan_item i
      JOIN produk p ON p.id = i.produk
      LEFT JOIN v_stok s ON s.produk = i.produk AND s.gudang = ${so.gudang}
      WHERE i.penjualan = ${so.id}
      GROUP BY p.kode, s.stok`;
    const habis = baris.find((r) => Number(r.ada) < Number(r.butuh));
    if (habis)
      return res.status(400).json({
        error: `Stok ${habis.kode} tidak cukup di gudang pengirim (tersedia ${Number(habis.ada)}, dibutuhkan ${Number(habis.butuh)}).`,
      });
  }

  const [row] = await sql`
    UPDATE penjualan SET status = ${req.body.status}
    WHERE id = ${req.params.id} RETURNING *`;
  res.json(row);
}));

// ---------- pembelian ----------
app.get("/api/pembelian", wrap(async (_req, res) => {
  const head = await sql`SELECT * FROM pembelian ORDER BY tgl DESC, no DESC`;
  const items = await sql`SELECT * FROM pembelian_item`;
  res.json(head.map((h) => ({ ...h, items: items.filter((i) => i.pembelian === h.id) })));
}));

app.post("/api/pembelian", wrap(async (req, res) => {
  const p = req.body;
  const [row] = await sql`
    INSERT INTO pembelian (id, no, tgl, pemasok, gudang, status)
    VALUES (${p.id}, ${p.no}, ${p.tgl}, ${p.pemasok}, ${p.gudang}, 'order')
    RETURNING *`;
  for (const it of p.items) {
    await sql`INSERT INTO pembelian_item (pembelian, produk, qty, harga)
              VALUES (${p.id}, ${it.produk}, ${it.qty}, ${it.harga})`;
  }
  res.status(201).json(row);
}));

// pindah status (trigger DB otomatis membuat mutasi masuk saat 'diterima')
app.patch("/api/pembelian/:id/status", wrap(async (req, res) => {
  const [po] = await sql`SELECT status FROM pembelian WHERE id = ${req.params.id}`;
  if (!po) return res.status(404).json({ error: "Data pembelian tidak ditemukan." });

  const salah = langkahBerikut(PO_FLOW, po.status, req.body.status);
  if (salah) return res.status(400).json({ error: salah });

  const [row] = await sql`
    UPDATE pembelian SET status = ${req.body.status}
    WHERE id = ${req.params.id} RETURNING *`;
  res.json(row);
}));

// ---------- hapus (manager ke atas) ----------
// Penjualan/pembelian: buang juga baris item & mutasi stok yang dibuat (ref = no).
app.delete("/api/penjualan/:id", requireRole("manager"), wrap(async (req, res) => {
  const [row] = await sql`SELECT no FROM penjualan WHERE id = ${req.params.id}`;
  if (!row) return res.status(404).json({ error: "Data penjualan tidak ditemukan." });
  await sql`DELETE FROM stok_mutasi WHERE ref = ${row.no}`;
  await sql`DELETE FROM penjualan_item WHERE penjualan = ${req.params.id}`;
  await sql`DELETE FROM penjualan WHERE id = ${req.params.id}`;
  res.status(204).end();
}));

app.delete("/api/pembelian/:id", requireRole("manager"), wrap(async (req, res) => {
  const [row] = await sql`SELECT no FROM pembelian WHERE id = ${req.params.id}`;
  if (!row) return res.status(404).json({ error: "Data pembelian tidak ditemukan." });
  await sql`DELETE FROM stok_mutasi WHERE ref = ${row.no}`;
  await sql`DELETE FROM pembelian_item WHERE pembelian = ${req.params.id}`;
  await sql`DELETE FROM pembelian WHERE id = ${req.params.id}`;
  res.status(204).end();
}));

app.delete("/api/pelanggan/:id", requireRole("manager"), wrap(async (req, res) => {
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
