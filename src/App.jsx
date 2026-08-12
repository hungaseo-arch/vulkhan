import React, { useState, useMemo, useEffect, useRef, useId } from "react";
import { api } from "./api";
import { downloadXlsx } from "./xlsx";

/* ============================================================
   VULKANISIR — Sistem Manajemen Penjualan Ban Vulkanisir
   ------------------------------------------------------------
   Data layer: lihat objek `api` di bawah.
   Saat ini memakai state memori (data contoh).
   Ganti isi `api` dengan fetch() ke server Neon (api-server.js).
   ============================================================ */

/* ---------- format ---------- */
const nf = new Intl.NumberFormat("id-ID");
const fmt = (n) => nf.format(Math.round(Number(n) || 0));
const rp = (n) => "Rp " + fmt(n);
const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
const TODAY = "2026-07-23";

/* Nomor dokumen berurutan: PREFIX-YYMM-### berdasarkan nomor tertinggi yang
   sudah ada pada bulan yang sama — menghindari tabrakan nomor acak. */
const nomorBaru = (prefix, list, tgl) => {
  const awalan = `${prefix}-${String(tgl).slice(2, 4)}${String(tgl).slice(5, 7)}-`;
  const tertinggi = (list || []).reduce((m, x) => {
    const no = String(x.no || "");
    if (!no.startsWith(awalan)) return m;
    const n = Number(no.slice(awalan.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return awalan + String(tertinggi + 1).padStart(3, "0");
};

/* ---------- format dokumen ---------- */
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const tglPanjang = (s) => {
  if (!s) return "-";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};
const addDays = (s, days) => {
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/* selisih hari dari tanggal `from` ke `to` (positif bila `to` lebih belakangan) */
const diffDays = (from, to) =>
  Math.round((new Date(String(to).slice(0, 10) + "T00:00:00") - new Date(String(from).slice(0, 10) + "T00:00:00")) / 86400000);
const bulanLabel = (ym) => {
  const [y, m] = String(ym).split("-");
  return `${BULAN[Number(m) - 1]} ${y}`;
};
/* angka → kata (rupiah) */
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const w = (x) => {
    if (x < 12) return s[x];
    if (x < 20) return w(x - 10) + " belas";
    if (x < 100) return w(Math.floor(x / 10)) + " puluh" + (x % 10 ? " " + w(x % 10) : "");
    if (x < 200) return "seratus" + (x % 100 ? " " + w(x % 100) : "");
    if (x < 1000) return w(Math.floor(x / 100)) + " ratus" + (x % 100 ? " " + w(x % 100) : "");
    if (x < 2000) return "seribu" + (x % 1000 ? " " + w(x % 1000) : "");
    if (x < 1e6) return w(Math.floor(x / 1000)) + " ribu" + (x % 1000 ? " " + w(x % 1000) : "");
    if (x < 1e9) return w(Math.floor(x / 1e6)) + " juta" + (x % 1e6 ? " " + w(x % 1e6) : "");
    if (x < 1e12) return w(Math.floor(x / 1e9)) + " miliar" + (x % 1e9 ? " " + w(x % 1e9) : "");
    return w(Math.floor(x / 1e12)) + " triliun" + (x % 1e12 ? " " + w(x % 1e12) : "");
  };
  if (n === 0) return "Nol rupiah";
  const t = w(n).replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + " rupiah";
}

/* ---------- data contoh ---------- */
let GUDANG = [
  { id: "G1", kode: "KRW", nama: "Gudang Karawang", kota: "Karawang" },
  { id: "G2", kode: "SMG", nama: "Gudang Semarang", kota: "Semarang" },
  { id: "G3", kode: "SBY", nama: "Gudang Surabaya", kota: "Surabaya" },
];

const KATEGORI = {
  jadi: { id: "Ban Jadi" },
  jasa: { id: "Ban Jasa" },
  casing: { id: "Casing" },
  bahan: { id: "Bahan Baku" },
};

const SEED_PRODUK = [
  { id: "P1", kode: "VK-1020R", nama: "Vulkanisir 1000-20 Rib", ukuran: "1000-20", pola: "Rib (HR)", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 1250000, harga: 1850000, min: 20 },
  { id: "P2", kode: "VK-1020L", nama: "Vulkanisir 1000-20 Lug", ukuran: "1000-20", pola: "Lug (HL)", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 1320000, harga: 1950000, min: 20 },
  { id: "P3", kode: "VK-1120L", nama: "Vulkanisir 1100-20 Lug", ukuran: "1100-20", pola: "Lug (HL)", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 1510000, harga: 2250000, min: 15 },
  { id: "P4", kode: "VK-2958R", nama: "Vulkanisir 295/80R22.5 Rib", ukuran: "295/80R22.5", pola: "Rib", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 1620000, harga: 2400000, min: 24 },
  { id: "P5", kode: "VK-3158L", nama: "Vulkanisir 315/80R22.5 Lug", ukuran: "315/80R22.5", pola: "Lug", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 1880000, harga: 2750000, min: 24 },
  { id: "P6", kode: "VK-1200R24", nama: "Vulkanisir 1200R24 Lug", ukuran: "1200R24", pola: "Lug", grade: "A", kategori: "jadi", satuan: "pcs", hpp: 2640000, harga: 3900000, min: 8 },
  { id: "P7", kode: "VK-750B", nama: "Vulkanisir 750-16 Rib", ukuran: "750-16", pola: "Rib", grade: "B", kategori: "jadi", satuan: "pcs", hpp: 560000, harga: 850000, min: 30 },
  { id: "P8", kode: "CS-1020", nama: "Casing Bekas 1000-20", ukuran: "1000-20", pola: "-", grade: "B", kategori: "casing", satuan: "pcs", hpp: 320000, harga: 0, min: 40 },
  { id: "P9", kode: "CS-2958", nama: "Casing Bekas 295/80R22.5", ukuran: "295/80R22.5", pola: "-", grade: "A", kategori: "casing", satuan: "pcs", hpp: 480000, harga: 0, min: 30 },
  { id: "P10", kode: "BH-TAPAK", nama: "Karet Tapak / Tread Rubber", ukuran: "-", pola: "-", grade: "-", kategori: "bahan", satuan: "kg", hpp: 62000, harga: 0, min: 500 },
  { id: "P11", kode: "BH-CUSHION", nama: "Cushion Gum", ukuran: "-", pola: "-", grade: "-", kategori: "bahan", satuan: "kg", hpp: 78000, harga: 0, min: 200 },
];

const SEED_PELANGGAN = [
  { id: "C1", kode: "PLG-001", nama: "PT Sumber Karya Logistik", pic: "Bpk. Andi Prasetyo", telp: "0812-8811-4520", kota: "Jakarta Utara", grade: "A", limit: 500000000, termin: 45 },
  { id: "C2", kode: "PLG-002", nama: "CV Anugerah Trans Nusantara", pic: "Ibu Ratna Dewi", telp: "0813-9922-7310", kota: "Bekasi", grade: "B", limit: 200000000, termin: 30 },
  { id: "C3", kode: "PLG-003", nama: "PT Bumi Mineral Sejahtera", pic: "Bpk. Yusuf Hakim", telp: "0811-5540-2288", kota: "Balikpapan", grade: "A", limit: 800000000, termin: 60 },
  { id: "C4", kode: "PLG-004", nama: "PT Jaya Armada Transport", pic: "Bpk. Slamet Riyadi", telp: "0816-3311-9087", kota: "Surabaya", grade: "B", limit: 300000000, termin: 30 },
  { id: "C5", kode: "PLG-005", nama: "UD Mandiri Ban Gresik", pic: "Bpk. Hendra", telp: "0857-2200-1144", kota: "Gresik", grade: "C", limit: 100000000, termin: 14 },
];

const SEED_PEMASOK = [
  { id: "S1", kode: "PMS-001", nama: "PT Karet Nusantara Indah", pic: "Bpk. Bagus", telp: "021-5501-3300", jenis: "bahan" },
  { id: "S2", kode: "PMS-002", nama: "CV Ban Bekas Jaya Makmur", pic: "Bpk. Rudi", telp: "0812-3344-8899", jenis: "casing" },
  { id: "S3", kode: "PMS-003", nama: "PT Indo Rubber Compound", pic: "Ibu Lia", telp: "031-8820-4411", jenis: "bahan" },
];

/* mutasi awal: stok pembukaan per gudang */
const SEED_MUTASI = [];
const opening = [
  ["G1", "P1", 48], ["G1", "P2", 36], ["G1", "P4", 62], ["G1", "P5", 28], ["G1", "P8", 90], ["G1", "P10", 1200],
  ["G2", "P1", 22], ["G2", "P3", 18], ["G2", "P4", 30], ["G2", "P7", 44], ["G2", "P9", 26], ["G2", "P11", 180],
  ["G3", "P2", 14], ["G3", "P3", 26], ["G3", "P5", 33], ["G3", "P6", 17], ["G3", "P8", 52],
  ["G3", "P1", 12], ["G3", "P7", 19], ["G3", "P9", 41], ["G3", "P10", 340],
];
opening.forEach(([g, p, q], i) =>
  SEED_MUTASI.push({ id: "M" + i, tgl: "2026-07-01", gudang: g, produk: p, tipe: "masuk", qty: q, ref: "Stok pembukaan Juli", catatan: "" })
);

const SEED_PENJUALAN = [
  { id: "SO1", no: "SO-2607-001", tgl: "2026-07-08", pelanggan: "C1", gudang: "G1", status: "lunas", items: [{ produk: "P4", qty: 24, harga: 2400000 }, { produk: "P1", qty: 8, harga: 1850000 }] },
  { id: "SO2", no: "SO-2607-002", tgl: "2026-07-14", pelanggan: "C3", gudang: "G1", status: "tagihan", items: [{ produk: "P5", qty: 16, harga: 2700000 }] },
  { id: "SO3", no: "SO-2607-003", tgl: "2026-07-18", pelanggan: "C4", gudang: "G3", status: "kirim", items: [{ produk: "P3", qty: 10, harga: 2250000 }, { produk: "P5", qty: 6, harga: 2750000 }] },
  { id: "SO4", no: "SO-2607-004", tgl: "2026-07-21", pelanggan: "C2", gudang: "G2", status: "pesanan", items: [{ produk: "P7", qty: 20, harga: 850000 }] },
  { id: "SO5", no: "SO-2607-005", tgl: "2026-07-22", pelanggan: "C5", gudang: "G3", status: "penawaran", items: [{ produk: "P1", qty: 6, harga: 1880000 }] },
];
/* mutasi keluar untuk SO yang sudah dikirim */
SEED_PENJUALAN.filter((s) => ["kirim", "tagihan", "lunas"].includes(s.status)).forEach((s) =>
  s.items.forEach((it) =>
    SEED_MUTASI.push({ id: uid("M"), tgl: s.tgl, gudang: s.gudang, produk: it.produk, tipe: "keluar", qty: -it.qty, ref: s.no, catatan: "Pengiriman penjualan" })
  )
);

const SEED_PEMBELIAN = [
  { id: "PO1", no: "PO-2607-001", tgl: "2026-07-05", pemasok: "S2", gudang: "G1", status: "lunas", items: [{ produk: "P8", qty: 60, harga: 315000 }] },
  { id: "PO2", no: "PO-2607-002", tgl: "2026-07-12", pemasok: "S1", gudang: "G1", status: "diterima", items: [{ produk: "P10", qty: 800, harga: 61500 }] },
  { id: "PO3", no: "PO-2607-003", tgl: "2026-07-20", pemasok: "S3", gudang: "G3", status: "order", items: [{ produk: "P11", qty: 250, harga: 77000 }] },
];
SEED_PEMBELIAN.filter((p) => ["diterima", "lunas"].includes(p.status)).forEach((p) =>
  p.items.forEach((it) =>
    SEED_MUTASI.push({ id: uid("M"), tgl: p.tgl, gudang: p.gudang, produk: it.produk, tipe: "masuk", qty: it.qty, ref: p.no, catatan: "Penerimaan pembelian" })
  )
);

/* ---------- alur status ---------- */
const SO_FLOW = ["penawaran", "pesanan", "kirim", "tagihan", "lunas"];
const SO_LABEL = {
  penawaran: { id: "Penawaran" },
  pesanan: { id: "Pesanan" },
  kirim: { id: "Dikirim" },
  tagihan: { id: "Ditagih" },
  lunas: { id: "Lunas" },
};
const PO_FLOW = ["order", "diterima", "lunas"];
const PO_LABEL = {
  order: { id: "Dipesan" },
  diterima: { id: "Diterima" },
  lunas: { id: "Lunas" },
};

/* ---------- hak akses (RBAC 3 tingkat) ---------- */
const RANK = { staff: 1, manager: 2, admin: 3 };
const ROLE_LABEL = {
  admin:   { id: "Admin", desc: "Akses penuh" },
  manager: { id: "Manajer", desc: "+ Hapus" },
  staff:   { id: "Staf", desc: "Input & ubah" },
};

/* ============================================================ */

export default function App() {
  const [tab, setTab] = useState("dasbor");
  const [produk, setProduk] = useState(SEED_PRODUK);
  const [pelanggan, setPelanggan] = useState(SEED_PELANGGAN);
  const [pemasok, setPemasok] = useState(SEED_PEMASOK);
  const [mutasi, setMutasi] = useState(SEED_MUTASI);
  const [penjualan, setPenjualan] = useState(SEED_PENJUALAN);
  const [pembelian, setPembelian] = useState(SEED_PEMBELIAN);
  const [toast, setToast] = useState(null);
  const [conn, setConn] = useState("loading"); // "loading" | "online" | "offline"
  const online = conn === "online";

  /* ---------- sesi login ---------- */
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vk_user")) || null; } catch { return null; }
  });
  const [konfirmasi, setKonfirmasi] = useState(null); // { msg, onYes }
  const minta = (msg, onYes) => setKonfirmasi({ msg, onYes });
  const [gantiSandi, setGantiSandi] = useState(false); // modal ganti kata sandi

  useEffect(() => { api.setToken(user?.token || null); }, [user]);

  const say = (msg, bad) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3200);
  };

  /* hak akses berdasarkan peran */
  const can = (perm) => {
    if (!user) return false;
    if (perm === "delete") return RANK[user.peran] >= RANK.manager;
    if (perm === "users") return user.peran === "admin";
    return true; // input & ubah: semua peran yang login
  };

  async function doLogin(username, sandi) {
    if (!online) throw new Error("Server tidak terjangkau. Login membutuhkan koneksi.");
    return api.login(username, sandi); // lempar error bila salah
  }
  const login = (u) => {
    setUser(u);
    api.setToken(u.token);
    try { localStorage.setItem("vk_user", JSON.stringify(u)); } catch { /* noop */ }
    say(`Selamat datang, ${u.nama}.`);
  };
  const logout = () => {
    setUser(null);
    api.setToken(null);
    try { localStorage.removeItem("vk_user"); } catch { /* noop */ }
    setTab("dasbor");
  };

  /* ---------- muat data dari server (fallback ke data contoh) ---------- */
  const applyData = (d) => {
    if (d.gudang?.length) GUDANG = d.gudang;
    setProduk(d.produk);
    setPelanggan(d.pelanggan);
    setPemasok(d.pemasok);
    setMutasi(d.mutasi);
    setPenjualan(d.penjualan);
    setPembelian(d.pembelian);
  };
  const reload = async () => applyData(await api.loadAll());

  /* 1) cek koneksi saja — data tidak lagi terbuka untuk anonim */
  useEffect(() => {
    let alive = true;
    api.ping()
      .then(() => { if (alive) setConn("online"); })
      .catch(() => { if (alive) setConn("offline"); });
    return () => { alive = false; };
  }, []);

  /* 2) muat data setelah ada sesi. Sesi kedaluwarsa (401) → login ulang,
        supaya data contoh tidak tampil seolah-olah data asli. */
  useEffect(() => {
    if (!user || conn !== "online") return;
    let alive = true;
    api.loadAll()
      .then((d) => { if (alive) applyData(d); })
      .catch((e) => {
        if (!alive) return;
        if (e.status === 401) { logout(); say("Sesi berakhir. Silakan masuk kembali.", true); }
        else say(e.message, true);
      });
    return () => { alive = false; };
  }, [user, conn]); // eslint-disable-line react-hooks/exhaustive-deps

  /* stok dihitung dari buku mutasi — tidak pernah diedit langsung */
  const stok = useMemo(() => {
    const m = {};
    mutasi.forEach((x) => {
      const k = x.gudang + "|" + x.produk;
      m[k] = (m[k] || 0) + x.qty;
    });
    return m;
  }, [mutasi]);
  const getStok = (g, p) => stok[g + "|" + p] || 0;
  const stokTotal = (p) => GUDANG.reduce((s, g) => s + getStok(g.id, p), 0);

  const pById = (id) => produk.find((x) => x.id === id) || {};
  const cById = (id) => pelanggan.find((x) => x.id === id) || {};
  const gById = (id) => GUDANG.find((x) => x.id === id) || {};
  const sById = (id) => pemasok.find((x) => x.id === id) || {};
  const totalSO = (s) => s.items.reduce((a, b) => a + b.qty * b.harga, 0);

  const addMutasi = (rows) => setMutasi((m) => [...m, ...rows.map((r) => ({ id: uid("M"), ...r }))]);

  /* piutang per pelanggan: SO sudah dikirim/ditagih tapi belum lunas */
  const piutang = (cid) =>
    penjualan.filter((s) => s.pelanggan === cid && ["kirim", "tagihan"].includes(s.status)).reduce((a, s) => a + totalSO(s), 0);
  const piutangTotal = penjualan.filter((s) => ["kirim", "tagihan"].includes(s.status)).reduce((a, s) => a + totalSO(s), 0);

  /* ---------- aksi ----------
     Online  → tulis ke server, lalu muat ulang (server = sumber kebenaran).
     Offline → mutasi state di memori (perilaku demo seperti semula). */
  async function majuSO(so) {
    const i = SO_FLOW.indexOf(so.status);
    if (i >= SO_FLOW.length - 1) return;
    const next = SO_FLOW[i + 1];
    if (next === "kirim") {
      const kurang = so.items.find((it) => getStok(so.gudang, it.produk) < it.qty);
      if (kurang) {
        say(`Stok ${pById(kurang.produk).kode} di ${gById(so.gudang).nama} tidak cukup (tersedia ${getStok(so.gudang, kurang.produk)}).`, true);
        return;
      }
    }
    try {
      if (online) {
        await api.statusPenjualan(so.id, next); // trigger DB catat mutasi keluar saat 'kirim'
        await reload();
      } else {
        if (next === "kirim")
          addMutasi(so.items.map((it) => ({ tgl: TODAY, gudang: so.gudang, produk: it.produk, tipe: "keluar", qty: -it.qty, ref: so.no, catatan: "Pengiriman penjualan" })));
        setPenjualan((list) => list.map((x) => (x.id === so.id ? { ...x, status: next } : x)));
      }
      say(`${so.no} → ${SO_LABEL[next].id}`);
    } catch (e) { say(e.message, true); }
  }

  async function majuPO(po) {
    const i = PO_FLOW.indexOf(po.status);
    if (i >= PO_FLOW.length - 1) return;
    const next = PO_FLOW[i + 1];
    try {
      if (online) {
        await api.statusPembelian(po.id, next); // trigger DB catat mutasi masuk saat 'diterima'
        await reload();
      } else {
        if (next === "diterima")
          addMutasi(po.items.map((it) => ({ tgl: TODAY, gudang: po.gudang, produk: it.produk, tipe: "masuk", qty: it.qty, ref: po.no, catatan: "Penerimaan pembelian" })));
        setPembelian((list) => list.map((x) => (x.id === po.id ? { ...x, status: next } : x)));
      }
      say(`${po.no} → ${PO_LABEL[next].id}`);
    } catch (e) { say(e.message, true); }
  }

  async function doTransfer(p) {
    if (online) await api.transfer(p);
    else addMutasi([
      { tgl: TODAY, gudang: p.dari, produk: p.produk, tipe: "transfer", qty: -p.qty, ref: "TRF", catatan: "Keluar transfer" },
      { tgl: TODAY, gudang: p.ke, produk: p.produk, tipe: "transfer", qty: p.qty, ref: "TRF", catatan: "Masuk transfer" },
    ]);
    if (online) await reload();
    say("Transfer tercatat.");
  }

  async function doAdjust(p) {
    if (online) await api.penyesuaian({ gudang: p.gudang, produk: p.produk, fisik: p.fisik, catatan: p.catatan });
    else addMutasi([{ tgl: TODAY, gudang: p.gudang, produk: p.produk, tipe: "penyesuaian", qty: p.selisih, ref: "ADJ", catatan: p.catatan || "Hasil stok opname" }]);
    if (online) await reload();
    say("Penyesuaian tercatat.");
  }

  async function doCreatePenjualan(so) {
    if (online) { await api.createPenjualan(so); await reload(); }
    else setPenjualan((l) => [...l, so]);
    say(`${so.no} dibuat sebagai Penawaran.`);
  }

  async function doCreatePembelian(po) {
    if (online) { await api.createPembelian(po); await reload(); }
    else setPembelian((l) => [...l, po]);
    say(`${po.no} dibuat. Stok bertambah saat status Diterima.`);
  }

  async function doCreatePelanggan(c) {
    if (online) { await api.createPelanggan(c); await reload(); }
    else setPelanggan((l) => [...l, c]);
    say(`${c.nama} ditambahkan.`);
  }

  /* ---------- hapus (manager ke atas) ---------- */
  async function doDeletePenjualan(so) {
    if (online) { await api.deletePenjualan(so.id); await reload(); }
    else { setPenjualan((l) => l.filter((x) => x.id !== so.id)); setMutasi((m) => m.filter((x) => x.ref !== so.no)); }
    say(`${so.no} dihapus.`);
  }
  async function doDeletePembelian(po) {
    if (online) { await api.deletePembelian(po.id); await reload(); }
    else { setPembelian((l) => l.filter((x) => x.id !== po.id)); setMutasi((m) => m.filter((x) => x.ref !== po.no)); }
    say(`${po.no} dihapus.`);
  }
  async function doDeletePelanggan(c) {
    if (penjualan.some((s) => s.pelanggan === c.id))
      throw new Error("Tidak bisa dihapus: pelanggan masih punya transaksi penjualan.");
    if (online) { await api.deletePelanggan(c.id); await reload(); }
    else setPelanggan((l) => l.filter((x) => x.id !== c.id));
    say(`${c.nama} dihapus.`);
  }

  const ctx = {
    produk, pelanggan, pemasok, mutasi, penjualan, pembelian,
    getStok, stokTotal, pById, cById, gById, sById, totalSO,
    piutang, piutangTotal, majuSO, majuPO, say, online,
    doTransfer, doAdjust, doCreatePenjualan, doCreatePembelian, doCreatePelanggan,
    user, can, minta, doDeletePenjualan, doDeletePembelian, doDeletePelanggan,
  };

  const TABS = [
    ["stok", "Stok Gudang"],
    ["jual", "Penjualan"],
    ["beli", "Pembelian"],
    ["mitra", "Pelanggan"],
    ["piutang", "Piutang"],
    ...(can("users") ? [["admin", "Pengguna"]] : []),
  ];

  /* ---------- gerbang: loading & login ---------- */
  if (conn === "loading")
    return <div className="vk"><Style /><div className="login"><div className="splash">Menyambung…</div></div></div>;
  if (!user)
    return <Login doLogin={doLogin} onOk={login} say={say} toast={toast} />;

  return (
    <div className="vk">
      <Style />
      <header className="hd">
        <div className="hd-in">
          <button type="button" className="brand" title="Beranda" onClick={() => setTab("dasbor")}>
            <TreadMark />
            <div>
              <h1>VULKHAN</h1>
            </div>
          </button>
          <div className="hd-meta">
            <div className="who">
              <span className="wu">
                <button className="wu-name" title="Ganti kata sandi" onClick={() => setGantiSandi(true)}>{user.nama}</button>
                <span className={"role r-" + user.peran}>{ROLE_LABEL[user.peran].id}</span>
              </span>
              <button className="lo" onClick={logout}>Keluar</button>
            </div>
          </div>
        </div>
        <div className="hazard" />
        <nav className="tabs">
          {TABS.map(([k, a]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
              {a}
            </button>
          ))}
        </nav>
      </header>

      <main className="wrap">
        {tab === "dasbor" && <Dasbor {...ctx} />}
        {tab === "stok" && <Stok {...ctx} />}
        {tab === "jual" && <Penjualan {...ctx} />}
        {tab === "beli" && <Pembelian {...ctx} />}
        {tab === "mitra" && <Pelanggan {...ctx} />}
        {tab === "piutang" && <Piutang {...ctx} />}
        {tab === "admin" && can("users") && <PenggunaAdmin {...ctx} />}
      </main>

      <footer className="ft">Copyright © ASEOA</footer>

      {gantiSandi && <GantiSandi online={online} say={say} close={() => setGantiSandi(false)} />}
      {konfirmasi && <Konfirmasi {...konfirmasi} say={say} close={() => setKonfirmasi(null)} />}
      {toast && (
        <div className={"toast" + (toast.bad ? " bad" : "")} role={toast.bad ? "alert" : "status"} aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ============================ LOGIN ============================ */
function Login({ doLogin, onOk, say, toast }) {
  const [f, setF] = useState({ username: "", sandi: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const masuk = async () => {
    if (!f.username || !f.sandi) return say("Isi username dan kata sandi.", true);
    setBusy(true);
    try { onOk(await doLogin(f.username.trim(), f.sandi)); }
    catch (e) { say(e.message, true); }
    finally { setBusy(false); }
  };
  const onKey = (e) => { if (e.key === "Enter") masuk(); };
  return (
    <div className="vk">
      <Style />
      <div className="login">
        <div className="login-card">
          <div className="login-brand">
            <TreadMark />
            <div>
              <h1>VULKANISIR</h1>
            </div>
          </div>
          <div className="hazard" />
          <div className="login-bd">
            <label className="fld">
              <span className="lbl">Username</span>
              <input value={f.username} onChange={set("username")} onKeyDown={onKey} autoFocus />
            </label>
            <label className="fld">
              <span className="lbl">Kata Sandi</span>
              <input type="password" value={f.sandi} onChange={set("sandi")} onKeyDown={onKey} />
            </label>
            <button className="btn pri lg" onClick={masuk} disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button>
          </div>
        </div>
      </div>
      {toast && (
        <div className={"toast" + (toast.bad ? " bad" : "")} role={toast.bad ? "alert" : "status"} aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------- perilaku dialog: ESC menutup, fokus terkurung, latar terkunci ----------
   `close` disimpan di ref agar efek hanya jalan sekali (prop-nya arrow baru
   tiap render, kalau dipakai sebagai dependensi fokus akan lompat terus). */
const FOKUS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useDialog(close) {
  const box = useRef(null);
  const tutup = useRef(close);
  tutup.current = close;

  useEffect(() => {
    const sebelumnya = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); tutup.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll(FOKUS)].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const [awal, akhir] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === awal) { e.preventDefault(); akhir.focus(); }
      else if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const scrollLama = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // kunci scroll latar
    // utamakan kolom isian; tombol tutup hanya bila dialog tak punya isian
    const awal = box.current?.querySelector("input,select,textarea") || box.current?.querySelector(FOKUS);
    awal?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scrollLama;
      if (sebelumnya instanceof HTMLElement) sebelumnya.focus();
    };
  }, []);

  return box;
}

/* konfirmasi hapus */
function Konfirmasi({ msg, onYes, close, say }) {
  const [busy, setBusy] = useState(false);
  const box = useDialog(close);
  const judul = useId();
  const ya = async () => {
    setBusy(true);
    try { await onYes(); close(); }
    catch (e) { say(e.message, true); close(); }
    finally { setBusy(false); }
  };
  return (
    <div className="ov" onClick={close}>
      <div className="md" style={{ maxWidth: 380 }} ref={box} role="dialog" aria-modal="true" aria-labelledby={judul}
        onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>Konfirmasi Hapus</h3>
          <button className="x" onClick={close} aria-label="Tutup dialog">×</button>
        </div>
        <div className="md-bd">{msg}</div>
        <div className="md-ft">
          <button className="btn" onClick={close}>Batal</button>
          <button className="btn danger" onClick={ya} disabled={busy}>{busy ? "…" : "Hapus"}</button>
        </div>
      </div>
    </div>
  );
}

/* ganti kata sandi sendiri */
function GantiSandi({ close, say, online }) {
  const [f, setF] = useState({ lama: "", baru: "", ulang: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!online) return say("Ganti sandi hanya tersedia saat online.", true);
    if (!f.lama || !f.baru) return say("Isi kata sandi lama dan baru.", true);
    if (f.baru.length < 6) return say("Kata sandi baru minimal 6 karakter.", true);
    if (f.baru !== f.ulang) return say("Konfirmasi kata sandi tidak cocok.", true);
    setBusy(true);
    try {
      await api.gantiSandi(f.lama, f.baru);
      say("Kata sandi berhasil diganti.");
      close();
    } catch (e) { say(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Ganti Kata Sandi" close={close} onSave={kirim} saveLabel={busy ? "…" : "Simpan"}>
      <Inp label="Kata Sandi Lama" type="password" value={f.lama} onChange={set("lama")} />
      <Inp label="Kata Sandi Baru" type="password" value={f.baru} onChange={set("baru")} hint="Minimal 6 karakter" />
      <Inp label="Ulangi Kata Sandi Baru" type="password" value={f.ulang} onChange={set("ulang")} />
    </Modal>
  );
}

/* ============================ PENGGUNA (admin) ============================ */
function PenggunaAdmin({ online, say, user, minta }) {
  const [users, setUsers] = useState(null);
  const [buka, setBuka] = useState(false);
  const load = async () => {
    if (online) { try { setUsers(await api.listPengguna()); } catch (e) { setUsers([]); say(e.message, true); } }
    else setUsers([]);
  };
  useEffect(() => { load(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const tambah = async (u) => {
    if (!online) return say("Tambah pengguna hanya tersedia saat online.", true);
    await api.createPengguna(u); await load();
    say(`Pengguna ${u.username} ditambahkan.`);
  };
  const hapus = (u) => {
    if (!online) return say("Hapus pengguna hanya tersedia saat online.", true);
    minta(`Hapus pengguna "${u.username}"? Tindakan ini permanen.`, async () => {
      await api.deletePengguna(u.id); await load();
      say(`Pengguna ${u.username} dihapus.`);
    });
  };
  return (
    <>
      <SectionTitle id="Pengguna & Hak Akses">
        <button className="btn pri" onClick={() => setBuka(true)}>+ Pengguna Baru</button>
      </SectionTitle>
      <div className="grid3">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <Kpi key={k} label={v.id} val={(users || []).filter((u) => u.peran === k).length + " akun"} sub={v.desc} />
        ))}
      </div>
      <Card title="Daftar Pengguna"
        note="admin: akses penuh · manager: + hapus · staff: input & ubah">
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Nama</th>
                <th scope="col">Peran</th>
                <th scope="col" className="r">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id}>
                  <td className="n strong">{u.username}</td>
                  <td>{u.nama}</td>
                  <td><span className={"role r-" + u.peran}>{ROLE_LABEL[u.peran].id}</span></td>
                  <td className="r">
                    {u.id === user?.id
                      ? <span className="mut2">Akun Anda</span>
                      : <button className="btn danger sm" onClick={() => hapus(u)}>Hapus</button>}
                  </td>
                </tr>
              ))}
              {users && users.length === 0 && <tr><td colSpan={4}><Empty id="Belum ada pengguna." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>
      {buka && <FormPengguna close={() => setBuka(false)} say={say} submit={tambah} />}
    </>
  );
}

function FormPengguna({ close, say, submit }) {
  const [f, setF] = useState({ username: "", nama: "", peran: "staff", sandi: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!f.username.trim() || !f.nama.trim() || !f.sandi) return say("Lengkapi semua kolom.", true);
    try {
      await submit({ id: uid("U"), username: f.username.trim(), nama: f.nama.trim(), peran: f.peran, sandi: f.sandi });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title="Pengguna Baru" close={close} onSave={kirim} saveLabel="Simpan">
      <Inp label="Username" value={f.username} onChange={set("username")} />
      <Inp label="Nama Lengkap" value={f.nama} onChange={set("nama")} />
      <Sel label="Peran" value={f.peran} onChange={set("peran")}
        opts={[["staff", "Staf — input & ubah"], ["manager", "Manajer — + hapus"], ["admin", "Admin — akses penuh"]]} />
      <Inp label="Kata Sandi" type="password" value={f.sandi} onChange={set("sandi")} />
    </Modal>
  );
}

/* ============================ DASBOR ============================ */
const AGING_DEF = [
  ["current", "Belum Jatuh Tempo"],
  ["130", "1–30 Hari"],
  ["3060", "31–60 Hari"],
  ["6090", "61–90 Hari"],
  ["90180", "91–180 Hari"],
  ["180", "> 180 Hari"],
];

/* piutang & umur piutang (mengacu panduan analisis AR) — dipakai Dasbor & halaman Piutang.
   SO berstatus "kirim"/"tagihan" = sudah dikirim tapi belum lunas.
   Jatuh tempo = tanggal SO + termin pelanggan (default 30 hari bila kosong). */
const hitungPiutang = (penjualan, cById, totalSO) => {
  const hariIni = new Date().toISOString().slice(0, 10);
  const piutangRows = penjualan
    .filter((s) => ["kirim", "tagihan"].includes(s.status))
    .map((s) => {
      const c = cById(s.pelanggan);
      const nilai = totalSO(s);
      const tempo = addDays(s.tgl, Number(c.termin) || 30);
      const telat = Math.max(0, diffDays(tempo, hariIni));
      const bucket = telat > 180 ? "180" : telat > 90 ? "90180" : telat > 60 ? "6090" : telat > 30 ? "3060" : telat > 0 ? "130" : "current";
      return { so: s, c, nilai, telat, tempo, bucket };
    });
  const piutangF = piutangRows.reduce((a, r) => a + r.nilai, 0);
  const agingRows = AGING_DEF.map(([k, label]) => {
    const rows = piutangRows.filter((r) => r.bucket === k);
    return { k, label, n: rows.length, nilai: rows.reduce((a, r) => a + r.nilai, 0) };
  });
  const piutang90 = piutangRows.filter((r) => r.telat > 90).reduce((a, r) => a + r.nilai, 0);
  const rasio90 = piutangF ? (piutang90 / piutangF) * 100 : 0;

  const perPelanggan = new Map();
  piutangRows.forEach((r) => {
    const cur = perPelanggan.get(r.c.id) || { c: r.c, nilai: 0, telat: 0 };
    cur.nilai += r.nilai; cur.telat = Math.max(cur.telat, r.telat);
    perPelanggan.set(r.c.id, cur);
  });
  const topPelanggan = [...perPelanggan.values()]
    .map((x) => ({ ...x, pakai: x.c.limit ? (x.nilai / x.c.limit) * 100 : 0 }))
    .sort((a, b) => b.nilai - a.nilai);

  return { piutangRows, piutangF, agingRows, piutang90, rasio90, topPelanggan };
};
/* grade risiko: kombinasi umur piutang & pemakaian limit kredit — bukan nilai piutang semata */
const gradePiutang = (x) => {
  if (x.telat > 180 || x.pakai > 100) return ["Kritis", "alert"];
  if (x.telat > 90 || x.pakai >= 90) return ["Tinggi", "alert"];
  if (x.telat > 30 || x.pakai >= 70) return ["Sedang", "warn"];
  return ["Rendah", "ok"];
};

function Dasbor({ produk, penjualan, pembelian, getStok, stokTotal, cById, totalSO }) {
  const qtySO = (s) => s.items.reduce((a, i) => a + i.qty, 0);
  const nilaiPO = (p) => p.items.reduce((a, i) => a + i.qty * i.harga, 0);
  const jualKonfirm = penjualan.filter((s) => s.status !== "penawaran");

  const nilaiStok = produk.reduce((a, p) => a + stokTotal(p.id) * p.hpp, 0);
  const jual = jualKonfirm.reduce((a, s) => a + totalSO(s), 0);
  const beli = pembelian.reduce((a, p) => a + nilaiPO(p), 0);

  /* ---------- ringkasan bulanan (penjualan per gudang) ---------- */
  const jualBulanan = (() => {
    const m = new Map();
    jualKonfirm.forEach((s) => {
      const b = String(s.tgl).slice(0, 7);
      const c = m.get(b) || { bulan: b, n: 0, qty: 0, nilai: 0, perGudang: {} };
      c.n += 1; c.qty += qtySO(s); c.nilai += totalSO(s);
      c.perGudang[s.gudang] = (c.perGudang[s.gudang] || 0) + qtySO(s);
      m.set(b, c);
    });
    return [...m.values()].sort((a, b) => b.bulan.localeCompare(a.bulan));
  })();

  const { piutangF, piutang90, rasio90 } = hitungPiutang(penjualan, cById, totalSO);

  return (
    <>
      <SectionTitle id="Ringkasan Operasi" />
      <div className="kpis">
        <Kpi label="Nilai Stok" val={rp(nilaiStok)} sub="harga pokok" />
        <Kpi label="Penjualan" val={rp(jual)} sub={`${jualKonfirm.length} transaksi`} />
        <Kpi label="Pembelian" val={rp(beli)} sub={`${pembelian.length} transaksi`} />
        <Kpi label="Piutang Berjalan" val={rp(piutangF)} sub="belum lunas" tone={piutangF > 0 ? "warn" : ""} />
        <Kpi label="Piutang > 90 Hari" val={rp(piutang90)} sub={`${fmt(rasio90)}% dari piutang berjalan`} tone={piutang90 > 0 ? "alert" : ""} />
      </div>

      <SectionTitle id="Ringkasan Bulanan" />
      <Card title="Penjualan per Bulan" note="tidak termasuk penawaran">
        <Scroll max={280}>
          <table>
            <thead>
              <tr>
                <th scope="col">Bulan</th>
                <th scope="col" className="r">Transaksi</th>
                {GUDANG.map((g) => (
                  <th scope="col" className="r" key={g.id}>{g.kode}</th>
                ))}
                <th scope="col" className="r">Qty</th>
                <th scope="col" className="r">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {jualBulanan.map((b) => (
                <tr key={b.bulan}>
                  <td>{bulanLabel(b.bulan)}</td>
                  <td className="r n">{fmt(b.n)}</td>
                  {GUDANG.map((g) => (
                    <td className="r n" key={g.id}>{fmt(b.perGudang[g.id] || 0)}</td>
                  ))}
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n">{rp(b.nilai)}</td>
                </tr>
              ))}
              {jualBulanan.length === 0 && <tr><td colSpan={4 + GUDANG.length}><Empty id="Tidak ada penjualan pada periode ini." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <SectionTitle id="Ringkasan Stok" />
      <Card title="Stok per Gudang">
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">Gudang</th>
                <th scope="col" className="r">Ban Jadi</th>
                <th scope="col" className="r">Casing</th>
                <th scope="col" className="r">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {GUDANG.map((g) => {
                const jadi = produk.filter((p) => p.kategori === "jadi").reduce((a, p) => a + getStok(g.id, p.id), 0);
                const cs = produk.filter((p) => p.kategori === "casing").reduce((a, p) => a + getStok(g.id, p.id), 0);
                const val = produk.reduce((a, p) => a + getStok(g.id, p.id) * p.hpp, 0);
                return (
                  <tr key={g.id}>
                    <td><span className="chip">{g.kode}</span> {g.nama}</td>
                    <td className="r n">{fmt(jadi)}</td>
                    <td className="r n">{fmt(cs)}</td>
                    <td className="r n">{rp(val)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroll>
      </Card>
    </>
  );
}

/* ============================ STOK ============================ */
function Stok({ produk, getStok, stokTotal, pById, gById, mutasi, doTransfer, doAdjust, say }) {
  const [g, setG] = useState("ALL");
  const [kat, setKat] = useState("ALL");
  const [cari, setCari] = useState("");
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);

  /* pencarian bebas: kode, nama, ukuran, pola, atau merek */
  const q = cari.trim().toLowerCase();
  const cocok = (p) =>
    !q || [p.kode, p.nama, p.ukuran, p.pola, p.merek].some((v) => String(v ?? "").toLowerCase().includes(q));
  const list = produk.filter((p) => (kat === "ALL" || p.kategori === kat) && cocok(p));

  const unduhExcel = () => {
    const aoa = [
      ["Kode", "Nama Barang", "Kategori", "Ukuran", "Pola", "Grade", "Harga Beli", "Harga Agen", "Harga User", ...GUDANG.map((x) => x.kode), "Total", "Min", "Satuan"],
      ...list.map((p) => [
        p.kode, p.nama, KATEGORI[p.kategori].id, p.ukuran, p.pola, p.grade, p.hpp, p.harga, p.hargaUser ?? "",
        ...GUDANG.map((x) => getStok(x.id, p.id)),
        stokTotal(p.id), p.min, p.satuan,
      ]),
    ];
    downloadXlsx(`stok_${TODAY}`, "Stok", aoa);
  };

  return (
    <>
      <SectionTitle id="Stok Gudang"
        mid={
          <div className="filters">
            <Sel label="Gudang" value={g} onChange={setG}
              opts={[["ALL", "Semua Gudang"], ...GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])]} />
            <Sel label="Kategori" value={kat} onChange={setKat}
              opts={[["ALL", "Semua"], ...Object.entries(KATEGORI).map(([k, v]) => [k, v.id])]} />
            <label className="fld cari">
              <span className="lbl">Cari</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Kode / nama / ukuran" />
            </label>
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn" onClick={() => setModal("transfer")}>Transfer Antar Gudang</button>
        <button className="btn" onClick={() => setModal("adjust")}>Penyesuaian Stok</button>
      </SectionTitle>

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama Barang</th>
                <th scope="col" className="r">Harga Beli</th>
                <th scope="col" className="r">Harga Agen</th>
                <th scope="col" className="r">Harga User</th>
                {(g === "ALL" ? GUDANG : GUDANG.filter((x) => x.id === g)).map((x) => (
                  <th scope="col" key={x.id} className="r">{x.kode}</th>
                ))}
                <th scope="col" className="r">Total</th>
                <th scope="col" className="r">Min</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const cols = g === "ALL" ? GUDANG : GUDANG.filter((x) => x.id === g);
                const tot = g === "ALL" ? stokTotal(p.id) : getStok(g, p.id);
                return (
                  <tr key={p.id}>
                    <td><span className="chip">{p.kode}</span></td>
                    <td>
                      <button type="button" className="namelink" onClick={() => setDetail(p)}>{p.nama}</button>
                      <em className="mut2">{KATEGORI[p.kategori].id}{p.merek ? " · " + p.merek : ""}</em>
                    </td>
                    <td className="r n">{rp(p.hpp)}</td>
                    <td className="r n">{rp(p.harga)}</td>
                    <td className="r n mut">{p.hargaUser != null ? rp(p.hargaUser) : "—"}</td>
                    {cols.map((x) => (
                      <td key={x.id} className="r n">{fmt(getStok(x.id, p.id))}</td>
                    ))}
                    <td className={"r n strong " + (tot < p.min ? "bad" : "")}>{fmt(tot)}</td>
                    <td className="r n mut">{fmt(p.min)}</td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7 + (g === "ALL" ? GUDANG.length : 1)}>
                    <Empty id={q ? `Tidak ada barang yang cocok dengan "${cari}".` : "Belum ada barang pada kategori ini."} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <Card title="Buku Mutasi Stok" note="Stok dihitung dari buku ini, bukan diedit langsung.">
        <Scroll max={320}>
          <table>
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">Gudang</th>
                <th scope="col">Barang</th>
                <th scope="col">Jenis</th>
                <th scope="col" className="r">Qty</th>
                <th scope="col">Referensi</th>
              </tr>
            </thead>
            <tbody>
              {[...mutasi].reverse().map((m) => (
                <tr key={m.id}>
                  <td className="n">{m.tgl}</td>
                  <td><span className="chip">{gById(m.gudang).kode}</span></td>
                  <td>{pById(m.produk).nama}</td>
                  <td><Tag t={m.tipe} /></td>
                  <td className={"r n " + (m.qty < 0 ? "bad" : "ok")}>{m.qty > 0 ? "+" : ""}{fmt(m.qty)}</td>
                  <td className="mut">{m.ref}{m.catatan ? " — " + m.catatan : ""}</td>
                </tr>
              ))}
              {mutasi.length === 0 && <tr><td colSpan={6}><Empty id="Belum ada mutasi stok." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {modal === "transfer" && <FormTransfer produk={produk} getStok={getStok} submit={doTransfer} say={say} close={() => setModal(null)} />}
      {modal === "adjust" && <FormAdjust produk={produk} getStok={getStok} submit={doAdjust} say={say} close={() => setModal(null)} />}
      {detail && <DetailProduk p={detail} getStok={getStok} stokTotal={stokTotal} close={() => setDetail(null)} />}
    </>
  );
}

function FormTransfer({ produk, getStok, submit, say, close }) {
  const [f, setF] = useState({ dari: GUDANG[0]?.id || "", ke: GUDANG[1]?.id || GUDANG[0]?.id || "", produk: produk[0].id, qty: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const tersedia = getStok(f.dari, f.produk);
  const simpan = async () => {
    const q = Number(f.qty);
    if (f.dari === f.ke) return say("Gudang asal dan tujuan tidak boleh sama.", true);
    if (!q || q <= 0) return say("Masukkan jumlah yang valid.", true);
    if (q > tersedia) return say(`Stok tidak cukup. Tersedia ${fmt(tersedia)}.`, true);
    try { await submit({ dari: f.dari, ke: f.ke, produk: f.produk, qty: q }); close(); }
    catch (e) { say(e.message, true); }
  };
  return (
    <Modal title="Transfer Antar Gudang" close={close} onSave={simpan}>
      <Sel label="Dari Gudang" value={f.dari} onChange={set("dari")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Sel label="Ke Gudang" value={f.ke} onChange={set("ke")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Sel label="Barang" value={f.produk} onChange={set("produk")} opts={produk.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
      <Inp label="Jumlah" type="number" value={f.qty} onChange={set("qty")} hint={`Tersedia di gudang asal: ${fmt(tersedia)}`} />
    </Modal>
  );
}

function FormAdjust({ produk, getStok, submit, say, close }) {
  const [f, setF] = useState({ gudang: GUDANG[0]?.id || "", produk: produk[0].id, fisik: "", catatan: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const sistem = getStok(f.gudang, f.produk);
  const selisih = f.fisik === "" ? 0 : Number(f.fisik) - sistem;
  const simpan = async () => {
    if (f.fisik === "") return say("Masukkan hasil hitung fisik.", true);
    if (selisih === 0) return say("Tidak ada selisih — tidak ada yang dicatat.", true);
    try {
      await submit({ gudang: f.gudang, produk: f.produk, fisik: Number(f.fisik), selisih, catatan: f.catatan });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title="Penyesuaian Stok" close={close} onSave={simpan}>
      <Sel label="Gudang" value={f.gudang} onChange={set("gudang")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Sel label="Barang" value={f.produk} onChange={set("produk")} opts={produk.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
      <Inp label="Hitung Fisik" type="number" value={f.fisik} onChange={set("fisik")} hint={`Stok sistem: ${fmt(sistem)}`} />
      <div className="delta">
        Selisih <b className={selisih < 0 ? "bad" : selisih > 0 ? "ok" : ""}>{selisih > 0 ? "+" : ""}{fmt(selisih)}</b>
      </div>
      <Inp label="Catatan" value={f.catatan} onChange={set("catatan")} />
    </Modal>
  );
}

function DetailProduk({ p, getStok, stokTotal, close }) {
  const box = useDialog(close);
  const judul = useId();
  const tot = stokTotal(p.id);

  return (
    <div className="ov" onClick={close}>
      <div className="md" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{p.nama} <em>{p.kode}</em></h3>
          <button className="x" onClick={close} aria-label="Tutup dialog">×</button>
        </div>
        <div className="md-bd">
          <div className="spec-info">
            <div><span className="lbl2">Kategori</span><b>{KATEGORI[p.kategori].id}</b></div>
            <div><span className="lbl2">Ukuran</span><b>{p.ukuran || "-"}</b></div>
            <div><span className="lbl2">Pola</span><b>{p.pola || "-"}</b></div>
            <div><span className="lbl2">Grade</span><b>{p.grade || "-"}</b></div>
            <div><span className="lbl2">Merek</span><b>{p.merek || "-"}</b></div>
            <div><span className="lbl2">Satuan</span><b>{p.satuan}</b></div>
          </div>

          <div className="kpis">
            <Kpi label="Harga Beli" val={rp(p.hpp)} sub="harga pokok" />
            <Kpi label="Harga Agen" val={rp(p.harga)} sub="harga jual agen" />
            <Kpi label="Harga User" val={p.hargaUser != null ? rp(p.hargaUser) : "—"} sub="harga jual pengguna akhir" />
          </div>

          <h4 className="mut2">Stok per Gudang</h4>
          <Scroll max={220}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Gudang</th>
                  <th scope="col" className="r">Qty</th>
                </tr>
              </thead>
              <tbody>
                {GUDANG.map((g) => (
                  <tr key={g.id}>
                    <td><span className="chip">{g.kode}</span> {g.nama}</td>
                    <td className="r n">{fmt(getStok(g.id, p.id))}</td>
                  </tr>
                ))}
                <tr>
                  <td className="strong">Total</td>
                  <td className={"r n strong " + (tot < p.min ? "bad" : "")}>{fmt(tot)} / {fmt(p.min)} {p.satuan}</td>
                </tr>
              </tbody>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          <button className="btn pri" onClick={close}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ PENJUALAN ============================ */
function Penjualan({ penjualan, doCreatePenjualan, pelanggan, produk, pById, cById, gById, totalSO, majuSO, getStok, piutang, say, can, minta, doDeletePenjualan }) {
  const [buka, setBuka] = useState(false);
  const [dok, setDok] = useState(null);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [cust, setCust] = useState("");
  const [terbuka, setTerbuka] = useState(() => new Set());
  const filterAktif = dari || sampai || cust.trim();
  const list = useMemo(() => {
    const q = cust.trim().toLowerCase();
    return penjualan.filter(
      (s) => (!dari || s.tgl >= dari) && (!sampai || s.tgl <= sampai) && (!q || cById(s.pelanggan).nama.toLowerCase().includes(q)),
    );
  }, [penjualan, dari, sampai, cust, cById]);
  const grup = useMemo(() => {
    const map = new Map();
    for (const s of list) {
      if (!map.has(s.tgl)) map.set(s.tgl, []);
      map.get(s.tgl).push(s);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([tgl, rows]) => ({
        tgl, rows,
        total: rows.reduce((a, s) => a + totalSO(s), 0),
        qty: rows.reduce((a, s) => a + s.items.reduce((b, i) => b + (Number(i.qty) || 0), 0), 0),
      }));
  }, [list, totalSO]);
  const toggle = (tgl) => setTerbuka((s) => {
    const n = new Set(s);
    if (n.has(tgl)) n.delete(tgl); else n.add(tgl);
    return n;
  });
  const ringkasan = useMemo(() => ({
    jumlah: list.length,
    qty: grup.reduce((a, g) => a + g.qty, 0),
    total: grup.reduce((a, g) => a + g.total, 0),
  }), [list, grup]);

  const unduhExcel = () => {
    const aoa = [
      ["No.", "Tanggal", "Pelanggan", "Kota", "Gudang", "Status", "Rincian", "Total"],
      ...list.map((s) => [
        s.no, s.tgl, cById(s.pelanggan).nama, cById(s.pelanggan).kota, gById(s.gudang).kode,
        SO_LABEL[s.status].id,
        s.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", "),
        totalSO(s),
      ]),
    ];
    downloadXlsx(`penjualan_${TODAY}`, "Penjualan", aoa);
  };

  return (
    <>
      <SectionTitle id="Penjualan"
        mid={
          <div className="filters">
            <label className="fld">
              <span className="lbl">Dari</span>
              <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} max={sampai || undefined} />
            </label>
            <label className="fld">
              <span className="lbl">Sampai</span>
              <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} min={dari || undefined} />
            </label>
            <label className="fld cari">
              <span className="lbl">Pelanggan</span>
              <input type="search" value={cust} onChange={(e) => setCust(e.target.value)} placeholder="Cari nama pelanggan" />
            </label>
            {filterAktif && <button className="btn sm" onClick={() => { setDari(""); setSampai(""); setCust(""); }}>Reset Filter</button>}
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri" onClick={() => setBuka(true)}>+ Penjualan Baru</button>
      </SectionTitle>

      {filterAktif && (
        <div className="kpis">
          <Kpi label="Transaksi" val={fmt(ringkasan.jumlah)} sub="pada filter ini" />
          <Kpi label="Jumlah Qty" val={`${fmt(ringkasan.qty)} pcs`} sub="total kuantitas terfilter" />
          <Kpi label="Total Nilai" val={rp(ringkasan.total)} sub="total penjualan terfilter" />
        </div>
      )}

      {grup.length === 0 && (
        <Card><Empty id={filterAktif ? "Tidak ada transaksi pada filter ini." : "Belum ada transaksi penjualan."} /></Card>
      )}

      {grup.map(({ tgl, rows, total, qty }) => {
        const on = terbuka.has(tgl);
        return (
          <Card key={tgl}>
            <button type="button" className="card-hd acc-hd" aria-expanded={on} onClick={() => toggle(tgl)}>
              <span className="acc-chev">{on ? "▾" : "▸"}</span>
              <span className="acc-tgl">{tglPanjang(tgl)}</span>
              <span className="acc-sub">{rows.length} transaksi · {fmt(qty)} pcs · {rp(total)}</span>
            </button>
            {on && (
              <Scroll>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">No.</th>
                      <th scope="col">Pelanggan</th>
                      <th scope="col">Gudang</th>
                      <th scope="col">Rincian</th>
                      <th scope="col" className="r">Total</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="r">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td className="n strong">{s.no}</td>
                        <td>{cById(s.pelanggan).nama}<em className="mut2">Grade {cById(s.pelanggan).grade}</em></td>
                        <td><span className="chip">{gById(s.gudang).kode}</span></td>
                        <td className="mut">
                          {s.items.map((i, k) => (
                            <div key={k}>{pById(i.produk).kode} × {fmt(i.qty)}</div>
                          ))}
                        </td>
                        <td className="r n strong">{rp(totalSO(s))}</td>
                        <td><Status s={s.status} map={SO_LABEL} /></td>
                        <td className="r">
                          <div className="aksi">
                            {s.status !== "lunas" ? (
                              <button className="btn sm" onClick={() => majuSO(s)}>
                                → {SO_LABEL[SO_FLOW[SO_FLOW.indexOf(s.status) + 1]].id}
                              </button>
                            ) : <span className="mut">selesai</span>}
                            <button className="btn sm" title="Cetak dokumen" onClick={() => setDok(s)}>Cetak</button>
                            {can("delete") && (
                              <button className="btn sm danger" title="Hapus"
                                onClick={() => minta(`Hapus penjualan ${s.no}? Data & mutasi stoknya ikut terhapus.`, () => doDeletePenjualan(s))}>Hapus</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
            )}
          </Card>
        );
      })}

      {buka && (
        <FormPenjualan
          close={() => setBuka(false)} pelanggan={pelanggan} produk={produk} getStok={getStok}
          piutang={piutang} say={say} submit={doCreatePenjualan}
          nomor={(tgl) => nomorBaru("SO", penjualan, tgl)}
        />
      )}
      {dok && (
        <DokumenPenjualan so={dok} pById={pById} cById={cById} gById={gById} totalSO={totalSO} close={() => setDok(null)} />
      )}
    </>
  );
}

/* penerbit dokumen — PPN mengikuti perusahaan penerbit */
const PENERBIT = {
  spb: { nama: "CV. Sinar Perkasa Ban", ppn: false, sub: "Ban Vulkanisir" },
  dfj: { nama: "PT. Daimond Fajar Jaya", ppn: true, sub: "Ban Vulkanisir" },
};

function DokumenPenjualan({ so, pById, cById, gById, totalSO, close }) {
  const [jenis, setJenis] = useState(so.status === "penawaran" || so.status === "pesanan" ? "penawaran" : "faktur");
  const [terbit, setTerbit] = useState("spb");
  const box = useDialog(close);
  const judul = useId();
  const isFaktur = jenis === "faktur";
  const firm = PENERBIT[terbit];
  const c = cById(so.pelanggan);
  const g = gById(so.gudang);
  const subtotal = totalSO(so);
  const ppn = firm.ppn ? Math.round(subtotal * 0.11) : 0;
  const grand = subtotal + ppn;
  const jatuhTempo = addDays(so.tgl, isFaktur ? (Number(c.termin) || 30) : 14);

  return (
    <div className="ov" onClick={close}>
      <div className="doc-modal" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul}
        onClick={(e) => e.stopPropagation()}>
        <div className="doc-bar">
          <div className="doc-tabs">
            <button className={"btn sm" + (!isFaktur ? " pri" : "")} onClick={() => setJenis("penawaran")}>Penawaran</button>
            <button className={"btn sm" + (isFaktur ? " pri" : "")} onClick={() => setJenis("faktur")}>Faktur</button>
          </div>
          <div className="doc-firm">
            <span className="doc-firm-lbl">Penerbit</span>
            {Object.entries(PENERBIT).map(([k, v]) => (
              <button key={k} className={"btn sm" + (terbit === k ? " pri" : "")} onClick={() => setTerbit(k)}>
                {v.nama}
              </button>
            ))}
          </div>
          <div className="doc-bar-r">
            <button className="btn pri" onClick={() => window.print()}>⎙ Cetak</button>
            <button className="x" onClick={close} aria-label="Tutup dokumen">×</button>
          </div>
        </div>

        <div className="doc-scroll">
          <div className="doc-paper">
            <div className="doc-hd">
              <div className="doc-co">
                <TreadMark />
                <div>
                  <h2>{firm.nama.toUpperCase()}</h2>
                  <p>{firm.sub}</p>
                  <p className="doc-addr">Indonesia · Telp — · Email —</p>
                </div>
              </div>
              <div className="doc-title">
                <h1 id={judul}>{isFaktur ? "FAKTUR PENJUALAN" : "PENAWARAN HARGA"}</h1>
              </div>
            </div>

            <div className="doc-meta">
              <div className="doc-to">
                <span className="doc-lbl">Kepada Yth.</span>
                <b>{c.nama}</b>
                <p>{[c.pic, c.telp].filter(Boolean).join(" · ") || "-"}</p>
                <p>{c.kota || "-"}</p>
              </div>
              <table className="doc-info"><tbody>
                <tr><td>No.</td><td>{so.no}</td></tr>
                <tr><td>Tanggal</td><td>{tglPanjang(so.tgl)}</td></tr>
                <tr><td>{isFaktur ? "Jatuh Tempo" : "Berlaku s/d"}</td><td>{tglPanjang(jatuhTempo)}</td></tr>
                <tr><td>Gudang</td><td>{g.nama}</td></tr>
              </tbody></table>
            </div>

            <table className="doc-items">
              <thead><tr>
                <th scope="col" className="c">#</th><th scope="col">Kode</th><th scope="col">Deskripsi Barang</th>
                <th scope="col" className="r">Qty</th><th scope="col" className="r">Harga</th><th scope="col" className="r">Jumlah</th>
              </tr></thead>
              <tbody>
                {so.items.map((it, i) => {
                  const p = pById(it.produk);
                  return (
                    <tr key={i}>
                      <td className="c">{i + 1}</td>
                      <td className="n">{p.kode}</td>
                      <td>{p.nama}{p.merek ? <em className="doc-brand"> {p.merek}</em> : null}</td>
                      <td className="r n">{fmt(it.qty)} {p.satuan}</td>
                      <td className="r n">{fmt(it.harga)}</td>
                      <td className="r n">{fmt(it.qty * it.harga)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="doc-sum">
              <div className="doc-terbilang">
                <span className="doc-lbl">Terbilang</span>
                <i>{terbilang(grand)}</i>
              </div>
              <table><tbody>
                {firm.ppn ? (
                  <>
                    <tr><td>Subtotal (DPP)</td><td className="r n">{rp(subtotal)}</td></tr>
                    <tr><td>PPN 11%</td><td className="r n">{rp(ppn)}</td></tr>
                  </>
                ) : (
                  <tr><td>Subtotal</td><td className="r n">{rp(subtotal)}</td></tr>
                )}
                <tr className="doc-grand"><td>{isFaktur ? "Total Tagihan" : "Total"}</td><td className="r n">{rp(grand)}</td></tr>
              </tbody></table>
            </div>

            {isFaktur && (
              <div className="doc-pay">
                <span className="doc-lbl">Pembayaran</span>
                <p>Transfer ke rekening a.n. {firm.nama}. Termin {Number(c.termin) || 30} hari sejak faktur.</p>
              </div>
            )}

            <div className="doc-sign">
              <div><span>Hormat kami,</span><div className="doc-line" /><b>{firm.nama}</b></div>
              <div><span>{isFaktur ? "Diterima oleh," : "Menyetujui,"}</span><div className="doc-line" /><b>{c.nama}</b></div>
            </div>

            <p className="doc-foot">
              {isFaktur
                ? "Faktur ini sah tanpa tanda tangan basah dan diproses oleh komputer."
                : "Penawaran berlaku 14 hari sejak tanggal terbit. Harga belum termasuk ongkos kirim."}
              {firm.ppn ? " · Harga belum termasuk PPN." : " · Non-PKP, tanpa PPN."}
              {" · "}Dicetak dari VULKANISIR
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormPenjualan({ close, pelanggan, produk, getStok, piutang, say, submit, nomor }) {
  /* yang bisa dijual: ban jadi + Ban Jasa */
  const jadi = produk.filter((p) => ["jadi", "jasa"].includes(p.kategori));
  const [f, setF] = useState({ pelanggan: pelanggan[0].id, gudang: GUDANG[0]?.id || "", tgl: TODAY });
  const [items, setItems] = useState([{ produk: jadi[0].id, qty: "", harga: jadi[0].harga }]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const ubah = (i, k, v) => setItems((l) => l.map((x, n) => {
    if (n !== i) return x;
    const y = { ...x, [k]: v };
    if (k === "produk") y.harga = (jadi.find((p) => p.id === v) || {}).harga || 0;
    return y;
  }));
  const total = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);
  const c = pelanggan.find((p) => p.id === f.pelanggan) || {};
  const sisaLimit = (c.limit || 0) - piutang(c.id) - total;
  /* baris yang qty-nya melebihi stok gudang pengirim — masih boleh disimpan
     sebagai penawaran, tapi pengiriman akan ditolak sampai stok mencukupi. */
  const lebihStok = items.filter((i) => Number(i.qty) > 0 && Number(i.qty) > getStok(f.gudang, i.produk));

  const kirim = async () => {
    const salah = items.find((i) => String(i.qty).trim() !== "" && !(Number(i.qty) > 0));
    if (salah) return say("Qty harus berupa angka lebih besar dari 0.", true);
    const valid = items.filter((i) => Number(i.qty) > 0);
    if (!valid.length) return say("Tambahkan minimal satu baris barang.", true);
    if (valid.some((i) => !(Number(i.harga) >= 0))) return say("Harga harus berupa angka.", true);
    if (sisaLimit < 0) return say(`Melebihi limit kredit ${c.nama} sebesar ${rp(-sisaLimit)}.`, true);
    try {
      await submit({
        id: uid("SO"), no: nomor(f.tgl),
        tgl: f.tgl, pelanggan: f.pelanggan, gudang: f.gudang, status: "penawaran",
        items: valid.map((i) => ({ produk: i.produk, qty: Number(i.qty), harga: Number(i.harga) })),
      });
      close();
    } catch (e) { say(e.message, true); }
  };

  return (
    <Modal title="Penjualan Baru" close={close} onSave={kirim} wide saveLabel="Simpan Penawaran">
      <div className="row2">
        <Sel label="Pelanggan" value={f.pelanggan} onChange={set("pelanggan")} opts={pelanggan.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
        <Sel label="Gudang Pengirim" value={f.gudang} onChange={set("gudang")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      </div>

      <div className="lbl mt">Rincian Barang</div>
      {items.map((it, i) => {
        const ada = getStok(f.gudang, it.produk);
        const kurang = Number(it.qty) > ada;
        return (
          <div className="line" key={i}>
            <select value={it.produk} aria-label={`Barang baris ${i + 1}`} onChange={(e) => ubah(i, "produk", e.target.value)}>
              {jadi.map((p) => <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>)}
            </select>
            <input type="number" min="0" inputMode="numeric" placeholder="Qty" aria-label={`Jumlah baris ${i + 1}`}
              aria-invalid={kurang || undefined} value={it.qty} onChange={(e) => ubah(i, "qty", e.target.value)} className={kurang ? "err" : ""} />
            <input type="number" min="0" inputMode="numeric" placeholder="Harga" aria-label={`Harga baris ${i + 1}`}
              value={it.harga} onChange={(e) => ubah(i, "harga", e.target.value)} title={rp(it.harga)} />
            <span className={"stokinfo" + (kurang ? " bad" : "")}>stok {fmt(ada)}</span>
            <button className="x" aria-label={`Hapus baris ${i + 1}`} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1}>×</button>
          </div>
        );
      })}
      <button className="btn sm" onClick={() => setItems((l) => [...l, { produk: jadi[0].id, qty: "", harga: jadi[0].harga }])}>+ Tambah Baris</button>

      {lebihStok.length > 0 && (
        <p className="peringatan" role="status">
          {lebihStok.length} baris melebihi stok di {(GUDANG.find((x) => x.id === f.gudang) || {}).nama}.
          Masih bisa disimpan sebagai penawaran, tetapi status <b>Dikirim</b> akan ditolak sampai stok mencukupi.
        </p>
      )}

      <div className="sum">
        <div><span>Total</span><b className="n">{rp(total)}</b></div>
        <div><span>Sisa Limit Kredit</span><b className={"n " + (sisaLimit < 0 ? "bad" : "ok")}>{rp(sisaLimit)}</b></div>
      </div>
      {sisaLimit < 0 && (
        <p className="peringatan bad-box" role="status">
          Melebihi limit kredit {c.nama} sebesar {rp(-sisaLimit)} — penawaran tidak bisa disimpan.
        </p>
      )}
    </Modal>
  );
}

/* ============================ PEMBELIAN ============================ */
function Pembelian({ pembelian, doCreatePembelian, pemasok, produk, pById, sById, gById, majuPO, say, can, minta, doDeletePembelian }) {
  const [buka, setBuka] = useState(false);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const filterAktif = dari || sampai;
  const tot = (p) => p.items.reduce((a, i) => a + i.qty * i.harga, 0);
  const qtyPO = (p) => p.items.reduce((a, i) => a + i.qty, 0);
  const list = useMemo(
    () => pembelian.filter((p) => (!dari || p.tgl >= dari) && (!sampai || p.tgl <= sampai)),
    [pembelian, dari, sampai],
  );
  const beliBulanan = useMemo(() => {
    const m = new Map();
    pembelian.forEach((p) => {
      const b = String(p.tgl).slice(0, 7);
      const c = m.get(b) || { bulan: b, n: 0, qty: 0, nilai: 0 };
      c.n += 1; c.qty += qtyPO(p); c.nilai += tot(p);
      m.set(b, c);
    });
    return [...m.values()].sort((a, b) => b.bulan.localeCompare(a.bulan));
  }, [pembelian]);

  const unduhExcel = () => {
    const aoa = [
      ["No.", "Tanggal", "Pemasok", "Gudang Tujuan", "Status", "Rincian", "Total"],
      ...list.map((p) => [
        p.no, p.tgl, sById(p.pemasok).nama, gById(p.gudang).nama, PO_LABEL[p.status].id,
        p.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", "),
        tot(p),
      ]),
    ];
    downloadXlsx(`pembelian_${TODAY}`, "Pembelian", aoa);
  };

  return (
    <>
      <SectionTitle id="Pembelian"
        mid={
          <div className="filters">
            <label className="fld">
              <span className="lbl">Dari</span>
              <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} max={sampai || undefined} />
            </label>
            <label className="fld">
              <span className="lbl">Sampai</span>
              <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} min={dari || undefined} />
            </label>
            {filterAktif && <button className="btn sm" onClick={() => { setDari(""); setSampai(""); }}>Reset Filter</button>}
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri"
          onClick={() => {
            if (!produk.some((p) => ["casing", "bahan"].includes(p.kategori)))
              return say("Belum ada barang casing/bahan baku di katalog. Tambahkan dulu ke tabel produk.", true);
            setBuka(true);
          }}>+ Pembelian Baru</button>
      </SectionTitle>

      <div className="grid3">
        {["casing", "bahan"].map((j) => {
          const n = list.filter((p) => p.items.some((i) => (pById(i.produk).kategori) === j));
          return (
            <Kpi key={j} label={`Pembelian ${KATEGORI[j].id}`}
              val={rp(n.reduce((a, p) => a + tot(p), 0))} sub={`${n.length} transaksi`} />
          );
        })}
        <Kpi label="Utang Berjalan"
          val={rp(list.filter((p) => p.status === "diterima").reduce((a, p) => a + tot(p), 0))}
          sub="sudah diterima, belum dibayar"
          tone="warn" />
      </div>

      <Card title="Pembelian per Bulan">
        <Scroll max={220}>
          <table>
            <thead>
              <tr>
                <th scope="col">Bulan</th>
                <th scope="col" className="r">Transaksi</th>
                <th scope="col" className="r">Qty</th>
                <th scope="col" className="r">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {beliBulanan.map((b) => (
                <tr key={b.bulan}>
                  <td>{bulanLabel(b.bulan)}</td>
                  <td className="r n">{fmt(b.n)}</td>
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n">{rp(b.nilai)}</td>
                </tr>
              ))}
              {beliBulanan.length === 0 && <tr><td colSpan={4}><Empty id="Belum ada pembelian." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col">Gudang Tujuan</th>
                <th scope="col">Rincian</th>
                <th scope="col" className="r">Total</th>
                <th scope="col">Status</th>
                <th scope="col" className="r">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="n strong">{p.no}</td>
                  <td className="n">{p.tgl}</td>
                  <td>{sById(p.pemasok).nama}<em className="mut2">{KATEGORI[sById(p.pemasok).jenis]?.id}</em></td>
                  <td><span className="chip">{gById(p.gudang).kode}</span></td>
                  <td className="mut">{p.items.map((i, k) => <div key={k}>{pById(i.produk).kode} × {fmt(i.qty)} {pById(i.produk).satuan}</div>)}</td>
                  <td className="r n strong">{rp(tot(p))}</td>
                  <td><Status s={p.status} map={PO_LABEL} /></td>
                  <td className="r">
                    <div className="aksi">
                      {p.status !== "lunas" ? (
                        <button className="btn sm" onClick={() => majuPO(p)}>→ {PO_LABEL[PO_FLOW[PO_FLOW.indexOf(p.status) + 1]].id}</button>
                      ) : <span className="mut">selesai</span>}
                      {can("delete") && (
                        <button className="btn sm danger" title="Hapus"
                          onClick={() => minta(`Hapus pembelian ${p.no}? Data & mutasi stoknya ikut terhapus.`, () => doDeletePembelian(p))}>Hapus</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8}><Empty id={filterAktif ? "Tidak ada transaksi pada filter ini." : "Belum ada transaksi pembelian."} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {buka && (
        <FormPembelian close={() => setBuka(false)} pemasok={pemasok} produk={produk} say={say} submit={doCreatePembelian}
          nomor={(tgl) => nomorBaru("PO", pembelian, tgl)} />
      )}
    </>
  );
}

function FormPembelian({ close, pemasok, produk, say, submit, nomor }) {
  /* yang bisa dibeli: casing & bahan baku */
  const beliable = produk.filter((p) => ["casing", "bahan"].includes(p.kategori));
  const [f, setF] = useState({ pemasok: pemasok[0].id, gudang: GUDANG[0]?.id || "", tgl: TODAY });
  const [items, setItems] = useState([{ produk: beliable[0].id, qty: "", harga: beliable[0].hpp }]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const ubah = (i, k, v) => setItems((l) => l.map((x, n) => {
    if (n !== i) return x;
    const y = { ...x, [k]: v };
    if (k === "produk") y.harga = (beliable.find((p) => p.id === v) || {}).hpp || 0;
    return y;
  }));
  const total = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);

  const kirim = async () => {
    const salah = items.find((i) => String(i.qty).trim() !== "" && !(Number(i.qty) > 0));
    if (salah) return say("Qty harus berupa angka lebih besar dari 0.", true);
    const valid = items.filter((i) => Number(i.qty) > 0);
    if (!valid.length) return say("Tambahkan minimal satu baris barang.", true);
    if (valid.some((i) => !(Number(i.harga) >= 0))) return say("Harga harus berupa angka.", true);
    try {
      await submit({
        id: uid("PO"), no: nomor(f.tgl),
        tgl: f.tgl, pemasok: f.pemasok, gudang: f.gudang, status: "order",
        items: valid.map((i) => ({ produk: i.produk, qty: Number(i.qty), harga: Number(i.harga) })),
      });
      close();
    } catch (e) { say(e.message, true); }
  };

  return (
    <Modal title="Pembelian Baru" close={close} onSave={kirim} wide saveLabel="Simpan Pesanan">
      <div className="row2">
        <Sel label="Pemasok" value={f.pemasok} onChange={set("pemasok")} opts={pemasok.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
        <Sel label="Gudang Tujuan" value={f.gudang} onChange={set("gudang")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      </div>
      <div className="lbl mt">Rincian Barang</div>
      {items.map((it, i) => (
        <div className="line" key={i}>
          <select value={it.produk} aria-label={`Barang baris ${i + 1}`} onChange={(e) => ubah(i, "produk", e.target.value)}>
            {beliable.map((p) => <option key={p.id} value={p.id}>{p.kode} — {p.nama} ({p.satuan})</option>)}
          </select>
          <input type="number" min="0" inputMode="numeric" placeholder="Qty" aria-label={`Jumlah baris ${i + 1}`}
            value={it.qty} onChange={(e) => ubah(i, "qty", e.target.value)} />
          <input type="number" min="0" inputMode="numeric" placeholder="Harga" aria-label={`Harga baris ${i + 1}`}
            value={it.harga} onChange={(e) => ubah(i, "harga", e.target.value)} title={rp(it.harga)} />
          <span className="stokinfo">{produk.find((p) => p.id === it.produk)?.satuan}</span>
          <button className="x" aria-label={`Hapus baris ${i + 1}`} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1}>×</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setItems((l) => [...l, { produk: beliable[0].id, qty: "", harga: beliable[0].hpp }])}>+ Tambah Baris</button>
      <div className="sum"><div><span>Total</span><b className="n">{rp(total)}</b></div></div>
    </Modal>
  );
}

/* ============================ PELANGGAN ============================ */
function Pelanggan({ pelanggan, doCreatePelanggan, penjualan, totalSO, piutang, gById, pById, say, can, minta, doDeletePelanggan }) {
  const [buka, setBuka] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cari, setCari] = useState("");
  const omzet = (cid) => penjualan.filter((s) => s.pelanggan === cid && s.status !== "penawaran").reduce((a, s) => a + totalSO(s), 0);
  const list = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return pelanggan;
    return pelanggan.filter((c) => [c.kode, c.nama, c.pic, c.kota].some((v) => (v || "").toLowerCase().includes(q)));
  }, [pelanggan, cari]);

  const unduhExcel = () => {
    const aoa = [
      ["Kode", "Nama", "PIC", "Telepon", "Kota", "Grade", "Limit Kredit", "Termin (hari)", "Piutang", "Omzet"],
      ...list.map((c) => [
        c.kode, c.nama, c.pic, c.telp, c.kota, c.grade, c.limit, c.termin, piutang(c.id), omzet(c.id),
      ]),
    ];
    downloadXlsx(`pelanggan_${TODAY}`, "Pelanggan", aoa);
  };

  return (
    <>
      <SectionTitle id="Pelanggan"
        mid={
          <div className="filters">
            <label className="fld cari">
              <span className="lbl">Cari</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Kode / nama / PIC / kota" />
            </label>
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri" onClick={() => setBuka(true)}>+ Pelanggan Baru</button>
      </SectionTitle>

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Kota</th>
                <th scope="col" className="c">Grade</th>
                <th scope="col" className="r">Termin</th>
                <th scope="col" className="r">Piutang</th>
                <th scope="col" className="r">Limit Kredit</th>
                <th scope="col" className="r">Omzet</th>
                {can("delete") && <th scope="col" className="r">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const p = piutang(c.id);
                const lewat = p > c.limit;
                return (
                  <tr key={c.id}>
                    <td><span className="chip">{c.kode}</span></td>
                    <td>
                      <button type="button" className="namelink" onClick={() => setDetail(c)}>{c.nama}</button>
                      <em className="mut2">{c.pic} · {c.telp}</em>
                    </td>
                    <td className="mut">{c.kota}</td>
                    <td className="c"><span className={"grade g" + c.grade}>{c.grade}</span></td>
                    <td className="r n mut">{c.termin} hari</td>
                    <td className={"r n strong " + (lewat ? "bad" : "")}>{rp(p)}</td>
                    <td className="r n">{rp(c.limit)}</td>
                    <td className="r n">{rp(omzet(c.id))}</td>
                    {can("delete") && (
                      <td className="r">
                        <button className="btn sm danger" title="Hapus"
                          onClick={() => minta(`Hapus pelanggan ${c.nama}?`, () => doDeletePelanggan(c))}>Hapus</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={9}><Empty id={cari ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan."} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {buka && (
        <FormPelanggan close={() => setBuka(false)} say={say} submit={doCreatePelanggan} />
      )}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)} />
      )}
    </>
  );
}

function FormPelanggan({ close, say, submit }) {
  const [f, setF] = useState({ nama: "", pic: "", telp: "", kota: "", grade: "B", limit: "100000000", termin: "30" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!f.nama.trim()) return say("Nama pelanggan wajib diisi.", true);
    try {
      await submit({ id: uid("C"), kode: "PLG-" + String(Math.floor(Math.random() * 900) + 100), ...f, limit: Number(f.limit), termin: Number(f.termin) });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title="Pelanggan Baru" close={close} onSave={kirim}>
      <Inp label="Nama Perusahaan" value={f.nama} onChange={set("nama")} />
      <div className="row2">
        <Inp label="PIC" value={f.pic} onChange={set("pic")} />
        <Inp label="Telepon" value={f.telp} onChange={set("telp")} />
      </div>
      <div className="row2">
        <Inp label="Kota" value={f.kota} onChange={set("kota")} />
        <Sel label="Grade" value={f.grade} onChange={set("grade")} opts={[["A", "A"], ["B", "B"], ["C", "C"]]} />
      </div>
      <div className="row2">
        <Inp label="Limit Kredit (Rp)" type="number" value={f.limit} onChange={set("limit")} />
        <Inp label="Termin (hari)" type="number" value={f.termin} onChange={set("termin")} />
      </div>
    </Modal>
  );
}

function DetailPelanggan({ c, penjualan, totalSO, piutang, gById, pById, close }) {
  const box = useDialog(close);
  const judul = useId();
  const riwayat = useMemo(
    () => [...penjualan].filter((s) => s.pelanggan === c.id).sort((a, b) => (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0)),
    [penjualan, c.id],
  );
  const omzet = riwayat.filter((s) => s.status !== "penawaran").reduce((a, s) => a + totalSO(s), 0);
  const p = piutang(c.id);

  return (
    <div className="ov" onClick={close}>
      <div className="md wide" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{c.nama} <em>{c.kode}</em></h3>
          <button className="x" onClick={close} aria-label="Tutup dialog">×</button>
        </div>
        <div className="md-bd">
          <div className="cust-info">
            <div><span className="lbl2">PIC</span><b>{c.pic || "-"}</b></div>
            <div><span className="lbl2">Telepon</span><b>{c.telp || "-"}</b></div>
            <div><span className="lbl2">Kota</span><b>{c.kota || "-"}</b></div>
            <div><span className="lbl2">Grade</span><span className={"grade g" + c.grade}>{c.grade}</span></div>
            <div><span className="lbl2">Termin</span><b>{c.termin} hari</b></div>
            <div><span className="lbl2">Limit Kredit</span><b>{rp(c.limit)}</b></div>
          </div>

          <div className="kpis">
            <Kpi label="Piutang" val={rp(p)} sub={p > c.limit ? "melebihi limit kredit" : "belum lunas"} tone={p > c.limit ? "alert" : p > 0 ? "warn" : ""} />
            <Kpi label="Omzet" val={rp(omzet)} sub={`${riwayat.length} transaksi`} />
          </div>

          <h4 className="mut2">Riwayat Transaksi</h4>
          <Scroll max={280}>
            <table>
              <thead>
                <tr>
                  <th scope="col">No.</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Gudang</th>
                  <th scope="col">Rincian</th>
                  <th scope="col" className="r">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((s) => (
                  <tr key={s.id}>
                    <td className="n strong">{s.no}</td>
                    <td className="n mut">{s.tgl}</td>
                    <td><span className="chip">{gById(s.gudang).kode}</span></td>
                    <td className="mut">
                      {s.items.map((i, k) => (
                        <div key={k}>{pById(i.produk).kode} × {fmt(i.qty)}</div>
                      ))}
                    </td>
                    <td className="r n strong">{rp(totalSO(s))}</td>
                    <td><Status s={s.status} map={SO_LABEL} /></td>
                  </tr>
                ))}
                {riwayat.length === 0 && <tr><td colSpan={6}><Empty id="Belum ada transaksi." /></td></tr>}
              </tbody>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          <button className="btn pri" onClick={close}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ PIUTANG ============================ */
function Piutang({ penjualan, cById, totalSO }) {
  const [cari, setCari] = useState("");
  const { piutangRows, piutangF, agingRows, piutang90, rasio90, topPelanggan } = useMemo(
    () => hitungPiutang(penjualan, cById, totalSO),
    [penjualan, cById, totalSO],
  );
  const berisiko = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return topPelanggan;
    return topPelanggan.filter((x) => x.c.nama.toLowerCase().includes(q));
  }, [topPelanggan, cari]);
  const rincian = useMemo(
    () => [...piutangRows].sort((a, b) => b.telat - a.telat),
    [piutangRows],
  );

  const unduhExcel = () => {
    const aoa = [
      ["No.", "Pelanggan", "Tanggal", "Jatuh Tempo", "Telat (hari)", "Nilai"],
      ...rincian.map((r) => [r.so.no, r.c.nama, r.so.tgl, r.tempo, r.telat, r.nilai]),
    ];
    downloadXlsx(`piutang_${TODAY}`, "Piutang", aoa);
  };

  return (
    <>
      <SectionTitle id="Piutang" mid={<span className="mut2">acuan: panduan analisis umur piutang</span>}>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
      </SectionTitle>

      <div className="kpis">
        <Kpi label="Piutang Berjalan" val={rp(piutangF)} sub={`${fmt(piutangRows.length)} invoice belum lunas`} tone={piutangF > 0 ? "warn" : ""} />
        <Kpi label="Piutang > 90 Hari" val={rp(piutang90)} sub={`${fmt(rasio90)}% dari piutang berjalan`} tone={piutang90 > 0 ? "alert" : ""} />
        <Kpi label="Pelanggan Berpiutang" val={fmt(topPelanggan.length)} sub="pelanggan dengan tagihan berjalan" />
      </div>

      <SectionTitle id="Umur Piutang (Aging)" />
      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">Umur</th>
                <th scope="col" className="r">Invoice</th>
                <th scope="col" className="r">Nilai</th>
                <th scope="col" className="r">Porsi</th>
              </tr>
            </thead>
            <tbody>
              {agingRows.map((r) => (
                <tr key={r.k}>
                  <td className={r.k === "90180" || r.k === "180" ? "bad strong" : r.k === "3060" || r.k === "6090" ? "warn" : ""}>{r.label}</td>
                  <td className="r n">{fmt(r.n)}</td>
                  <td className="r n">{rp(r.nilai)}</td>
                  <td className="r n">{piutangF ? fmt((r.nilai / piutangF) * 100) : 0}%</td>
                </tr>
              ))}
              {piutangRows.length === 0 && <tr><td colSpan={4}><Empty id="Tidak ada piutang berjalan." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <SectionTitle id="Pelanggan Berisiko"
        mid={
          <div className="filters">
            <label className="fld cari">
              <span className="lbl">Cari</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama pelanggan" />
            </label>
          </div>
        } />
      <Card>
        {berisiko.length === 0 ? (
          <Empty id={cari ? "Tidak ada pelanggan yang cocok." : "Tidak ada piutang berjalan."} />
        ) : (
          <Scroll>
            <table>
              <thead>
                <tr>
                  <th scope="col">Pelanggan</th>
                  <th scope="col" className="r">Piutang</th>
                  <th scope="col" className="r">Telat</th>
                  <th scope="col" className="r">Pakai Limit</th>
                  <th scope="col">Grade</th>
                </tr>
              </thead>
              <tbody>
                {berisiko.map((x) => {
                  const [label, tone] = gradePiutang(x);
                  return (
                    <tr key={x.c.id}>
                      <td>{x.c.nama}</td>
                      <td className="r n">{rp(x.nilai)}</td>
                      <td className={"r n " + (x.telat > 90 ? "bad" : x.telat > 30 ? "warn" : "")}>{x.telat > 0 ? `${fmt(x.telat)} hr` : "—"}</td>
                      <td className="r n">{x.c.limit ? `${fmt(x.pakai)}%` : "—"}</td>
                      <td><span className={"st s-" + tone}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
        )}
      </Card>

      <SectionTitle id="Rincian Invoice" />
      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Jatuh Tempo</th>
                <th scope="col" className="r">Telat</th>
                <th scope="col" className="r">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {rincian.map((r) => (
                <tr key={r.so.id}>
                  <td className="n strong">{r.so.no}</td>
                  <td>{r.c.nama}<em className="mut2">Grade {r.c.grade}</em></td>
                  <td className="n">{r.so.tgl}</td>
                  <td className="n">{r.tempo}</td>
                  <td className={"r n " + (r.telat > 90 ? "bad" : r.telat > 30 ? "warn" : "")}>{r.telat > 0 ? `${fmt(r.telat)} hr` : "—"}</td>
                  <td className="r n strong">{rp(r.nilai)}</td>
                </tr>
              ))}
              {rincian.length === 0 && <tr><td colSpan={6}><Empty id="Tidak ada piutang berjalan." /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>
    </>
  );
}

/* ============================ UI ============================ */
function TreadMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="mark">
      <rect width="34" height="34" rx="3" fill="var(--ink)" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={r + "-" + c} x={5 + c * 6.5} y={5 + r * 8} width={4.5} height={5.5} rx="1"
            fill={r === 1 ? "var(--marking)" : "var(--slab)"} opacity={r === 1 ? 1 : 0.75} />
        ))
      )}
    </svg>
  );
}

const SectionTitle = ({ id, mid, children }) => (
  <div className="sect">
    <div className="sect-l">
      <h2>{id}</h2>
      {mid}
    </div>
    <div className="acts">{children}</div>
  </div>
);

const Card = ({ title, note, children }) => (
  <section className="card">
    {title && (
      <div className="card-hd">
        <h3>{title}</h3>
        {note && <p className="note">{note}</p>}
      </div>
    )}
    <div className="card-bd">{children}</div>
  </section>
);

const Kpi = ({ label, val, sub, tone }) => (
  <div className={"kpi " + (tone || "")}>
    <span className="kl">{label}</span>
    <b className="kv n">{val}</b>
    <span className="ks">{sub}</span>
  </div>
);

const Scroll = ({ children, max }) => <div className="scroll" style={max ? { maxHeight: max } : undefined}>{children}</div>;

const Empty = ({ id }) => <div className="empty">{id}</div>;

const TIPE_LABEL = { masuk: "Masuk", keluar: "Keluar", transfer: "Transfer", penyesuaian: "Penyesuaian" };
const Tag = ({ t }) => <span className={"tag t-" + t}>{TIPE_LABEL[t] || t || "—"}</span>;

const Status = ({ s, map }) => <span className={"st s-" + s}>{map[s]?.id || s || "—"}</span>;

const Inp = ({ label, value, onChange, type = "text", hint }) => (
  <label className="fld">
    <span className="lbl">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    {hint && <span className="hint">{hint}</span>}
  </label>
);

const Sel = ({ label, value, onChange, opts }) => (
  <label className="fld">
    <span className="lbl">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  </label>
);

const Modal = ({ title, close, onSave, children, wide, saveLabel }) => {
  const box = useDialog(close);
  const judul = useId();
  return (
    <div className="ov" onClick={close}>
      <div className={"md" + (wide ? " wide" : "")} ref={box} role="dialog" aria-modal="true" aria-labelledby={judul}
        onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{title}</h3>
          <button className="x" onClick={close} aria-label="Tutup dialog">×</button>
        </div>
        <div className="md-bd">{children}</div>
        <div className="md-ft">
          <button className="btn" onClick={close}>Batal</button>
          <button className="btn pri" onClick={onSave}>{saveLabel || "Simpan"}</button>
        </div>
      </div>
    </div>
  );
};

/* ============================ STYLE ============================ */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap');

.vk{
  --slab:#E4E6E1; --paper:#F7F8F5; --ink:#20221F; --rubber:#2C302D;
  --muted:#71766F; --line:#CBCEC6; --marking:#DFA71C;
  --ok:#3B7A57; --warn:#B45A1E; --alert:#A63A28;
  --fd:'Archivo Narrow','IBM Plex Sans KR',system-ui,sans-serif;
  --fb:'IBM Plex Sans KR',system-ui,-apple-system,sans-serif;
  --fm:'IBM Plex Mono',ui-monospace,monospace;
  background:var(--slab); color:var(--ink); font-family:var(--fb);
  font-size:13px; line-height:1.45; min-height:100%;
}
.vk *{box-sizing:border-box}
.vk em{font-style:normal}
.vk h1,.vk h2,.vk h3,.vk h4{font-family:var(--fd); margin:0; letter-spacing:.02em}
.vk .n{font-family:var(--fm); font-variant-numeric:tabular-nums}
.vk .mut{color:var(--muted)}
.vk .mut2{display:block; color:var(--muted); font-size:10.5px}
.vk .strong{font-weight:600}
.vk .ok{color:var(--ok)} .vk .bad{color:var(--alert)} .vk .warn{color:var(--warn)}
.vk .r{text-align:right}
.vk .c{text-align:center}

/* header */
.vk .hd{background:var(--paper); border-bottom:1px solid var(--line)}
.vk .hd-in{max-width:1240px; margin:0 auto; padding:16px 20px 12px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap}
.vk .brand{display:flex; gap:12px; align-items:center; background:none; border:0; padding:0; margin:0; cursor:pointer; text-align:left; font:inherit; color:inherit}
.vk .mark{flex:none; border-radius:3px}
.vk .hd h1{font-size:22px; font-weight:700; letter-spacing:.16em; text-transform:uppercase}
.vk .hd p{margin:1px 0 0; font-size:11.5px; color:var(--muted)}
.vk .hd p em{display:block; font-size:10.5px}
.vk .hd-meta{text-align:right; font-family:var(--fd); text-transform:uppercase; letter-spacing:.1em; font-size:10.5px}
.vk .hd-meta .k{display:block; color:var(--muted)}
.vk .hd-meta .v{font-family:var(--fm); letter-spacing:0; font-size:12px}
.vk .conn{display:inline-block; margin-top:4px; font-family:var(--fm); font-size:10px; letter-spacing:0; text-transform:none; padding:1px 7px; border:1px solid var(--line); border-radius:2px; color:var(--muted)}
.vk .conn.online{color:var(--ok); border-color:var(--ok)}
.vk .conn.offline{color:var(--warn); border-color:var(--warn)}
.vk .hazard{height:5px; background:repeating-linear-gradient(45deg,var(--marking) 0 12px,var(--ink) 12px 24px)}

/* tabs */
.vk .tabs{max-width:1240px; margin:0 auto; padding:0 12px; display:flex; justify-content:center; gap:2px; overflow-x:auto}
.vk .tab{background:none; border:0; border-bottom:3px solid transparent; padding:10px 14px 8px; cursor:pointer;
  font-family:var(--fd); font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); white-space:nowrap}
.vk .tab em{display:block; font-family:var(--fb); font-size:10px; letter-spacing:0; text-transform:none; font-weight:400}
.vk .tab:hover{color:var(--ink)}
.vk .tab.on{color:var(--ink); border-bottom-color:var(--marking)}

.vk .wrap{max-width:1240px; margin:0 auto; padding:20px}

/* section */
.vk .sect{display:flex; justify-content:space-between; align-items:center; gap:16px; margin:4px 0 14px; flex-wrap:wrap}
.vk .sect-l{display:flex; align-items:center; gap:16px; flex-wrap:wrap; min-width:0; flex:1}
.vk .sect h2{font-size:17px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; flex-shrink:0}
.vk .sect h2 em{font-family:var(--fb); font-size:11px; letter-spacing:0; text-transform:none; color:var(--muted); margin-left:8px}
.vk .acts{display:flex; gap:8px; flex-wrap:wrap}

/* buttons */
.vk .btn{background:var(--paper); border:1px solid var(--line); border-radius:2px; padding:7px 12px; cursor:pointer;
  font-family:var(--fd); font-size:12px; font-weight:600; letter-spacing:.05em; color:var(--ink)}
.vk .btn em{display:block; font-family:var(--fb); font-size:9.5px; font-weight:400; letter-spacing:0; color:var(--muted)}
.vk .btn:hover{border-color:var(--ink)}
.vk .btn.pri{background:var(--ink); color:var(--paper); border-color:var(--ink)}
.vk .btn.pri em{color:#B9BDB6}
.vk .btn.pri:hover{background:#000}
.vk .btn.sm{padding:4px 9px; font-size:11px}
.vk .x{background:none; border:0; font-size:18px; line-height:1; cursor:pointer; color:var(--muted); padding:2px 6px}
.vk .x:hover{color:var(--alert)}
.vk .x:disabled{opacity:.25; cursor:not-allowed}
.vk button:focus-visible,.vk input:focus-visible,.vk select:focus-visible{outline:2px solid var(--marking); outline-offset:1px}

/* kpi */
.vk .kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; margin-bottom:16px}
.vk .grid3{display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-bottom:16px}
.vk .kpi{background:var(--paper); border:1px solid var(--line); border-left:3px solid var(--rubber); padding:11px 13px}
.vk .kpi.warn{border-left-color:var(--warn)}
.vk .kpi.alert{border-left-color:var(--alert)}
.vk .kl{font-family:var(--fd); font-size:11px; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); display:block}
.vk .kl em{font-family:var(--fb); letter-spacing:0; text-transform:none; margin-left:6px; font-size:10px}
.vk .kv{display:block; font-size:19px; font-weight:600; margin:3px 0 1px}
.vk .ks{font-size:10.5px; color:var(--muted)}

/* card */
.vk .card{background:var(--paper); border:1px solid var(--line); margin-bottom:16px}
.vk .card-hd{padding:10px 14px; border-bottom:1px solid var(--line)}
.vk .card-hd h3{font-size:13px; font-weight:600; letter-spacing:.09em; text-transform:uppercase}
.vk .card-hd h3 em{font-family:var(--fb); font-size:10.5px; letter-spacing:0; text-transform:none; color:var(--muted); margin-left:7px}
.vk .note{margin:3px 0 0; font-size:10.5px; color:var(--muted)}
.vk .card-bd{padding:0}
.vk .grid2{display:grid; grid-template-columns:1fr 1fr; gap:16px}
@media (max-width:860px){.vk .grid2{grid-template-columns:1fr}}
/* item grid tidak boleh melebar mengikuti tabel di dalamnya (min-width:auto
   bawaan grid) — inilah penyebab halaman ikut scroll ke samping di layar kecil */
.vk .grid2>*,.vk .grid3>*,.vk .kpis>*,.vk .card{min-width:0}

/* accordion (Penjualan, dikelompokkan per tanggal) */
.vk .card-hd.acc-hd{display:flex; align-items:center; gap:10px; width:100%; background:none; border:0;
  border-bottom:1px solid var(--line); cursor:pointer; text-align:left; font:inherit; color:inherit}
.vk .card-hd.acc-hd:hover{background:#EFF1EC}
.vk .acc-chev{flex:none; width:12px; font-size:11px; color:var(--muted)}
.vk .acc-tgl{flex:none; font-size:13px; font-weight:600; letter-spacing:.02em}
.vk .acc-sub{flex:1; font-family:var(--fb); font-size:11px; color:var(--muted)}

/* table */
.vk .scroll{overflow:auto; max-width:100%}
.vk table{width:100%; border-collapse:collapse; font-size:12px}
.vk thead th{position:sticky; top:0; background:var(--slab); text-align:left; padding:7px 10px; border-bottom:1px solid var(--line);
  font-family:var(--fd); font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap}
.vk thead th em{font-family:var(--fb); font-size:9.5px; letter-spacing:0; text-transform:none; color:var(--muted); font-weight:400}
.vk tbody td{padding:8px 10px; border-bottom:1px solid #E6E8E3; vertical-align:top}
.vk tbody tr:hover{background:#EFF1EC}
.vk .chip{display:inline-block; font-family:var(--fm); font-size:10.5px; font-weight:500; background:var(--rubber); color:var(--paper);
  padding:1px 6px; border-radius:2px; letter-spacing:.03em}

/* tags & status */
.vk .tag,.vk .st{display:inline-block; font-family:var(--fd); font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase;
  padding:2px 7px; border:1px solid currentColor; border-radius:2px; line-height:1.3}
.vk .tag em,.vk .st em{display:block; font-family:var(--fb); font-size:9px; letter-spacing:0; text-transform:none; font-weight:400; opacity:.75}
.vk .t-masuk{color:var(--ok)} .vk .t-keluar{color:var(--alert)}
.vk .t-transfer{color:#4A6EA8} .vk .t-penyesuaian{color:var(--warn)}
.vk .s-penawaran{color:var(--muted)} .vk .s-pesanan{color:#4A6EA8}
.vk .s-kirim{color:var(--warn)} .vk .s-tagihan{color:#8A5AA8} .vk .s-lunas{color:var(--ok)}
.vk .s-ok{color:var(--ok)} .vk .s-warn{color:var(--warn)} .vk .s-alert{color:var(--alert)}

/* flow */
.vk .flow{display:flex; align-items:stretch; gap:4px; margin-bottom:14px; overflow-x:auto; padding-bottom:2px}
.vk .step{flex:1; min-width:110px; background:var(--paper); border:1px solid var(--line); border-bottom:3px solid var(--line);
  padding:8px 10px; cursor:pointer; text-align:left; display:flex; justify-content:space-between; align-items:center; gap:8px}
.vk .step span{font-family:var(--fd); font-size:11.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase}
.vk .step span em{display:block; font-family:var(--fb); font-size:9.5px; letter-spacing:0; text-transform:none; color:var(--muted); font-weight:400}
.vk .step b{font-family:var(--fm); font-size:16px}
.vk .step:hover{border-color:var(--muted)}
.vk .step.on{border-bottom-color:var(--marking); background:#FDF6E4}
.vk .arrow{align-self:center; color:var(--line); font-size:18px}

/* filters */
.vk .filters{display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap}
.vk .filters .fld{min-width:210px}
.vk .filters .cari input{min-width:190px}

/* filters & flow lifted into the section-title row (single-line height) */
.vk .sect-l .filters{margin-bottom:0}
.vk .sect-l .filters .fld{min-width:0; margin-bottom:0; display:flex; align-items:center; gap:8px}
.vk .sect-l .filters .lbl{margin-bottom:0; white-space:nowrap}
.vk .sect-l .filters select{width:auto; min-width:150px}
.vk .sect-l .flow{margin-bottom:0; flex:1}

/* fields */
.vk .fld{display:block; margin-bottom:10px}
.vk .lbl{font-family:var(--fd); font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); display:block; margin-bottom:3px}
.vk .lbl em{font-family:var(--fb); letter-spacing:0; text-transform:none; margin-left:6px; font-size:10px}
.vk .lbl.mt{margin-top:14px}
.vk input,.vk select{width:100%; padding:6px 8px; border:1px solid var(--line); border-radius:2px; background:#fff;
  font-family:var(--fb); font-size:12.5px; color:var(--ink)}
.vk input.err{border-color:var(--alert); background:#FDF1EF}
.vk .hint{display:block; font-size:10px; color:var(--muted); margin-top:2px}
.vk .row2{display:grid; grid-template-columns:1fr 1fr; gap:10px}
@media (max-width:560px){.vk .row2{grid-template-columns:1fr}}
@media (max-width:520px){.vk .cust-info, .vk .spec-info{grid-template-columns:1fr 1fr}}

/* item lines */
.vk .line{display:grid; grid-template-columns:1fr 80px 110px 70px 28px; gap:6px; align-items:center; margin-bottom:6px}
@media (max-width:640px){
  .vk .line{grid-template-columns:1fr 1fr}
  .vk .line>select{grid-column:1 / -1}
}
.vk .stokinfo{font-family:var(--fm); font-size:10.5px; color:var(--muted); text-align:right}
.vk .stokinfo.bad{color:var(--alert); font-weight:600}
.vk .sum{margin-top:14px; border-top:2px solid var(--ink); padding-top:8px; display:grid; gap:4px}
.vk .sum div{display:flex; justify-content:space-between; align-items:baseline}
.vk .sum span{font-family:var(--fd); font-size:11px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--muted)}
.vk .sum span em{font-family:var(--fb); letter-spacing:0; text-transform:none; margin-left:6px; font-size:10px}
.vk .sum b{font-size:16px}
.vk .delta{display:flex; justify-content:space-between; padding:7px 10px; background:var(--slab); border:1px solid var(--line); margin-bottom:10px;
  font-family:var(--fd); font-size:11px; letter-spacing:.06em; text-transform:uppercase}
.vk .delta b{font-family:var(--fm); font-size:14px}
.vk .peringatan{margin:12px 0 0; padding:8px 10px; font-size:11.5px; line-height:1.45;
  background:#FDF6E4; border-left:3px solid var(--warn); color:#5A4413}
.vk .peringatan b{font-weight:600}
.vk .peringatan.bad-box{background:#FDF1EF; border-left-color:var(--alert); color:#6B241A}

/* alerts list */
.vk .alerts{list-style:none; margin:0; padding:0}
.vk .alerts li{display:flex; align-items:center; gap:9px; padding:8px 14px; border-bottom:1px solid #E6E8E3}
.vk .alerts .an{flex:1; font-size:12px}
.vk .empty{padding:22px 14px; text-align:center; color:var(--muted); font-size:12px}
.vk .empty em{display:block; font-size:10.5px; margin-top:2px}

/* grade badge */
.vk .grade{font-family:var(--fd); font-size:15px; font-weight:700; width:28px; height:28px; display:inline-grid; place-items:center;
  border:1px solid currentColor; border-radius:2px; flex:none; vertical-align:middle}
.vk .gA{color:var(--ok)} .vk .gB{color:#4A6EA8} .vk .gC{color:var(--muted)}

/* modal */
.vk .ov{position:fixed; inset:0; background:rgba(32,34,31,.55); display:grid; place-items:center; padding:16px; z-index:50}
.vk .md{background:var(--paper); border:1px solid var(--ink); width:100%; max-width:440px; max-height:90vh; display:flex; flex-direction:column}
.vk .md.wide{max-width:720px}
.vk .md-hd{display:flex; justify-content:space-between; align-items:center; padding:11px 14px; border-bottom:1px solid var(--line)}
.vk .md-hd h3{font-size:13px; font-weight:600; letter-spacing:.09em; text-transform:uppercase}
.vk .md-hd h3 em{font-family:var(--fb); font-size:10.5px; letter-spacing:0; text-transform:none; color:var(--muted); margin-left:7px}
.vk .md-bd{padding:14px; overflow:auto}
.vk .md-ft{display:flex; justify-content:flex-end; gap:8px; padding:11px 14px; border-top:1px solid var(--line); background:var(--slab)}

/* footer & toast */
.vk .ft{max-width:1240px; margin:0 auto; padding:16px 20px 28px; font-size:10.5px; color:var(--muted); text-align:center; border-top:1px solid var(--line)}
.vk .ft em{display:block}
.vk .ft code{font-family:var(--fm); background:var(--paper); padding:1px 4px; border:1px solid var(--line)}
.vk .toast{position:fixed; left:50%; bottom:22px; transform:translateX(-50%); background:var(--ink); color:var(--paper);
  padding:9px 16px; border-radius:2px; font-size:12px; z-index:60; border-left:4px solid var(--ok); max-width:90%}
.vk .toast.bad{border-left-color:var(--alert)}
@media (prefers-reduced-motion:no-preference){
  .vk .toast{animation:vkup .22s ease-out}
  @keyframes vkup{from{opacity:0; transform:translate(-50%,8px)} to{opacity:1; transform:translate(-50%,0)}}
}

/* login & session */
.vk .login{min-height:100vh; display:grid; place-items:center; padding:20px; background:
  repeating-linear-gradient(45deg,rgba(0,0,0,.015) 0 12px,transparent 12px 24px), var(--slab)}
.vk .splash{font-family:var(--fd); letter-spacing:.1em; text-transform:uppercase; color:var(--muted)}
.vk .login-card{width:100%; max-width:380px; background:var(--paper); border:1px solid var(--ink)}
.vk .login-brand{display:flex; gap:12px; align-items:center; padding:18px 20px 14px}
.vk .login-brand h1{font-size:20px; font-weight:700; letter-spacing:.16em; text-transform:uppercase}
.vk .login-brand p{margin:1px 0 0; font-size:11px; color:var(--muted)}
.vk .login-brand p em{display:block; font-size:10px}
.vk .login-bd{padding:18px 20px 20px}
.vk .btn.lg{width:100%; padding:10px; font-size:13px; margin-top:4px}
.vk .login .conn{width:100%; text-align:center}

/* header: who am I + logout */
.vk .who{display:flex; align-items:center; gap:8px; margin-top:6px; justify-content:flex-end}
.vk .wu{font-family:var(--fb); font-size:11px; letter-spacing:0; text-transform:none; color:var(--ink); display:inline-flex; align-items:center; gap:6px}
.vk .wu-name{background:none; border:0; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer}
.vk .wu-name:hover{text-decoration:underline}

.vk .namelink{background:none; border:0; padding:0; margin:0; font:inherit; font-weight:inherit; color:inherit; cursor:pointer; text-align:left}
.vk .namelink:hover{text-decoration:underline; color:var(--marking)}

.vk .cust-info, .vk .spec-info{display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 18px; margin-bottom:16px}
.vk .cust-info .lbl2, .vk .spec-info .lbl2{display:block; font-family:var(--fb); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:3px}
.vk .lo{background:none; border:1px solid var(--line); border-radius:2px; padding:2px 8px; cursor:pointer;
  font-family:var(--fm); font-size:10px; color:var(--muted)}
.vk .lo:hover{border-color:var(--alert); color:var(--alert)}

/* role badge */
.vk .role{display:inline-block; font-family:var(--fd); font-size:9.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
  padding:1px 6px; border:1px solid currentColor; border-radius:2px; line-height:1.3}
.vk .role em{display:block; font-family:var(--fb); font-size:8.5px; letter-spacing:0; text-transform:none; font-weight:400; opacity:.75}
.vk .r-admin{color:var(--alert)} .vk .r-manager{color:#4A6EA8} .vk .r-staff{color:var(--muted)}

/* danger buttons & action cell */
.vk .aksi{display:inline-flex; gap:6px; justify-content:flex-end; align-items:center; flex-wrap:wrap}
.vk .btn.danger{color:var(--alert); border-color:#E3B4AC}
.vk .btn.danger:hover{background:var(--alert); color:var(--paper); border-color:var(--alert)}
.vk .btn.danger em{color:inherit}

/* dokumen (faktur / penawaran) */
.vk .doc-modal{background:var(--slab); border:1px solid var(--ink); width:100%; max-width:900px; max-height:94vh; display:flex; flex-direction:column}
.vk .doc-bar{display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--ink); background:var(--paper); flex-wrap:wrap}
.vk .doc-tabs{display:flex; gap:6px}
.vk .doc-firm{display:flex; gap:6px; align-items:center}
.vk .doc-firm-lbl{font-family:var(--fd); font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
.vk .doc-firm-lbl em{display:block; font-family:var(--fb); font-size:9px; letter-spacing:0; text-transform:none}
.vk .doc-bar-r{display:flex; gap:10px; align-items:center; margin-left:auto}
.vk .doc-scroll{overflow:auto; padding:22px; background:#8d918a}
.vk .doc-paper{background:#fff; color:#161816; width:100%; max-width:760px; margin:0 auto; padding:34px 40px 30px;
  box-shadow:0 6px 24px rgba(0,0,0,.35); font-family:var(--fb); font-size:12px; line-height:1.5;
  -webkit-print-color-adjust:exact; print-color-adjust:exact}
.vk .doc-hd{display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:2px solid #161816; padding-bottom:14px}
.vk .doc-co{display:flex; gap:12px; align-items:center}
.vk .doc-co h2{font-family:var(--fd); font-size:17px; font-weight:700; letter-spacing:.06em; color:#161816}
.vk .doc-co p{margin:2px 0 0; font-size:11px; color:#555}
.vk .doc-addr{font-size:10px !important; color:#777 !important}
.vk .doc-title{text-align:right}
.vk .doc-title h1{font-family:var(--fd); font-size:20px; font-weight:700; letter-spacing:.05em; color:#161816}
.vk .doc-title em{display:block; font-size:12px; color:#555; margin-top:2px}
.vk .doc-meta{display:flex; justify-content:space-between; gap:20px; margin-top:16px}
.vk .doc-lbl{display:block; font-family:var(--fd); font-size:9.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#888; margin-bottom:4px}
.vk .doc-to b{font-size:13px; color:#161816}
.vk .doc-to p{margin:2px 0 0; font-size:11px; color:#555}
.vk .doc-info{border-collapse:collapse; font-size:11px; min-width:230px}
.vk .doc-info td{padding:2px 0}
.vk .doc-info td:first-child{color:#888; padding-right:16px}
.vk .doc-info td:last-child{text-align:right; font-family:var(--fm); color:#161816}
.vk .doc-items{width:100%; border-collapse:collapse; margin-top:18px; font-size:11px}
.vk .doc-items th{background:#161816; color:#fff; font-family:var(--fd); font-weight:600; letter-spacing:.04em;
  text-align:left; padding:7px 8px; font-size:10.5px}
.vk .doc-items th.r{text-align:right} .vk .doc-items th.c{text-align:center; width:26px}
.vk .doc-items td{padding:7px 8px; border-bottom:1px solid #e3e3e0; vertical-align:top; color:#333}
.vk .doc-items td.r{text-align:right} .vk .doc-items td.c{text-align:center; color:#999}
.vk .doc-items .n{font-family:var(--fm)}
.vk .doc-brand{font-style:normal; color:#999; font-size:10px}
.vk .doc-sum{display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:14px}
.vk .doc-terbilang{flex:1; padding-top:2px}
.vk .doc-terbilang i{font-style:italic; color:#444; font-size:11px}
.vk .doc-sum > table{border-collapse:collapse; min-width:240px; font-size:12px}
.vk .doc-sum > table td{padding:4px 0}
.vk .doc-sum > table td:first-child{color:#666; padding-right:24px}
.vk .doc-sum > table td.r{text-align:right; font-family:var(--fm); color:#161816}
.vk .doc-grand td{border-top:2px solid #161816; padding-top:7px !important; font-weight:700; font-size:13px; color:#161816 !important}
.vk .doc-pay{margin-top:18px; padding:10px 12px; background:#f4f4f1; border-left:3px solid #161816}
.vk .doc-pay p{margin:0; font-size:11px; color:#444}
.vk .doc-sign{display:flex; justify-content:space-between; gap:40px; margin-top:34px}
.vk .doc-sign > div{flex:1; text-align:center}
.vk .doc-sign span{font-size:11px; color:#444}
.vk .doc-sign em{display:block; font-size:10px; color:#999; margin-top:1px}
.vk .doc-line{height:46px; border-bottom:1px solid #999; margin:0 10px 4px}
.vk .doc-sign b{font-size:11px; color:#161816}
.vk .doc-foot{margin-top:26px; padding-top:10px; border-top:1px solid #e3e3e0; font-size:9.5px; color:#aaa; text-align:center}

/* ---------- layar kecil (tablet & ponsel) ---------- */
@media (max-width:900px){
  .vk .hd-in{padding:13px 14px 10px}
  .vk .wrap{padding:16px 14px}
  .vk .sect-l .filters .fld{flex:1 1 170px}
  .vk .sect-l .filters select{min-width:0; width:100%}
}
@media (max-width:720px){
  .vk{font-size:13.5px}
  .vk .hd-in{padding:12px 12px 10px; gap:10px}
  .vk .hd h1{font-size:18px; letter-spacing:.12em}
  .vk .hd-meta{text-align:left; width:100%}
  .vk .who{margin-top:0; justify-content:flex-start; flex-wrap:wrap}
  /* justify-content:center memotong tab pertama saat baris ini ikut scroll */
  .vk .tabs{justify-content:flex-start; padding:0 10px; scrollbar-width:thin}
  .vk .tab{padding:10px 11px 8px}
  .vk .wrap{padding:14px 12px}
  .vk .sect{align-items:stretch}
  .vk .sect-l{gap:10px}
  .vk .sect h2{font-size:15px}
  .vk .acts{width:100%}
  .vk .acts .btn{flex:1 1 auto; text-align:center}
  .vk .filters,.vk .sect-l .flow{width:100%}
  .vk .step{min-width:92px; padding:7px 9px}
  .vk .step b{font-size:14px}
  .vk .kpis,.vk .grid3{grid-template-columns:1fr 1fr}
  .vk .ft{padding:6px 12px 24px}
  .vk .ov{padding:10px}
  .vk .md,.vk .doc-modal{max-height:94vh}
  .vk .md-ft .btn{flex:1}
  .vk .doc-scroll{padding:12px}
  .vk .doc-paper{padding:20px 18px 18px}
  .vk .doc-hd,.vk .doc-meta,.vk .doc-sum,.vk .doc-sign{flex-direction:column; gap:12px}
  .vk .doc-title{text-align:left}
  .vk .doc-sign{gap:18px}
}
@media (max-width:520px){
  .vk .kpis,.vk .grid3{grid-template-columns:1fr}
  .vk .filters .fld,.vk .sect-l .filters .fld{flex:1 1 100%; min-width:0}
  .vk .filters .cari input{min-width:0}
  /* label + kontrol ditumpuk agar tidak saling menekan */
  .vk .sect-l .filters .fld{display:block}
  .vk .sect-l .filters .lbl{margin-bottom:3px}
  .vk .line{grid-template-columns:1fr 1fr; gap:6px; padding:9px; margin-bottom:9px;
    background:var(--slab); border:1px solid var(--line)}
  .vk .line>select{grid-column:1 / -1}
  .vk .line>.stokinfo{text-align:left; align-self:center}
  .vk .line>.x{justify-self:end}
}

@media print{
  body *{visibility:hidden !important}
  .vk .doc-paper, .vk .doc-paper *{visibility:visible !important}
  .vk .doc-paper{position:absolute; left:0; top:0; width:100%; max-width:none; margin:0;
    padding:0; box-shadow:none; font-size:11pt}
  @page{size:A4; margin:16mm}
}
`}</style>
  );
}
