// ============================================================
// VULKANISIR — Data layer (fetch → api-server.js → Neon)
// ------------------------------------------------------------
// Base URL: set VITE_API_URL untuk override, mis. saat deploy.
// Default: http://localhost:3001/api (lihat PORT di api-server.js)
// ============================================================

// Prod (build Vercel): default ke '/api' same-origin. Dev: server lokal :3001.
// Override dengan VITE_API_URL bila frontend & backend beda domain.
const BASE = import.meta.env?.VITE_API_URL || (import.meta.env?.PROD ? "/api" : "http://localhost:3001/api");

const num = (v) => Number(v) || 0;

// Token sesi bertanda tangan — dikirim sebagai Bearer agar server bisa
// memverifikasi peran tanpa bisa dipalsukan klien.
let TOKEN = null;

async function j(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.error || `HTTP ${res.status}`);
    err.status = res.status; // 401 dipakai UI untuk memaksa login ulang
    throw err;
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
  setToken: (t) => { TOKEN = t || null; },

  // cek koneksi sebelum login — satu-satunya endpoint tanpa sesi selain /login
  ping: () => j("/health"),

  // auth & pengguna
  login: (username, sandi) => j("/login", { method: "POST", body: { username, sandi } }),
  gantiSandi: (lama, baru) => j("/ganti-sandi", { method: "POST", body: { lama, baru } }),
  listPengguna: () => j("/pengguna"),
  createPengguna: (u) => j("/pengguna", { method: "POST", body: u }),
  updatePengguna: (id, u) => j(`/pengguna/${id}`, { method: "PUT", body: u }),
  deletePengguna: (id) => j(`/pengguna/${id}`, { method: "DELETE" }),
  resetSandi: (id) => j(`/pengguna/${id}/reset-sandi`, { method: "POST" }),

  // muat semua koleksi sekaligus — SATU permintaan ke /bootstrap
  // (sebelumnya 7 permintaan paralel = sampai 7 invokasi serverless).
  async loadAll() {
    const d = await j("/bootstrap");
    return {
      gudang: d.gudang,
      produk: d.produk.map(normProduk),
      pelanggan: d.pelanggan.map(normPelanggan),
      pemasok: d.pemasok,
      // stok resmi dari view v_stok (seluruh buku mutasi), bukan hasil jumlah
      // 500 baris mutasi terakhir yang dikirim untuk tampilan.
      stok: (d.stok || []).map((r) => ({ gudang: r.gudang, produk: r.produk, stok: num(r.stok) })),
      mutasi: d.mutasi.map(normMutasi),
      mutasiLimit: d.mutasiLimit,
      penjualan: d.penjualan.map(normTrx),
      pembelian: d.pembelian.map(normTrx),
    };
  },

  // tulis
  createPelanggan: (c) => j("/pelanggan", { method: "POST", body: c }),
  updatePelanggan: (id, c) => j(`/pelanggan/${id}`, { method: "PUT", body: c }),
  transfer: (b) => j("/mutasi/transfer", { method: "POST", body: b }),
  penyesuaian: (b) => j("/mutasi/penyesuaian", { method: "POST", body: b }),
  // saldo awal (기초재고) — baca per gudang, simpan sekaligus banyak barang
  saldoAwal: (gudang) => j(`/mutasi/saldo-awal?gudang=${encodeURIComponent(gudang)}`),
  simpanSaldoAwal: (b) => j("/mutasi/saldo-awal", { method: "POST", body: b }),
  createPenjualan: (s) => j("/penjualan", { method: "POST", body: s }),
  // ubah isi SO. Nomor & status tidak ikut dikirim: keduanya tidak boleh
  // berubah lewat jalur ini (nomor menaut buku mutasi, status punya endpoint
  // sendiri). Server menolak bila bukan admin / bukan pembuat / bukan bulan ini.
  updatePenjualan: (id, s) => j(`/penjualan/${id}`, { method: "PUT", body: s }),
  statusPenjualan: (id, status) => j(`/penjualan/${id}/status`, { method: "PATCH", body: { status } }),
  createPembelian: (p) => j("/pembelian", { method: "POST", body: p }),
  statusPembelian: (id, status) => j(`/pembelian/${id}/status`, { method: "PATCH", body: { status } }),

  // hapus langsung (server memverifikasi via token, bukan lewat UI). Admin
  // bebas; untuk penjualan, pembuat dokumen juga boleh menghapus miliknya
  // selama masih bulan berjalan. Selebihnya memakai usulan penghapusan di
  // bawah; persetujuannya yang menjalankan hapus.
  deletePenjualan: (id) => j(`/penjualan/${id}`, { method: "DELETE" }),
  deletePembelian: (id) => j(`/pembelian/${id}`, { method: "DELETE" }),
  deletePelanggan: (id) => j(`/pelanggan/${id}`, { method: "DELETE" }),

  // usulan limit kredit — diajukan siapa pun yang login, diputuskan admin
  listUsulan: () => j("/limit-usulan"),
  createUsulan: (u) => j("/limit-usulan", { method: "POST", body: u }),
  putusanUsulan: (id, putusan, catatan) =>
    j(`/limit-usulan/${id}/putusan`, { method: "POST", body: { putusan, catatan } }),

  // usulan penghapusan — diajukan siapa pun yang login, diputuskan admin.
  // Menyetujui usulan BERARTI menghapus barisnya, jadi putusanHapus mengubah data.
  listHapusUsulan: () => j("/hapus-usulan"),
  createHapusUsulan: (u) => j("/hapus-usulan", { method: "POST", body: u }),
  putusanHapusUsulan: (id, putusan, catatan) =>
    j(`/hapus-usulan/${id}/putusan`, { method: "POST", body: { putusan, catatan } }),
};
