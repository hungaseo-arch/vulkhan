// ============================================================
// VULKANISIR — Data layer (fetch → api-server.js → Neon)
// ------------------------------------------------------------
// Base URL: set VITE_API_URL untuk override, mis. saat deploy.
// Default: http://localhost:3001/api (lihat PORT di api-server.js)
// ============================================================

const BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001/api";

const num = (v) => Number(v) || 0;

// Peran pengguna aktif — dikirim sebagai header agar server bisa
// menolak aksi terlarang (mis. hapus untuk staff).
let ROLE = null;

async function j(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(ROLE ? { "x-user-role": ROLE } : {}),
    },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// Postgres NUMERIC dikembalikan sebagai string oleh driver serverless.
// Normalisasi ke number + samakan nama field dengan yang dipakai UI.
const normProduk = (p) => ({ ...p, hpp: num(p.hpp), harga: num(p.harga), min: num(p.min_stok ?? p.min) });
const normPelanggan = (c) => ({ ...c, limit: num(c.limit_kredit ?? c.limit), termin: num(c.termin), piutang: num(c.piutang) });
const normMutasi = (m) => ({ ...m, id: String(m.id), qty: num(m.qty) });
const normTrx = (t) => ({
  ...t,
  total: t.total != null ? num(t.total) : undefined,
  items: (t.items || []).map((i) => ({ produk: i.produk, qty: num(i.qty), harga: num(i.harga) })),
});

export const api = {
  base: BASE,
  setRole: (r) => { ROLE = r || null; },

  // auth & pengguna
  login: (username, sandi) => j("/login", { method: "POST", body: { username, sandi } }),
  listPengguna: () => j("/pengguna"),
  createPengguna: (u) => j("/pengguna", { method: "POST", body: u }),

  // muat semua koleksi sekaligus
  async loadAll() {
    const [gudang, produk, pelanggan, pemasok, mutasi, penjualan, pembelian] = await Promise.all([
      j("/gudang"), j("/produk"), j("/pelanggan"), j("/pemasok"),
      j("/mutasi"), j("/penjualan"), j("/pembelian"),
    ]);
    return {
      gudang,
      produk: produk.map(normProduk),
      pelanggan: pelanggan.map(normPelanggan),
      pemasok,
      mutasi: mutasi.map(normMutasi),
      penjualan: penjualan.map(normTrx),
      pembelian: pembelian.map(normTrx),
    };
  },

  // tulis
  createPelanggan: (c) => j("/pelanggan", { method: "POST", body: c }),
  transfer: (b) => j("/mutasi/transfer", { method: "POST", body: b }),
  penyesuaian: (b) => j("/mutasi/penyesuaian", { method: "POST", body: b }),
  createPenjualan: (s) => j("/penjualan", { method: "POST", body: s }),
  statusPenjualan: (id, status) => j(`/penjualan/${id}/status`, { method: "PATCH", body: { status } }),
  createPembelian: (p) => j("/pembelian", { method: "POST", body: p }),
  statusPembelian: (id, status) => j(`/pembelian/${id}/status`, { method: "PATCH", body: { status } }),

  // hapus (butuh peran manager ke atas — server memverifikasi via header)
  deletePenjualan: (id) => j(`/penjualan/${id}`, { method: "DELETE" }),
  deletePembelian: (id) => j(`/pembelian/${id}`, { method: "DELETE" }),
  deletePelanggan: (id) => j(`/pelanggan/${id}`, { method: "DELETE" }),
};
