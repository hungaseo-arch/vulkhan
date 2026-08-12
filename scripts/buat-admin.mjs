// ============================================================
// VULKANISIR — Pembuatan / reset akun (langsung ke Neon)
// ------------------------------------------------------------
// Aplikasi ini sengaja tidak punya layar pendaftaran: akun baru hanya bisa
// dibuat oleh admin lewat tab "Pengguna". Skrip ini adalah jalan keluar untuk
// masalah ayam-dan-telur — saat belum ada satu pun admin yang bisa login.
//
// Kata sandi TIDAK PERNAH ditulis di berkas mana pun. Diminta lewat prompt
// tersembunyi supaya tidak masuk riwayat shell maupun daftar proses.
//
// Pakai:
//   export DATABASE_URL="postgres://..."
//   node scripts/buat-admin.mjs --list
//   node scripts/buat-admin.mjs jhseo
//   node scripts/buat-admin.mjs budi --peran staff
//
// Lewat npm, tanda "--" wajib — tanpa itu npm menelan opsi seperti --peran:
//   npm run buat-admin -- jhseo
//
// Username yang sudah ada akan di-update (sandi diganti, peran disesuaikan),
// jadi skrip ini sekaligus berfungsi sebagai reset kata sandi.
// ============================================================

import crypto from "crypto";
import readline from "readline";
import { neon } from "@neondatabase/serverless";

const PERAN = ["admin", "manager", "staff"];

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL belum diisi.\n" +
      "Ambil connection string dari Neon (atau `vercel env pull`), lalu:\n" +
      '  DATABASE_URL="postgres://..." node scripts/buat-admin.mjs <username>',
  );
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// Sama persis dengan hashPw() di api-server.js — scrypt, salt:hash heksadesimal.
// Kalau salah satu berubah, keduanya harus diubah bersamaan.
const hashPw = (pw) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
};

// Prompt tanpa gema. rl.question() menulis label-nya lebih dulu secara sinkron,
// baru setelah itu keluaran dibungkam — jadi label tetap terlihat, isian tidak.
const tanyaRahasia = (label) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let bungkam = false;
    rl._writeToOutput = (s) => { if (!bungkam) rl.output.write(s); };
    rl.question(label, (jawab) => { rl.close(); process.stdout.write("\n"); resolve(jawab); });
    bungkam = true;
  });

const ambilOpsi = (nama, bawaan) => {
  const i = process.argv.indexOf(`--${nama}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
};

// Tabel dibuat oleh api-server.js saat pertama jalan; diulang di sini supaya
// skrip tetap bekerja pada basis data yang benar-benar masih kosong.
await sql`
  CREATE TABLE IF NOT EXISTS pengguna (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nama TEXT NOT NULL,
    peran TEXT NOT NULL CHECK (peran IN ('admin','manager','staff')),
    sandi_hash TEXT NOT NULL, dibuat TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

const daftar = async () => {
  const rows = await sql`SELECT id, username, nama, peran, dibuat FROM pengguna ORDER BY peran, username`;
  if (!rows.length) return console.log("(tabel pengguna masih kosong)");
  console.table(rows.map((r) => ({ id: r.id, username: r.username, nama: r.nama, peran: r.peran })));
};

if (process.argv.includes("--list")) {
  await daftar();
  process.exit(0);
}

const username = (process.argv[2] || "").trim();
if (!username || username.startsWith("--")) {
  console.error("Username wajib diisi.  Contoh: node scripts/buat-admin.mjs jhseo");
  process.exit(1);
}

const peran = ambilOpsi("peran", "admin");
if (!PERAN.includes(peran)) {
  console.error(`Peran "${peran}" tidak dikenal. Pilih salah satu: ${PERAN.join(" / ")}`);
  process.exit(1);
}
// Tanpa --nama, akun yang sudah ada tetap memakai namanya yang lama.
const nama = ambilOpsi("nama", null);

// Non-TTY (CI / pipe) tidak bisa menampilkan prompt — pakai variabel SANDI.
const sandi = process.stdin.isTTY
  ? await tanyaRahasia(`Kata sandi untuk "${username}" (tidak ditampilkan): `)
  : process.env.SANDI || "";

if (sandi.length < 8) {
  console.error("Kata sandi minimal 8 karakter.");
  process.exit(1);
}

// id mengikuti pola U1, U2, … yang dipakai seed bawaan.
const [{ maks }] = await sql`
  SELECT COALESCE(MAX(SUBSTRING(id FROM 2)::int), 0) AS maks
  FROM pengguna WHERE id ~ '^U[0-9]+$'`;

const [u] = await sql`
  INSERT INTO pengguna (id, username, nama, peran, sandi_hash)
  VALUES (${"U" + (Number(maks) + 1)}, ${username}, ${nama || username}, ${peran}, ${hashPw(sandi)})
  ON CONFLICT (username) DO UPDATE
    SET sandi_hash = EXCLUDED.sandi_hash,
        peran      = EXCLUDED.peran,
        nama       = COALESCE(${nama}, pengguna.nama)
  RETURNING id, username, nama, peran, dibuat`;

console.log(`\n✅ ${u.username} (${u.peran}) siap dipakai — id ${u.id}\n`);
await daftar();
