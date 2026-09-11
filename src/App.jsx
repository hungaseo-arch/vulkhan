import React, { useState, useMemo, useEffect, useRef, useId } from "react";
import { api } from "./api";
import { downloadXlsx } from "./xlsx";
import { LangProvider, useLang, LANGS } from "./i18n.jsx";

/* ============================================================
   VULKANISIR — Sistem Manajemen Penjualan Ban Vulkanisir
   ------------------------------------------------------------
   Data layer: lihat objek `api` di bawah.
   Saat ini memakai state memori (data contoh).
   Ganti isi `api` dengan fetch() ke server Neon (api-server.js).
   ============================================================ */

/* ---------- format ---------- */
/* Notasi angka mengikuti standar dokumen PT Ascendo (ASM Design Guide 9-3):
   pemisah ribuan koma, desimal titik — 756,704,706 / 32,829.8 — bukan id-ID. */
const nf = new Intl.NumberFormat("en-US");
const fmt = (n) => nf.format(Math.round(Number(n) || 0));
const rp = (n) => "Rp " + fmt(n);
const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
/* tanggal hari ini (zona waktu lokal) sebagai YYYY-MM-DD — dihitung saat dipakai,
   bukan konstanta, agar formulir & nama berkas selalu memakai tanggal berjalan */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
const tglPanjang = (s, lang) => {
  if (!s) return "-";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return lang === "ko" ? `${y}년 ${Number(m)}월 ${Number(d)}일` : `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};
const addDays = (s, days) => {
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/* selisih hari dari tanggal `from` ke `to` (positif bila `to` lebih belakangan) */
const diffDays = (from, to) =>
  Math.round((new Date(String(to).slice(0, 10) + "T00:00:00") - new Date(String(from).slice(0, 10) + "T00:00:00")) / 86400000);
const bulanLabel = (ym, lang) => {
  const [y, m] = String(ym).split("-");
  return lang === "ko" ? `${y}년 ${Number(m)}월` : `${BULAN[Number(m) - 1]} ${y}`;
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
// Status usulan limit kredit — harus sama dengan CHECK di tabel limit_usulan.
const USULAN_LABEL = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" };

const ROLE_LABEL = {
  admin:   { id: "Admin", desc: "Akses penuh" },
  manager: { id: "Manajer", desc: "+ Hapus" },
  staff:   { id: "Staf", desc: "Input & ubah" },
};

/* ============================================================ */

export default function App() {
  return (
    <LangProvider>
      <Aplikasi />
    </LangProvider>
  );
}

/* satu tombol untuk identitas + aksi akun; sebelumnya tiga kontrol terpisah di header */
function MenuPengguna({ user, gantiSandi, logout }) {
  const { t } = useLang();
  const [buka, setBuka] = useState(false);
  const kotak = useRef(null);

  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e) => { if (kotak.current && !kotak.current.contains(e.target)) setBuka(false); };
    const tekan = (e) => { if (e.key === "Escape") setBuka(false); };
    document.addEventListener("mousedown", klikLuar);
    document.addEventListener("keydown", tekan);
    return () => {
      document.removeEventListener("mousedown", klikLuar);
      document.removeEventListener("keydown", tekan);
    };
  }, [buka]);

  return (
    <div className="um" ref={kotak}>
      <button type="button" className={"um-b" + (buka ? " on" : "")} aria-haspopup="menu" aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}>
        <span className={"um-av r-" + user.peran} aria-hidden="true">{user.nama.slice(0, 1).toUpperCase()}</span>
        <span className="um-nm">{user.nama}</span>
        <svg className="um-ar" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {buka && (
        <div className="um-pop" role="menu">
          <div className="um-hd">
            <b>{user.nama}</b>
            <span className={"role r-" + user.peran}>{t(ROLE_LABEL[user.peran].id)}</span>
          </div>
          <button type="button" role="menuitem" className="um-i"
            onClick={() => { setBuka(false); gantiSandi(); }}>{t("Ganti kata sandi")}</button>
          <button type="button" role="menuitem" className="um-i keluar" onClick={logout}>{t("Keluar")}</button>
        </div>
      )}
    </div>
  );
}

/* pemilih bahasa — dipakai di header & layar login */
function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang" role="group" aria-label={t("Bahasa")}>
      {LANGS.map(([k, , nama, bendera]) => (
        <button key={k} type="button" className={"lang-b" + (lang === k ? " on" : "")}
          title={nama} aria-label={nama} aria-pressed={lang === k} onClick={() => setLang(k)}>
          <span aria-hidden="true">{bendera}</span>
        </button>
      ))}
    </div>
  );
}

function Aplikasi() {
  const { t } = useLang();
  const [tab, setTab] = useState("dasbor");
  const [produk, setProduk] = useState(SEED_PRODUK);
  const [pelanggan, setPelanggan] = useState(SEED_PELANGGAN);
  const [pemasok, setPemasok] = useState(SEED_PEMASOK);
  const [mutasi, setMutasi] = useState(SEED_MUTASI);
  const [penjualan, setPenjualan] = useState(SEED_PENJUALAN);
  const [pembelian, setPembelian] = useState(SEED_PEMBELIAN);
  /* stok resmi dari server (v_stok). null = belum ada / offline → hitung dari mutasi */
  const [stokServer, setStokServer] = useState(null);
  const [mutasiLimit, setMutasiLimit] = useState(null); // batas baris mutasi yang dikirim server
  const [toast, setToast] = useState(null);
  const [conn, setConn] = useState("loading"); // "loading" | "online" | "offline"
  const online = conn === "online";

  /* ---------- sesi login ---------- */
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vk_user")) || null; } catch { return null; }
  });
  const [konfirmasi, setKonfirmasi] = useState(null); // { msg, onYes }
  const minta = (msg, onYes, opsi) => setKonfirmasi({ msg, onYes, ...opsi });
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
    if (perm === "users" || perm === "putusan") return user.peran === "admin";
    return true; // input & ubah: semua peran yang login
  };

  async function doLogin(username, sandi) {
    if (!online) throw new Error(t("Server tidak terjangkau. Login membutuhkan koneksi."));
    return api.login(username, sandi); // lempar error bila salah
  }
  const login = (u) => {
    setUser(u);
    api.setToken(u.token);
    try { localStorage.setItem("vk_user", JSON.stringify(u)); } catch { /* noop */ }
    say(t("Selamat datang, {nama}.", { nama: u.nama }));
  };
  const logout = () => {
    setUser(null);
    api.setToken(null);
    try { localStorage.removeItem("vk_user"); } catch { /* noop */ }
    setStokServer(null);
    setTab("dasbor");
  };

  /* ---------- muat data dari server (fallback ke data contoh) ---------- */
  const applyData = (d) => {
    if (d.gudang?.length) GUDANG = d.gudang;
    setProduk(d.produk);
    setPelanggan(d.pelanggan);
    setPemasok(d.pemasok);
    setMutasi(d.mutasi);
    setStokServer(d.stok || null);
    setMutasiLimit(d.mutasiLimit || null);
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
        if (e.status === 401) { logout(); say(t("Sesi berakhir. Silakan masuk kembali."), true); }
        else say(e.message, true);
      });
    return () => { alive = false; };
  }, [user, conn]); // eslint-disable-line react-hooks/exhaustive-deps

  /* stok tidak pernah diedit langsung.
     Online  → dari view v_stok di server (menjumlah SELURUH buku mutasi).
     Offline → dijumlah dari mutasi di memori (mode demo).
     Jangan menjumlah `mutasi` saat online: server hanya mengirim 500 baris terakhir. */
  const stok = useMemo(() => {
    const m = {};
    if (stokServer) {
      stokServer.forEach((r) => { m[r.gudang + "|" + r.produk] = r.stok; });
      return m;
    }
    mutasi.forEach((x) => {
      const k = x.gudang + "|" + x.produk;
      m[k] = (m[k] || 0) + x.qty;
    });
    return m;
  }, [stokServer, mutasi]);
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
        say(t("Stok {kode} di {gudang} tidak cukup (tersedia {n}).",
          { kode: pById(kurang.produk).kode, gudang: gById(so.gudang).nama, n: getStok(so.gudang, kurang.produk) }), true);
        return;
      }
    }
    try {
      if (online) {
        await api.statusPenjualan(so.id, next); // trigger DB catat mutasi keluar saat 'kirim'
        await reload();
      } else {
        if (next === "kirim")
          addMutasi(so.items.map((it) => ({ tgl: today(), gudang: so.gudang, produk: it.produk, tipe: "keluar", qty: -it.qty, ref: so.no, catatan: "Pengiriman penjualan" })));
        setPenjualan((list) => list.map((x) => (x.id === so.id ? { ...x, status: next } : x)));
      }
      say(`${so.no} → ${t(SO_LABEL[next].id)}`);
    } catch (e) { say(e.message, true); }
  }

  // Mundur satu langkah untuk membetulkan salah tandai pembayaran
  // (lunas → tagihan). Server hanya mengizinkan mundur setelah 'kirim',
  // jadi mutasi stok yang sudah tercatat tidak pernah ikut berubah.
  async function mundurSO(so) {
    const i = SO_FLOW.indexOf(so.status);
    if (i <= SO_FLOW.indexOf("kirim")) return;
    const prev = SO_FLOW[i - 1];
    try {
      if (online) {
        await api.statusPenjualan(so.id, prev);
        await reload();
      } else {
        setPenjualan((list) => list.map((x) => (x.id === so.id ? { ...x, status: prev } : x)));
      }
      say(`${so.no} → ${t(SO_LABEL[prev].id)}`);
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
          addMutasi(po.items.map((it) => ({ tgl: today(), gudang: po.gudang, produk: it.produk, tipe: "masuk", qty: it.qty, ref: po.no, catatan: "Penerimaan pembelian" })));
        setPembelian((list) => list.map((x) => (x.id === po.id ? { ...x, status: next } : x)));
      }
      say(`${po.no} → ${t(PO_LABEL[next].id)}`);
    } catch (e) { say(e.message, true); }
  }

  async function mundurPO(po) {
    const i = PO_FLOW.indexOf(po.status);
    if (i <= PO_FLOW.indexOf("diterima")) return;
    const prev = PO_FLOW[i - 1];
    try {
      if (online) {
        await api.statusPembelian(po.id, prev);
        await reload();
      } else {
        setPembelian((list) => list.map((x) => (x.id === po.id ? { ...x, status: prev } : x)));
      }
      say(`${po.no} → ${t(PO_LABEL[prev].id)}`);
    } catch (e) { say(e.message, true); }
  }

  async function doTransfer(p) {
    if (online) await api.transfer(p);
    else addMutasi([
      { tgl: today(), gudang: p.dari, produk: p.produk, tipe: "transfer", qty: -p.qty, ref: "TRF", catatan: "Keluar transfer" },
      { tgl: today(), gudang: p.ke, produk: p.produk, tipe: "transfer", qty: p.qty, ref: "TRF", catatan: "Masuk transfer" },
    ]);
    if (online) await reload();
    say(t("Transfer tercatat."));
  }

  async function doAdjust(p) {
    if (online) await api.penyesuaian({ gudang: p.gudang, produk: p.produk, fisik: p.fisik, catatan: p.catatan });
    else addMutasi([{ tgl: today(), gudang: p.gudang, produk: p.produk, tipe: "penyesuaian", qty: p.selisih, ref: "ADJ", catatan: p.catatan || "Hasil stok opname" }]);
    if (online) await reload();
    say(t("Penyesuaian tercatat."));
  }

  // Saldo awal hanya online: angka yang disimpan MENGGANTI baris AWAL lama,
  // jadi klien harus tahu keadaan server — tidak bisa diantre offline.
  async function doSaldoAwal(p) {
    if (!online) { say(t("Saldo awal hanya tersedia saat online."), true); return; }
    const r = await api.simpanSaldoAwal(p);
    await reload();
    say(t("Saldo awal {n} barang tersimpan.", { n: r.ditulis }));
  }

  async function doCreatePenjualan(so) {
    if (online) { await api.createPenjualan(so); await reload(); }
    else setPenjualan((l) => [...l, so]);
    say(t("{no} dibuat sebagai Penawaran.", { no: so.no }));
  }

  async function doCreatePembelian(po) {
    if (online) { await api.createPembelian(po); await reload(); }
    else setPembelian((l) => [...l, po]);
    say(t("{no} dibuat. Stok bertambah saat status Diterima.", { no: po.no }));
  }

  async function doCreatePelanggan(c) {
    if (online) { await api.createPelanggan(c); await reload(); }
    else setPelanggan((l) => [...l, c]);
    say(t("{nama} ditambahkan.", { nama: c.nama }));
  }

  // Limit kredit & termin tidak ikut: keduanya hanya berubah lewat usulan.
  async function doUpdatePelanggan(c) {
    if (online) { await api.updatePelanggan(c.id, c); await reload(); }
    else setPelanggan((l) => l.map((x) => (x.id === c.id ? c : x)));
    say(t("{nama} diperbarui.", { nama: c.nama }));
  }

  /* ---------- hapus (manager ke atas) ---------- */
  async function doDeletePenjualan(so) {
    if (online) { await api.deletePenjualan(so.id); await reload(); }
    else { setPenjualan((l) => l.filter((x) => x.id !== so.id)); setMutasi((m) => m.filter((x) => x.ref !== so.no)); }
    say(t("{no} dihapus.", { no: so.no }));
  }
  async function doDeletePembelian(po) {
    if (online) { await api.deletePembelian(po.id); await reload(); }
    else { setPembelian((l) => l.filter((x) => x.id !== po.id)); setMutasi((m) => m.filter((x) => x.ref !== po.no)); }
    say(t("{no} dihapus.", { no: po.no }));
  }
  async function doDeletePelanggan(c) {
    if (penjualan.some((s) => s.pelanggan === c.id))
      throw new Error(t("Tidak bisa dihapus: pelanggan masih punya transaksi penjualan."));
    if (online) { await api.deletePelanggan(c.id); await reload(); }
    else setPelanggan((l) => l.filter((x) => x.id !== c.id));
    say(t("{nama} dihapus.", { nama: c.nama }));
  }

  const ctx = {
    produk, pelanggan, pemasok, mutasi, mutasiLimit, penjualan, pembelian,
    getStok, stokTotal, pById, cById, gById, sById, totalSO,
    piutang, piutangTotal, majuSO, mundurSO, majuPO, mundurPO, say, online,
    doTransfer, doAdjust, doSaldoAwal, doCreatePenjualan, doCreatePembelian, doCreatePelanggan,
    doUpdatePelanggan, user, can, minta, doDeletePenjualan, doDeletePembelian, doDeletePelanggan, reload,
  };

  const TABS = [
    ["dasbor", "Ringkasan"],
    ["stok", "Stok Gudang"],
    ["jual", "Penjualan"],
    ["beli", "Pembelian"],
    ["mitra", "Pelanggan"],
    ["piutang", "Piutang"],
    ...(can("users") ? [["admin", "Pengguna"]] : []),
  ];

  /* ---------- gerbang: loading & login ---------- */
  if (conn === "loading")
    return <div className="vk"><Style /><div className="login"><div className="splash">{t("Menyambung…")}</div></div></div>;
  if (!user)
    return <Login doLogin={doLogin} onOk={login} say={say} toast={toast} conn={conn} />;

  return (
    <div className="vk">
      <Style />
      <header className="hd">
        <div className="hd-in">
          <button type="button" className="brand" title={t("Beranda")} onClick={() => setTab("dasbor")}>
            <AscendoMark size={30} />
            <div>
              <h1>VULKHAN</h1>
            </div>
          </button>
          <div className="hd-meta">
            <div className="who">
              <LangSwitch />
              <MenuPengguna user={user} gantiSandi={() => setGantiSandi(true)} logout={logout} />
            </div>
          </div>
        </div>
        <div className="accent" />
        <nav className="tabs">
          {TABS.map(([k, a]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
              {t(a)}
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
function Login({ doLogin, onOk, say, toast, conn }) {
  const { t } = useLang();
  const [f, setF] = useState({ username: "", sandi: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const masuk = async () => {
    if (!f.username || !f.sandi) return say(t("Isi username dan kata sandi."), true);
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
            <div className="login-id">
              <img className="sig" src="/ascendo-signature.png" alt="Ascendo Internasional" width={168} height={33} />
              <h1>VULKANISIR</h1>
            </div>
            <LangSwitch />
          </div>
          <div className="accent" />
          <div className="login-bd">
            <label className="fld">
              <span className="lbl">{t("Username")}</span>
              <input value={f.username} onChange={set("username")} onKeyDown={onKey} autoFocus />
            </label>
            <label className="fld">
              <span className="lbl">{t("Kata Sandi")}</span>
              <input type="password" value={f.sandi} onChange={set("sandi")} onKeyDown={onKey} />
            </label>
            <button className="btn pri lg" onClick={masuk} disabled={busy || conn !== "online"}>{busy ? t("Memproses…") : t("Masuk|login")}</button>
            <span className={"conn " + conn}>
              {conn === "online" ? t("● Neon terhubung") : t("○ Server tidak terhubung — jalankan api-server.js")}
            </span>
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

/* konfirmasi tindakan — bawaannya hapus; tajuk & label bisa diganti lewat minta() */
function Konfirmasi({ msg, onYes, close, say, tajuk, labelAksi }) {
  const { t } = useLang();
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
          <h3 id={judul}>{tajuk || t("Konfirmasi Hapus")}</h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">{msg}</div>
        <div className="md-ft">
          <button className="btn" onClick={close}>{t("Batal")}</button>
          <button className="btn danger" onClick={ya} disabled={busy}>{busy ? "…" : labelAksi || t("Hapus")}</button>
        </div>
      </div>
    </div>
  );
}

/* ganti kata sandi sendiri */
function GantiSandi({ close, say, online }) {
  const { t } = useLang();
  const [f, setF] = useState({ lama: "", baru: "", ulang: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!online) return say(t("Ganti sandi hanya tersedia saat online."), true);
    if (!f.lama || !f.baru) return say(t("Isi kata sandi lama dan baru."), true);
    if (f.baru.length < 6) return say(t("Kata sandi baru minimal 6 karakter."), true);
    if (f.baru !== f.ulang) return say(t("Konfirmasi kata sandi tidak cocok."), true);
    setBusy(true);
    try {
      await api.gantiSandi(f.lama, f.baru);
      say(t("Kata sandi berhasil diganti."));
      close();
    } catch (e) { say(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("Ganti Kata Sandi")} close={close} onSave={kirim} saveLabel={busy ? "…" : t("Simpan")}>
      <Inp label={t("Kata Sandi Lama")} type="password" value={f.lama} onChange={set("lama")} />
      <Inp label={t("Kata Sandi Baru")} type="password" value={f.baru} onChange={set("baru")} hint={t("Minimal 6 karakter")} />
      <Inp label={t("Ulangi Kata Sandi Baru")} type="password" value={f.ulang} onChange={set("ulang")} />
    </Modal>
  );
}

/* ============================ PENGGUNA (admin) ============================ */
// Sandi yang dipasang server saat admin mereset akun. Ditampilkan di layar
// supaya admin bisa menyampaikannya ke pengguna. Digandakan dari SANDI_AWAL di
// api-server.js — kalau diubah, ubah keduanya bersamaan.
const SANDI_AWAL = "ascendo123";

function PenggunaAdmin({ online, say, user, minta }) {
  const { t } = useLang();
  const [users, setUsers] = useState(null);
  const [buka, setBuka] = useState(false);
  const [ubah, setUbah] = useState(null); // pengguna yang sedang diubah
  const load = async () => {
    if (online) { try { setUsers(await api.listPengguna()); } catch (e) { setUsers([]); say(e.message, true); } }
    else setUsers([]);
  };
  useEffect(() => { load(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const tambah = async (u) => {
    if (!online) return say(t("Tambah pengguna hanya tersedia saat online."), true);
    await api.createPengguna(u); await load();
    say(t("Pengguna {u} ditambahkan.", { u: u.username }));
  };
  const simpanUbah = async (u) => {
    if (!online) return say(t("Ubah pengguna hanya tersedia saat online."), true);
    await api.updatePengguna(u.id, { nama: u.nama, peran: u.peran }); await load();
    say(t("Pengguna {u} diperbarui.", { u: u.username }));
  };
  // Reset tidak mengubah kolom yang ditampilkan, jadi tidak perlu load() ulang.
  const reset = (u) => {
    if (!online) return say(t("Reset kata sandi hanya tersedia saat online."), true);
    minta(
      t('Reset kata sandi "{u}" menjadi {s}? Pengguna harus menggantinya setelah masuk.', { u: u.username, s: SANDI_AWAL }),
      async () => {
        const r = await api.resetSandi(u.id);
        say(t("Kata sandi {u} direset menjadi {s}.", { u: u.username, s: r.sandi }));
      },
      { tajuk: t("Konfirmasi Reset Kata Sandi"), labelAksi: t("Reset") },
    );
  };
  const hapus = (u) => {
    if (!online) return say(t("Hapus pengguna hanya tersedia saat online."), true);
    minta(t('Hapus pengguna "{u}"? Tindakan ini permanen.', { u: u.username }), async () => {
      await api.deletePengguna(u.id); await load();
      say(t("Pengguna {u} dihapus.", { u: u.username }));
    });
  };
  return (
    <>
      <SectionTitle id={t("Pengguna & Hak Akses")}>
        <button className="btn pri" onClick={() => setBuka(true)}>{t("+ Pengguna Baru")}</button>
      </SectionTitle>
      <div className="grid3">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <Kpi key={k} label={t(v.id)} val={users === null ? "…" : t("{n} akun", { n: users.filter((u) => u.peran === k).length })} sub={t(v.desc)} />
        ))}
      </div>
      <Card title={t("Daftar Pengguna")}
        note={<>
          {t("admin: akses penuh · manager: + hapus · staff: input & ubah")}<br />
          {t("Klik baris untuk mengubah nama dan peran.")}<br />
          {t("Kata sandi awal setelah reset: {s}", { s: SANDI_AWAL })}
        </>}>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Username")}</th>
                <th scope="col">{t("Nama")}</th>
                <th scope="col">{t("Peran")}</th>
                <th scope="col" className="r">{t("Aksi")}</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                /* Seluruh baris membuka dialog ubah. Tombol di kolom Aksi punya
                   aksinya sendiri, jadi kliknya tidak boleh menembus ke baris. */
                <tr key={u.id} className="klik" onClick={() => setUbah(u)}>
                  <td className="n strong">
                    <button type="button" className="namelink">{u.username}</button>
                  </td>
                  <td>{u.nama}</td>
                  <td><span className={"role r-" + u.peran}>{t(ROLE_LABEL[u.peran].id)}</span></td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <div className="aksi">
                      {u.id === user?.id
                        ? <span className="mut2">{t("Akun Anda")}</span>
                        : <>
                            <button className="btn sm" onClick={() => reset(u)}>{t("Reset Sandi")}</button>
                            <button className="btn danger sm" onClick={() => hapus(u)}>{t("Hapus")}</button>
                          </>}
                    </div>
                  </td>
                </tr>
              ))}
              {users === null && <tr><td colSpan={4}><Empty id={t("Memuat…")} /></td></tr>}
              {users && users.length === 0 && <tr><td colSpan={4}><Empty id={t("Belum ada pengguna.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>
      {buka && <FormPengguna close={() => setBuka(false)} say={say} submit={tambah} />}
      {ubah && <FormPengguna close={() => setUbah(null)} say={say} submit={simpanUbah} awal={ubah} sendiri={ubah.id === user?.id} />}
    </>
  );
}

// Dipakai untuk dua hal: membuat akun baru, dan mengubah akun yang ada bila
// `awal` diisi. Saat mengubah, username dikunci (jadi acuan login & riwayat)
// dan kolom sandi disembunyikan — sandi diganti lewat Reset Sandi / Ganti Kata
// Sandi. `sendiri` mengunci peran, mencerminkan penjagaan yang sama di server.
function FormPengguna({ close, say, submit, awal, sendiri }) {
  const { t } = useLang();
  const edit = !!awal;
  const [f, setF] = useState({
    username: awal?.username || "", nama: awal?.nama || "", peran: awal?.peran || "staff", sandi: "",
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!f.username.trim() || !f.nama.trim() || (!edit && !f.sandi)) return say(t("Lengkapi semua kolom."), true);
    try {
      await submit(edit
        ? { id: awal.id, username: awal.username, nama: f.nama.trim(), peran: f.peran }
        : { id: uid("U"), username: f.username.trim(), nama: f.nama.trim(), peran: f.peran, sandi: f.sandi });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={edit ? t("Ubah Pengguna") : t("Pengguna Baru")} close={close} onSave={kirim} saveLabel={t("Simpan")}>
      <Inp label={t("Username")} value={f.username} onChange={set("username")} disabled={edit}
        hint={edit ? t("Username tidak bisa diubah.") : undefined} />
      <Inp label={t("Nama Lengkap")} value={f.nama} onChange={set("nama")} />
      <Sel label={t("Peran")} value={f.peran} onChange={set("peran")} disabled={sendiri}
        hint={sendiri ? t("Peran akun sendiri tidak bisa diubah.") : undefined}
        opts={[["staff", t("Staf — input & ubah")], ["manager", t("Manajer — + hapus")], ["admin", t("Admin — akses penuh")]]} />
      {!edit && <Inp label={t("Kata Sandi")} type="password" value={f.sandi} onChange={set("sandi")} />}
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
  const { t, lang } = useLang();
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
  const totalBulanan = jualBulanan.reduce((a, b) => {
    a.n += b.n; a.qty += b.qty; a.nilai += b.nilai;
    GUDANG.forEach((g) => { a.perGudang[g.id] = (a.perGudang[g.id] || 0) + (b.perGudang[g.id] || 0); });
    return a;
  }, { n: 0, qty: 0, nilai: 0, perGudang: {} });
  const jumlahBulan = jualBulanan.length;

  const { piutangF, piutang90, rasio90 } = hitungPiutang(penjualan, cById, totalSO);

  return (
    <>
      <SectionTitle id={t("Ringkasan Operasi")} />
      <div className="kpis">
        <Kpi label={t("Nilai Stok")} val={rp(nilaiStok)} sub={nilaiStok < 0 ? t("⚠ stok negatif — periksa Buku Mutasi Stok") : t("harga pokok")} tone={nilaiStok < 0 ? "alert" : ""} />
        <Kpi label={t("Penjualan")} val={rp(jual)} sub={t("{n} transaksi", { n: jualKonfirm.length })} />
        <Kpi label={t("Pembelian")} val={rp(beli)} sub={t("{n} transaksi", { n: pembelian.length })} />
        <Kpi label={t("Piutang Berjalan")} val={rp(piutangF)} sub={t("belum lunas")} tone={piutangF > 0 ? "warn" : ""} />
        <Kpi label={t("Piutang > 90 Hari")} val={rp(piutang90)} sub={t("{p}% dari piutang berjalan", { p: fmt(rasio90) })} tone={piutang90 > 0 ? "alert" : ""} />
      </div>

      <SectionTitle id={t("Ringkasan Bulanan")} />
      <Card title={t("Penjualan per Bulan")} note={t("tidak termasuk penawaran")}>
        <Scroll max={280}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Bulan")}</th>
                <th scope="col" className="r">{t("Transaksi")}</th>
                {GUDANG.map((g) => (
                  <th scope="col" className="r" key={g.id}>{g.kode}</th>
                ))}
                <th scope="col" className="r">{t("Qty")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
              </tr>
            </thead>
            <tbody>
              {jualBulanan.map((b) => (
                <tr key={b.bulan}>
                  <td>{bulanLabel(b.bulan, lang)}</td>
                  <td className="r n">{fmt(b.n)}</td>
                  {GUDANG.map((g) => (
                    <td className="r n" key={g.id}>{fmt(b.perGudang[g.id] || 0)}</td>
                  ))}
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n">{rp(b.nilai)}</td>
                </tr>
              ))}
              {jualBulanan.length === 0 && <tr><td colSpan={4 + GUDANG.length}><Empty id={t("Tidak ada penjualan pada periode ini.")} /></td></tr>}
            </tbody>
            {jumlahBulan > 0 && (
              <tfoot>
                <tr className="tf-total">
                  <td><b>{t("Total")}</b></td>
                  <td className="r n strong">{fmt(totalBulanan.n)}</td>
                  {GUDANG.map((g) => (
                    <td className="r n strong" key={g.id}>{fmt(totalBulanan.perGudang[g.id] || 0)}</td>
                  ))}
                  <td className="r n strong">{fmt(totalBulanan.qty)}</td>
                  <td className="r n strong">{rp(totalBulanan.nilai)}</td>
                </tr>
                <tr className="tf-avg">
                  <td><em className="mut2">{t("Rata-rata / bulan")}</em></td>
                  <td className="r n mut">{fmt(totalBulanan.n / jumlahBulan)}</td>
                  {GUDANG.map((g) => (
                    <td className="r n mut" key={g.id}>{fmt((totalBulanan.perGudang[g.id] || 0) / jumlahBulan)}</td>
                  ))}
                  <td className="r n mut">{fmt(totalBulanan.qty / jumlahBulan)}</td>
                  <td className="r n mut">{rp(totalBulanan.nilai / jumlahBulan)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Scroll>
      </Card>

      <SectionTitle id={t("Ringkasan Stok")} />
      <Card title={t("Stok per Gudang")}>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Gudang")}</th>
                <th scope="col" className="r">{t("Ban Jadi")}</th>
                <th scope="col" className="r">{t("Casing")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
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
                    <td className={"r n " + (jadi < 0 ? "bad strong" : "")}>{fmt(jadi)}</td>
                    <td className={"r n " + (cs < 0 ? "bad strong" : "")}>{fmt(cs)}</td>
                    <td className={"r n " + (val < 0 ? "bad strong" : "")}>{rp(val)}</td>
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
const MUTASI_PAGE = 50;

function Stok({ produk, getStok, stokTotal, pById, gById, mutasi, mutasiLimit, doTransfer, doAdjust, doSaldoAwal, online, say }) {
  const { t } = useLang();
  const [g, setG] = useState("ALL");
  const [kat, setKat] = useState("ALL");
  const [cari, setCari] = useState("");
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [mutasiTampil, setMutasiTampil] = useState(MUTASI_PAGE);
  const mutasiUrut = useMemo(() => [...mutasi].reverse(), [mutasi]);

  /* pencarian bebas: kode, nama, ukuran, pola, atau merek */
  const q = cari.trim().toLowerCase();
  const cocok = (p) =>
    !q || [p.kode, p.nama, p.ukuran, p.pola, p.merek].some((v) => String(v ?? "").toLowerCase().includes(q));
  const list = produk.filter((p) => (kat === "ALL" || p.kategori === kat) && cocok(p));

  const unduhExcel = () => {
    const aoa = [
      [t("Kode"), t("Nama Barang"), t("Kategori"), t("Ukuran"), t("Pola"), t("Grade"), t("Harga Beli"), t("Harga Agen"), t("Harga User"), ...GUDANG.map((x) => x.kode), t("Total"), t("Min"), t("Satuan")],
      ...list.map((p) => [
        p.kode, p.nama, t(KATEGORI[p.kategori].id), p.ukuran, p.pola, p.grade, p.hpp, p.harga, p.hargaUser ?? "",
        ...GUDANG.map((x) => getStok(x.id, p.id)),
        stokTotal(p.id), p.min, p.satuan,
      ]),
    ];
    downloadXlsx(`stok_${today()}`, "Stok", aoa);
  };

  return (
    <>
      <SectionTitle id={t("Stok Gudang")}
        mid={
          <div className="filters">
            <Sel label={t("Gudang")} value={g} onChange={setG}
              opts={[["ALL", t("Semua Gudang")], ...GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])]} />
            <Sel label={t("Kategori")} value={kat} onChange={setKat}
              opts={[["ALL", t("Semua")], ...Object.entries(KATEGORI).map(([k, v]) => [k, t(v.id)])]} />
            <label className="fld cari">
              <span className="lbl">{t("Cari")}</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder={t("Kode / nama / ukuran")} />
            </label>
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn" onClick={() => setModal("transfer")}>{t("Transfer Antar Gudang")}</button>
        <button className="btn" onClick={() => setModal("adjust")}>{t("Penyesuaian Stok")}</button>
        <button className="btn" onClick={() => setModal("awal")}>{t("Saldo Awal")}</button>
      </SectionTitle>

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Kode")}</th>
                <th scope="col">{t("Nama Barang")}</th>
                <th scope="col" className="r">{t("Harga Beli")}</th>
                <th scope="col" className="r">{t("Harga Agen")}</th>
                <th scope="col" className="r">{t("Harga User")}</th>
                {(g === "ALL" ? GUDANG : GUDANG.filter((x) => x.id === g)).map((x) => (
                  <th scope="col" key={x.id} className="r">{x.kode}</th>
                ))}
                <th scope="col" className="r">{t("Total")}</th>
                <th scope="col" className="r">{t("Min")}</th>
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
                      <em className="mut2">{t(KATEGORI[p.kategori].id)}{p.merek ? " · " + p.merek : ""}</em>
                    </td>
                    <td className="r n">{rp(p.hpp)}</td>
                    <td className="r n">{rp(p.harga)}</td>
                    <td className="r n mut">{p.hargaUser != null ? rp(p.hargaUser) : "—"}</td>
                    {cols.map((x) => {
                      const s = getStok(x.id, p.id);
                      return <td key={x.id} className={"r n " + (s < 0 ? "bad strong" : "")}>{fmt(s)}</td>;
                    })}
                    <td className={"r n strong " + (tot < 0 ? "bad" : tot < p.min ? "warn" : "")}>{fmt(tot)}</td>
                    <td className="r n mut">{fmt(p.min)}</td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7 + (g === "ALL" ? GUDANG.length : 1)}>
                    <Empty id={q ? t('Tidak ada barang yang cocok dengan "{q}".', { q: cari }) : t("Belum ada barang pada kategori ini.")} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <Card title={t("Buku Mutasi Stok")} note={t("Stok dihitung dari buku ini, bukan diedit langsung.")}>
        <Scroll max={320}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Tanggal")}</th>
                <th scope="col">{t("Gudang")}</th>
                <th scope="col">{t("Barang")}</th>
                <th scope="col">{t("Jenis")}</th>
                <th scope="col" className="r">{t("Qty")}</th>
                <th scope="col">{t("Referensi")}</th>
              </tr>
            </thead>
            <tbody>
              {mutasiUrut.slice(0, mutasiTampil).map((m) => (
                <tr key={m.id}>
                  <td className="n">{m.tgl}</td>
                  <td><span className="chip">{gById(m.gudang).kode}</span></td>
                  <td>{pById(m.produk).nama}</td>
                  <td><Tag t={m.ref === "AWAL" ? "awal" : m.tipe} /></td>
                  <td className={"r n " + (m.qty < 0 ? "bad" : "ok")}>{m.qty > 0 ? "+" : ""}{fmt(m.qty)}</td>
                  <td className="mut">{m.ref}{m.catatan ? " — " + m.catatan : ""}</td>
                </tr>
              ))}
              {mutasi.length === 0 && <tr><td colSpan={6}><Empty id={t("Belum ada mutasi stok.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
        {mutasiTampil < mutasiUrut.length && (
          <div className="mut-more">
            <button className="btn sm" onClick={() => setMutasiTampil((n) => n + MUTASI_PAGE)}>
              {t("Muat {n} lagi", { n: Math.min(MUTASI_PAGE, mutasiUrut.length - mutasiTampil) })}
              <em>{t("{a} dari {b} baris", { a: mutasiTampil, b: mutasiUrut.length })}</em>
            </button>
          </div>
        )}
        {mutasiLimit && mutasi.length >= mutasiLimit && (
          <div className="mut-note">{t("Menampilkan {n} mutasi terakhir. Stok di atas tetap dihitung dari seluruh buku mutasi.", { n: fmt(mutasiLimit) })}</div>
        )}
      </Card>

      {modal === "transfer" && <FormTransfer produk={produk} getStok={getStok} submit={doTransfer} say={say} close={() => setModal(null)} />}
      {modal === "adjust" && <FormAdjust produk={produk} getStok={getStok} submit={doAdjust} say={say} close={() => setModal(null)} />}
      {modal === "awal" && <FormSaldoAwal produk={produk} getStok={getStok} submit={doSaldoAwal} online={online} say={say} close={() => setModal(null)} />}
      {detail && <DetailProduk p={detail} getStok={getStok} stokTotal={stokTotal} close={() => setDetail(null)} />}
    </>
  );
}

function FormTransfer({ produk, getStok, submit, say, close }) {
  const { t } = useLang();
  const [f, setF] = useState({ dari: "", ke: "", produk: "", qty: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const tersedia = getStok(f.dari, f.produk);
  const simpan = async () => {
    const q = Number(f.qty);
    if (!f.dari || !f.ke) return say(t("Pilih gudang asal dan tujuan terlebih dahulu."), true);
    if (!f.produk) return say(t("Pilih barang terlebih dahulu."), true);
    if (f.dari === f.ke) return say(t("Gudang asal dan tujuan tidak boleh sama."), true);
    if (!q || q <= 0) return say(t("Masukkan jumlah yang valid."), true);
    if (q > tersedia) return say(t("Stok tidak cukup. Tersedia {n}.", { n: fmt(tersedia) }), true);
    try { await submit({ dari: f.dari, ke: f.ke, produk: f.produk, qty: q }); close(); }
    catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Transfer Antar Gudang")} close={close} onSave={simpan}>
      <Combo label={t("Dari Gudang")} value={f.dari} onChange={set("dari")} placeholder={t("-- Pilih Gudang --")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Combo label={t("Ke Gudang")} value={f.ke} onChange={set("ke")} placeholder={t("-- Pilih Gudang --")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Combo label={t("Barang")} value={f.produk} onChange={set("produk")} placeholder={t("-- Pilih Barang --")} opts={produk.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
      <Inp label={t("Jumlah")} type="number" value={f.qty} onChange={set("qty")} hint={t("Tersedia di gudang asal: {n}", { n: fmt(tersedia) })} />
    </Modal>
  );
}

function FormAdjust({ produk, getStok, submit, say, close }) {
  const { t } = useLang();
  const [f, setF] = useState({ gudang: "", produk: "", fisik: "", catatan: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const sistem = getStok(f.gudang, f.produk);
  const selisih = f.fisik === "" ? 0 : Number(f.fisik) - sistem;
  const simpan = async () => {
    if (!f.gudang) return say(t("Pilih gudang terlebih dahulu."), true);
    if (!f.produk) return say(t("Pilih barang terlebih dahulu."), true);
    if (f.fisik === "") return say(t("Masukkan hasil hitung fisik."), true);
    if (selisih === 0) return say(t("Tidak ada selisih — tidak ada yang dicatat."), true);
    try {
      await submit({ gudang: f.gudang, produk: f.produk, fisik: Number(f.fisik), selisih, catatan: f.catatan });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Penyesuaian Stok")} close={close} onSave={simpan}>
      <Combo label={t("Gudang")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <Combo label={t("Barang")} value={f.produk} onChange={set("produk")} placeholder={t("-- Pilih Barang --")} opts={produk.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
      <Inp label={t("Hitung Fisik")} type="number" value={f.fisik} onChange={set("fisik")} hint={t("Stok sistem: {n}", { n: fmt(sistem) })} />
      <div className="delta">
        {t("Selisih")} <b className={selisih < 0 ? "bad" : selisih > 0 ? "ok" : ""}>{selisih > 0 ? "+" : ""}{fmt(selisih)}</b>
      </div>
      <Inp label={t("Catatan")} value={f.catatan} onChange={set("catatan")} />
    </Modal>
  );
}

/* Saldo awal (기초재고) — stok pembukaan sebelum sistem ini dipakai.
   Diisi sekaligus untuk satu gudang: angka yang dimasukkan adalah saldo
   PEMBUKAAN, bukan stok sekarang. Stok berjalan = saldo awal + seluruh
   masuk/keluar sesudahnya, jadi transaksi yang sudah tercatat tidak hilang
   ketika angka pembukaan akhirnya diisi.

   Menyimpan ulang mengganti baris AWAL yang lama (lihat api-server.js), jadi
   salah ketik cukup diperbaiki dengan menyimpan lagi. */
function FormSaldoAwal({ produk, getStok, submit, online, say, close }) {
  const { t } = useLang();
  const [gudang, setGudang] = useState("");
  const [tgl, setTgl] = useState(today());
  const [cari, setCari] = useState("");
  const [awal, setAwal] = useState(null);   // { [produk]: qty } dari server
  const [isi, setIsi] = useState({});       // yang sedang diketik
  const [catatan, setCatatan] = useState("");

  // Baris AWAL yang sudah ada dibaca ulang tiap ganti gudang supaya kolom
  // menampilkan angka pembukaan yang benar-benar tersimpan, bukan stok berjalan.
  useEffect(() => {
    if (!gudang || !online) { setAwal(null); setIsi({}); return; }
    let batal = false;
    setAwal(null);
    api.saldoAwal(gudang)
      .then((rows) => {
        if (batal) return;
        const peta = {};
        for (const r of rows) peta[r.produk] = Number(r.qty);
        setAwal(peta);
        setIsi({});
      })
      .catch((e) => { if (!batal) { setAwal({}); say(e.message, true); } });
    return () => { batal = true; };
  }, [gudang, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = cari.trim().toLowerCase();
  const list = produk.filter((p) =>
    !q || [p.kode, p.nama, p.ukuran].some((v) => String(v ?? "").toLowerCase().includes(q)));

  const nilai = (id) => (isi[id] !== undefined ? isi[id] : awal?.[id] != null ? String(awal[id]) : "");
  // Hanya barang yang angkanya berubah yang dikirim — menghemat baris mutasi
  // dan membuat "simpan" tidak menyentuh barang yang tidak disunting.
  const berubah = Object.entries(isi).filter(([id, v]) => {
    if (v === "") return false;
    const lama = awal?.[id] ?? 0;
    return Number(v) !== Number(lama);
  });

  // Menolkan stok berjalan: stok = saldo awal + seluruh mutasi sesudahnya, jadi
  // saldo awal yang membuat stok jadi 0 adalah (saldo lama − stok berjalan).
  // Nilainya boleh negatif — itu yang menghapus stok yang terlanjur positif,
  // sebagaimana nilai positif menutup stok yang terlanjur minus.
  const nolkan = () => {
    const isiBaru = {};
    for (const p of produk) {
      const lama = awal?.[p.id] ?? 0;
      const target = lama - getStok(gudang, p.id);
      if (target !== lama) isiBaru[p.id] = String(target);
    }
    setIsi((x) => ({ ...x, ...isiBaru }));
    setCari(""); // tampilkan semua baris supaya hasilnya bisa diperiksa dulu
  };

  const simpan = async () => {
    if (!online) return say(t("Saldo awal hanya tersedia saat online."), true);
    if (!gudang) return say(t("Pilih gudang terlebih dahulu."), true);
    if (!berubah.length) return say(t("Tidak ada saldo awal yang diubah."), true);
    const salah = berubah.find(([, v]) => !Number.isFinite(Number(v)));
    if (salah) return say(t("Saldo awal harus berupa angka."), true);
    try {
      await submit({
        gudang, tgl, catatan,
        items: berubah.map(([produk, qty]) => ({ produk, qty: Number(qty) })),
      });
      close();
    } catch (e) { say(e.message, true); }
  };

  return (
    <Modal title={t("Saldo Awal")} close={close} onSave={simpan} wide>
      <p className="mut2">{t("Angka yang diisi adalah stok PEMBUKAAN. Masuk dan keluar yang sudah tercatat tetap dihitung di atasnya.")}</p>
      <Combo label={t("Gudang")} value={gudang} onChange={setGudang} placeholder={t("-- Pilih Gudang --")}
        opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      <label className="fld">
        <span className="lbl">{t("Tanggal")}</span>
        <Tgl value={tgl} onChange={setTgl} />
      </label>
      <label className="fld cari">
        <span className="lbl">{t("Cari")}</span>
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder={t("Kode / nama / ukuran")} />
      </label>

      {gudang && awal !== null && (
        <div className="aksi awal-aksi">
          <button type="button" className="btn sm" onClick={nolkan}>{t("Jadikan stok berjalan 0")}</button>
          <span className="mut2">{t("Hanya gudang yang dipilih. Periksa kolom Saldo Awal sebelum menyimpan.")}</span>
        </div>
      )}

      {!gudang && <Empty id={t("Pilih gudang terlebih dahulu.")} />}
      {gudang && awal === null && <Empty id={t("Memuat…")} />}
      {gudang && awal !== null && (
        <Scroll max={320}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Kode")}</th>
                <th scope="col">{t("Nama Barang")}</th>
                <th scope="col" className="r">{t("Stok Berjalan")}</th>
                <th scope="col" className="r">{t("Saldo Awal")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><span className="chip">{p.kode}</span></td>
                  <td>{p.nama}</td>
                  <td className="r n mut">{fmt(getStok(gudang, p.id))}</td>
                  <td className="r">
                    <input className="qty" type="number" inputMode="numeric" value={nilai(p.id)}
                      aria-label={t("Saldo awal {nama}", { nama: p.nama })}
                      onChange={(e) => setIsi((x) => ({ ...x, [p.id]: e.target.value }))} />
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={4}><Empty id={t("Tidak ditemukan")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      )}
      <Inp label={t("Catatan")} value={catatan} onChange={setCatatan} />
      <div className="delta">{t("{n} barang akan disimpan", { n: berubah.length })}</div>
    </Modal>
  );
}

function DetailProduk({ p, getStok, stokTotal, close }) {
  const { t } = useLang();
  const box = useDialog(close);
  const judul = useId();
  const tot = stokTotal(p.id);

  return (
    <div className="ov" onClick={close}>
      <div className="md" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{p.nama} <em>{p.kode}</em></h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">
          <div className="spec-info">
            <div><span className="lbl2">{t("Kategori")}</span><b>{t(KATEGORI[p.kategori].id)}</b></div>
            <div><span className="lbl2">{t("Ukuran")}</span><b>{p.ukuran || "-"}</b></div>
            <div><span className="lbl2">{t("Pola")}</span><b>{p.pola || "-"}</b></div>
            <div><span className="lbl2">{t("Grade")}</span><b>{p.grade || "-"}</b></div>
            <div><span className="lbl2">{t("Merek")}</span><b>{p.merek || "-"}</b></div>
            <div><span className="lbl2">{t("Satuan")}</span><b>{p.satuan}</b></div>
          </div>

          <div className="kpis">
            <Kpi label={t("Harga Beli")} val={rp(p.hpp)} sub={t("harga pokok")} />
            <Kpi label={t("Harga Agen")} val={rp(p.harga)} sub={t("harga jual agen")} />
            <Kpi label={t("Harga User")} val={p.hargaUser != null ? rp(p.hargaUser) : "—"} sub={t("harga jual pengguna akhir")} />
          </div>

          <h4 className="mut2">{t("Stok per Gudang")}</h4>
          <Scroll max={220}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("Gudang")}</th>
                  <th scope="col" className="r">{t("Qty")}</th>
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
                  <td className="strong">{t("Total")}</td>
                  <td className={"r n strong " + (tot < p.min ? "bad" : "")}>{fmt(tot)} / {fmt(p.min)} {p.satuan}</td>
                </tr>
              </tbody>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          <button className="btn pri" onClick={close}>{t("Tutup")}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ PENJUALAN ============================ */
function Penjualan({ penjualan, doCreatePenjualan, pelanggan, produk, pById, cById, gById, totalSO, majuSO, mundurSO, getStok, piutang, say, can, minta, doDeletePenjualan }) {
  const { t, lang } = useLang();
  const [rinci, setRinci] = useState(null); // penjualan yang rinciannya dibuka
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
      [t("No."), t("Tanggal"), t("Pelanggan"), t("PIC"), t("Kota"), t("Gudang"), t("Status"), t("Rincian"), t("Total")],
      ...list.map((s) => [
        s.no, s.tgl, cById(s.pelanggan).nama, cById(s.pelanggan).pic, cById(s.pelanggan).kota, gById(s.gudang).kode,
        t(SO_LABEL[s.status].id),
        s.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", "),
        totalSO(s),
      ]),
    ];
    downloadXlsx(`penjualan_${today()}`, "Penjualan", aoa);
  };

  return (
    <>
      <SectionTitle id={t("Penjualan")}
        mid={
          <div className="filters">
            <label className="fld">
              <span className="lbl">{t("Dari")}</span>
              <Tgl value={dari} onChange={setDari} max={sampai || undefined} />
            </label>
            <label className="fld">
              <span className="lbl">{t("Sampai")}</span>
              <Tgl value={sampai} onChange={setSampai} min={dari || undefined} />
            </label>
            <label className="fld cari">
              <span className="lbl">{t("Pelanggan")}</span>
              <input type="search" value={cust} onChange={(e) => setCust(e.target.value)} placeholder={t("Cari nama pelanggan")} />
            </label>
            {filterAktif && <button className="btn sm" onClick={() => { setDari(""); setSampai(""); setCust(""); }}>{t("Reset Filter")}</button>}
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri" onClick={() => setBuka(true)}>{t("+ Penjualan Baru")}</button>
      </SectionTitle>

      {filterAktif && (
        <div className="kpis">
          <Kpi label={t("Transaksi")} val={fmt(ringkasan.jumlah)} sub={t("pada filter ini")} />
          <Kpi label={t("Jumlah Qty")} val={`${fmt(ringkasan.qty)} pcs`} sub={t("total kuantitas terfilter")} />
          <Kpi label={t("Total Nilai")} val={rp(ringkasan.total)} sub={t("total penjualan terfilter")} />
        </div>
      )}

      {grup.length === 0 && (
        <Card><Empty id={filterAktif ? t("Tidak ada transaksi pada filter ini.") : t("Belum ada transaksi penjualan.")} /></Card>
      )}

      {grup.map(({ tgl, rows, total, qty }) => {
        const on = terbuka.has(tgl);
        return (
          <Card key={tgl}>
            <button type="button" className="card-hd acc-hd" aria-expanded={on} onClick={() => toggle(tgl)}>
              <span className="acc-chev">{on ? "▾" : "▸"}</span>
              <span className="acc-tgl">{tglPanjang(tgl, lang)}</span>
              <span className="acc-sub">{t("{n} transaksi · {q} pcs · {v}", { n: rows.length, q: fmt(qty), v: rp(total) })}</span>
            </button>
            {on && (
              <Scroll>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("No.")}</th>
                      <th scope="col">{t("Pelanggan")}</th>
                      <th scope="col">{t("Gudang")}</th>
                      <th scope="col">{t("Rincian")}</th>
                      <th scope="col" className="r">{t("Total")}</th>
                      <th scope="col">{t("Status")}</th>
                      <th scope="col" className="r">{t("Aksi")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td className="n strong">{s.no}</td>
                        <td>{cById(s.pelanggan).nama}<em className="mut2">{t("Grade {g}", { g: cById(s.pelanggan).grade })}</em></td>
                        <td><span className="chip">{gById(s.gudang).kode}</span></td>
                        <td className="mut">
                          {/* tombol, bukan sel yang bisa diklik: tetap terjangkau lewat keyboard */}
                          <button type="button" className="namelink" title={t("Lihat rincian")} onClick={() => setRinci(s)}>
                            {s.items.map((i, k) => (
                              <div key={k}>{pById(i.produk).kode} × {fmt(i.qty)}</div>
                            ))}
                          </button>
                        </td>
                        <td className="r n strong">{rp(totalSO(s))}</td>
                        <td><Status s={s.status} map={SO_LABEL} /></td>
                        <td className="r">
                          <div className="aksi">
{/* mundur hanya setelah 'kirim' — membetulkan salah tandai pembayaran */}
                            {SO_FLOW.indexOf(s.status) > SO_FLOW.indexOf("kirim") && (
                              <button className="btn sm" title={t("Kembalikan status satu langkah")} onClick={() => mundurSO(s)}>
                                ← {t(SO_LABEL[SO_FLOW[SO_FLOW.indexOf(s.status) - 1]].id)}
                              </button>
                            )}
                            {s.status !== "lunas" ? (
                              <button className="btn sm" onClick={() => majuSO(s)}>
                                → {t(SO_LABEL[SO_FLOW[SO_FLOW.indexOf(s.status) + 1]].id)}
                              </button>
                            ) : <span className="mut">{t("selesai")}</span>}
                            <button className="btn sm" title={t("Cetak dokumen")} onClick={() => setDok(s)}>{t("Cetak")}</button>
                            {can("delete") && (
                              <button className="btn sm danger" title={t("Hapus")}
                                onClick={() => minta(t("Hapus penjualan {no}? Data & mutasi stoknya ikut terhapus.", { no: s.no }), () => doDeletePenjualan(s))}>{t("Hapus")}</button>
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
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)} onCetak={() => { setDok(rinci); setRinci(null); }} />
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

/* Rincian satu penjualan: layar tabel hanya memuat kode & qty, sedangkan harga
   satuan dan subtotal per baris baru terbaca di sini — tanpa harus membuka
   dokumen cetak yang formatnya untuk pelanggan, bukan untuk petugas. */
function RincianPenjualan({ so, pById, cById, gById, totalSO, close, onCetak }) {
  const { t, lang } = useLang();
  const box = useDialog(close);
  const judul = useId();
  const c = cById(so.pelanggan);
  const total = totalSO(so);
  const qty = so.items.reduce((a, i) => a + i.qty, 0);

  return (
    <div className="ov" onClick={close}>
      <div className="md wide" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{so.no} <em>{tglPanjang(so.tgl, lang)}</em></h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">
          <div className="cust-info">
            <div><span className="lbl2">{t("Pelanggan")}</span><b>{c.nama}</b></div>
            <div><span className="lbl2">{t("PIC")}</span><b>{c.pic || "-"}</b></div>
            <div><span className="lbl2">{t("Gudang")}</span><b>{gById(so.gudang).nama}</b></div>
            <div><span className="lbl2">{t("Status")}</span><Status s={so.status} map={SO_LABEL} /></div>
            <div><span className="lbl2">{t("Termin")}</span><b>{t("{n} hari", { n: c.termin })}</b></div>
            <div><span className="lbl2">{t("Jatuh Tempo")}</span><b>{addDays(so.tgl, Number(c.termin) || 30)}</b></div>
          </div>

          <Scroll max={300}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("Produk")}</th>
                  <th scope="col" className="r">{t("Qty")}</th>
                  <th scope="col" className="r">{t("Harga")}</th>
                  <th scope="col" className="r">{t("Subtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {so.items.map((i, k) => {
                  const pr = pById(i.produk);
                  return (
                    <tr key={k}>
                      <td><span className="chip">{pr.kode}</span><em className="mut2">{pr.nama}</em></td>
                      <td className="r n">{fmt(i.qty)}</td>
                      <td className="r n mut">{rp(i.harga)}</td>
                      <td className="r n strong">{rp(i.qty * i.harga)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="tf-total">
                  <td><b>{t("Total")}</b></td>
                  <td className="r n strong">{fmt(qty)}</td>
                  <td />
                  <td className="r n strong">{rp(total)}</td>
                </tr>
              </tfoot>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          {onCetak && <button className="btn" onClick={onCetak}>{t("Cetak")}</button>}
          <button className="btn pri" onClick={close}>{t("Tutup")}</button>
        </div>
      </div>
    </div>
  );
}

function DokumenPenjualan({ so, pById, cById, gById, totalSO, close }) {
  const { t } = useLang();
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
            <button className={"btn sm" + (!isFaktur ? " pri" : "")} onClick={() => setJenis("penawaran")}>{t("Penawaran|dok")}</button>
            <button className={"btn sm" + (isFaktur ? " pri" : "")} onClick={() => setJenis("faktur")}>{t("Faktur")}</button>
          </div>
          <div className="doc-firm">
            <span className="doc-firm-lbl">{t("Penerbit")}</span>
            {Object.entries(PENERBIT).map(([k, v]) => (
              <button key={k} className={"btn sm" + (terbit === k ? " pri" : "")} onClick={() => setTerbit(k)}>
                {v.nama}
              </button>
            ))}
          </div>
          <div className="doc-bar-r">
            <button className="btn pri" onClick={() => window.print()}>⎙ {t("Cetak")}</button>
            <button className="x" onClick={close} aria-label={t("Tutup dokumen")}>×</button>
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
                <p>{[c.alamat, c.kota].filter(Boolean).join(", ") || "-"}</p>
                <p>{[c.pic, c.telp].filter(Boolean).join(" · ") || "-"}</p>
                {c.npwp && <p>NPWP: {c.npwp}</p>}
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
  const { t } = useLang();
  const jadi = produk.filter((p) => ["jadi", "jasa"].includes(p.kategori));
  const [f, setF] = useState({ pelanggan: "", gudang: "", tgl: today() });
  const [items, setItems] = useState([{ produk: "", qty: "", harga: "" }]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const ubah = (i, k, v) => setItems((l) => l.map((x, n) => {
    if (n !== i) return x;
    const y = { ...x, [k]: v };
    if (k === "produk") y.harga = (jadi.find((p) => p.id === v) || {}).harga ?? "";
    return y;
  }));
  const total = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);
  const c = pelanggan.find((p) => p.id === f.pelanggan) || {};
  const sisaLimit = (c.limit || 0) - piutang(c.id) - total;
  /* baris yang qty-nya melebihi stok gudang pengirim — masih boleh disimpan
     sebagai penawaran, tapi pengiriman akan ditolak sampai stok mencukupi. */
  const lebihStok = items.filter((i) => Number(i.qty) > 0 && Number(i.qty) > getStok(f.gudang, i.produk));

  const kirim = async () => {
    if (!f.pelanggan) return say(t("Pilih pelanggan terlebih dahulu."), true);
    if (!f.gudang) return say(t("Pilih gudang pengirim terlebih dahulu."), true);
    const salah = items.find((i) => String(i.qty).trim() !== "" && !(Number(i.qty) > 0));
    if (salah) return say(t("Qty harus berupa angka lebih besar dari 0."), true);
    const valid = items.filter((i) => Number(i.qty) > 0);
    if (!valid.length) return say(t("Tambahkan minimal satu baris barang."), true);
    if (valid.some((i) => !i.produk)) return say(t("Pilih barang untuk setiap baris."), true);
    if (valid.some((i) => !(Number(i.harga) >= 0))) return say(t("Harga harus berupa angka."), true);
    if (sisaLimit < 0) return say(t("Melebihi limit kredit {nama} sebesar {v}.", { nama: c.nama, v: rp(-sisaLimit) }), true);
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
    <Modal title={t("Penjualan Baru")} close={close} onSave={kirim} wide saveLabel={t("Simpan Penawaran")}>
      <div className="row2">
        <Combo label={t("Pelanggan")} value={f.pelanggan} onChange={set("pelanggan")} placeholder={t("-- Pilih Pelanggan --")} opts={pelanggan.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
        <Combo label={t("Gudang Pengirim")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      </div>

      <div className="lbl mt">{t("Rincian Barang")}</div>
      {items.map((it, i) => {
        const ada = getStok(f.gudang, it.produk);
        const kurang = it.produk && Number(it.qty) > ada;
        return (
          <div className="line" key={i}>
            <Combo bare ariaLabel={t("Barang baris {i}", { i: i + 1 })} value={it.produk} onChange={(v) => ubah(i, "produk", v)}
              placeholder={t("-- Pilih Barang --")} opts={jadi.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
            <input type="number" min="0" inputMode="numeric" placeholder={t("Qty")} aria-label={t("Jumlah baris {i}", { i: i + 1 })}
              aria-invalid={kurang || undefined} value={it.qty} onChange={(e) => ubah(i, "qty", e.target.value)} className={kurang ? "err" : ""} />
            <input type="number" min="0" inputMode="numeric" placeholder={t("Harga")} aria-label={t("Harga baris {i}", { i: i + 1 })}
              value={it.harga} onChange={(e) => ubah(i, "harga", e.target.value)} title={rp(it.harga)} />
            <span className={"stokinfo" + (kurang ? " bad" : "")}>{it.produk ? t("stok {n}", { n: fmt(ada) }) : ""}</span>
            <button className="x" aria-label={t("Hapus baris {i}", { i: i + 1 })} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1}>×</button>
          </div>
        );
      })}
      <button className="btn sm" onClick={() => setItems((l) => [...l, { produk: "", qty: "", harga: "" }])}>{t("+ Tambah Baris")}</button>

      {lebihStok.length > 0 && (
        <p className="peringatan" role="status">
          {t("{n} baris melebihi stok di {g}. Masih bisa disimpan sebagai penawaran, tetapi status {s} akan ditolak sampai stok mencukupi.",
            { n: lebihStok.length, g: (GUDANG.find((x) => x.id === f.gudang) || {}).nama, s: t(SO_LABEL.kirim.id) })}
        </p>
      )}

      <div className="sum">
        <div><span>{t("Total")}</span><b className="n">{rp(total)}</b></div>
        <div><span>{t("Sisa Limit Kredit")}</span><b className={"n " + (sisaLimit < 0 ? "bad" : "ok")}>{rp(sisaLimit)}</b></div>
      </div>
      {sisaLimit < 0 && (
        <p className="peringatan bad-box" role="status">
          {t("Melebihi limit kredit {nama} sebesar {v} — penawaran tidak bisa disimpan.", { nama: c.nama, v: rp(-sisaLimit) })}
        </p>
      )}
    </Modal>
  );
}

/* ============================ PEMBELIAN ============================ */
function Pembelian({ pembelian, doCreatePembelian, pemasok, produk, pById, sById, gById, majuPO, mundurPO, say, can, minta, doDeletePembelian }) {
  const { t, lang } = useLang();
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
      [t("No."), t("Tanggal"), t("Pemasok"), t("Gudang Tujuan"), t("Status"), t("Rincian"), t("Total")],
      ...list.map((p) => [
        p.no, p.tgl, sById(p.pemasok).nama, gById(p.gudang).nama, t(PO_LABEL[p.status].id),
        p.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", "),
        tot(p),
      ]),
    ];
    downloadXlsx(`pembelian_${today()}`, "Pembelian", aoa);
  };

  return (
    <>
      <SectionTitle id={t("Pembelian")}
        mid={
          <div className="filters">
            <label className="fld">
              <span className="lbl">{t("Dari")}</span>
              <Tgl value={dari} onChange={setDari} max={sampai || undefined} />
            </label>
            <label className="fld">
              <span className="lbl">{t("Sampai")}</span>
              <Tgl value={sampai} onChange={setSampai} min={dari || undefined} />
            </label>
            {filterAktif && <button className="btn sm" onClick={() => { setDari(""); setSampai(""); }}>{t("Reset Filter")}</button>}
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri"
          onClick={() => {
            if (!produk.some((p) => ["casing", "bahan"].includes(p.kategori)))
              return say(t("Belum ada barang casing/bahan baku di katalog. Tambahkan dulu ke tabel produk."), true);
            setBuka(true);
          }}>{t("+ Pembelian Baru")}</button>
      </SectionTitle>

      <div className="grid3">
        {["casing", "bahan"].map((j) => {
          const n = list.filter((p) => p.items.some((i) => (pById(i.produk).kategori) === j));
          return (
            <Kpi key={j} label={t("Pembelian {kategori}", { kategori: t(KATEGORI[j].id) })}
              val={rp(n.reduce((a, p) => a + tot(p), 0))} sub={t("{n} transaksi", { n: n.length })} />
          );
        })}
        <Kpi label={t("Utang Berjalan")}
          val={rp(list.filter((p) => p.status === "diterima").reduce((a, p) => a + tot(p), 0))}
          sub={t("sudah diterima, belum dibayar")}
          tone="warn" />
      </div>

      <Card title={t("Pembelian per Bulan")}>
        <Scroll max={220}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Bulan")}</th>
                <th scope="col" className="r">{t("Transaksi")}</th>
                <th scope="col" className="r">{t("Qty")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
              </tr>
            </thead>
            <tbody>
              {beliBulanan.map((b) => (
                <tr key={b.bulan}>
                  <td>{bulanLabel(b.bulan, lang)}</td>
                  <td className="r n">{fmt(b.n)}</td>
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n">{rp(b.nilai)}</td>
                </tr>
              ))}
              {beliBulanan.length === 0 && <tr><td colSpan={4}><Empty id={t("Belum ada pembelian.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("No.")}</th>
                <th scope="col">{t("Tanggal")}</th>
                <th scope="col">{t("Pemasok")}</th>
                <th scope="col">{t("Gudang Tujuan")}</th>
                <th scope="col">{t("Rincian")}</th>
                <th scope="col" className="r">{t("Total")}</th>
                <th scope="col">{t("Status")}</th>
                <th scope="col" className="r">{t("Aksi")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="n strong">{p.no}</td>
                  <td className="n">{p.tgl}</td>
                  <td>{sById(p.pemasok).nama}<em className="mut2">{KATEGORI[sById(p.pemasok).jenis] ? t(KATEGORI[sById(p.pemasok).jenis].id) : ""}</em></td>
                  <td><span className="chip">{gById(p.gudang).kode}</span></td>
                  <td className="mut">{p.items.map((i, k) => <div key={k}>{pById(i.produk).kode} × {fmt(i.qty)} {pById(i.produk).satuan}</div>)}</td>
                  <td className="r n strong">{rp(tot(p))}</td>
                  <td><Status s={p.status} map={PO_LABEL} /></td>
                  <td className="r">
                    <div className="aksi">
{/* mundur hanya setelah 'diterima' — membetulkan salah tandai pembayaran */}
                      {PO_FLOW.indexOf(p.status) > PO_FLOW.indexOf("diterima") && (
                        <button className="btn sm" title={t("Kembalikan status satu langkah")} onClick={() => mundurPO(p)}>
                          ← {t(PO_LABEL[PO_FLOW[PO_FLOW.indexOf(p.status) - 1]].id)}
                        </button>
                      )}
                      {p.status !== "lunas" ? (
                        <button className="btn sm" onClick={() => majuPO(p)}>→ {t(PO_LABEL[PO_FLOW[PO_FLOW.indexOf(p.status) + 1]].id)}</button>
                      ) : <span className="mut">{t("selesai")}</span>}
                      {can("delete") && (
                        <button className="btn sm danger" title={t("Hapus")}
                          onClick={() => minta(t("Hapus pembelian {no}? Data & mutasi stoknya ikut terhapus.", { no: p.no }), () => doDeletePembelian(p))}>{t("Hapus")}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8}><Empty id={filterAktif ? t("Tidak ada transaksi pada filter ini.") : t("Belum ada transaksi pembelian.")} /></td></tr>}
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
  const { t } = useLang();
  const beliable = produk.filter((p) => ["casing", "bahan"].includes(p.kategori));
  const [f, setF] = useState({ pemasok: "", gudang: "", tgl: today() });
  const [items, setItems] = useState([{ produk: "", qty: "", harga: "" }]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const ubah = (i, k, v) => setItems((l) => l.map((x, n) => {
    if (n !== i) return x;
    const y = { ...x, [k]: v };
    if (k === "produk") y.harga = (beliable.find((p) => p.id === v) || {}).hpp ?? "";
    return y;
  }));
  const total = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);

  const kirim = async () => {
    if (!f.pemasok) return say(t("Pilih pemasok terlebih dahulu."), true);
    if (!f.gudang) return say(t("Pilih gudang tujuan terlebih dahulu."), true);
    const salah = items.find((i) => String(i.qty).trim() !== "" && !(Number(i.qty) > 0));
    if (salah) return say(t("Qty harus berupa angka lebih besar dari 0."), true);
    const valid = items.filter((i) => Number(i.qty) > 0);
    if (!valid.length) return say(t("Tambahkan minimal satu baris barang."), true);
    if (valid.some((i) => !i.produk)) return say(t("Pilih barang untuk setiap baris."), true);
    if (valid.some((i) => !(Number(i.harga) >= 0))) return say(t("Harga harus berupa angka."), true);
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
    <Modal title={t("Pembelian Baru")} close={close} onSave={kirim} wide saveLabel={t("Simpan Pesanan")}>
      <div className="row2">
        <Combo label={t("Pemasok")} value={f.pemasok} onChange={set("pemasok")} placeholder={t("-- Pilih Pemasok --")} opts={pemasok.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
        <Combo label={t("Gudang Tujuan")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={GUDANG.map((x) => [x.id, `${x.kode} · ${x.nama}`])} />
      </div>
      <div className="lbl mt">{t("Rincian Barang")}</div>
      {items.map((it, i) => (
        <div className="line" key={i}>
          <Combo bare ariaLabel={t("Barang baris {i}", { i: i + 1 })} value={it.produk} onChange={(v) => ubah(i, "produk", v)}
            placeholder={t("-- Pilih Barang --")} opts={beliable.map((p) => [p.id, `${p.kode} — ${p.nama} (${p.satuan})`])} />
          <input type="number" min="0" inputMode="numeric" placeholder={t("Qty")} aria-label={t("Jumlah baris {i}", { i: i + 1 })}
            value={it.qty} onChange={(e) => ubah(i, "qty", e.target.value)} />
          <input type="number" min="0" inputMode="numeric" placeholder={t("Harga")} aria-label={t("Harga baris {i}", { i: i + 1 })}
            value={it.harga} onChange={(e) => ubah(i, "harga", e.target.value)} title={rp(it.harga)} />
          <span className="stokinfo">{produk.find((p) => p.id === it.produk)?.satuan}</span>
          <button className="x" aria-label={t("Hapus baris {i}", { i: i + 1 })} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1}>×</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setItems((l) => [...l, { produk: "", qty: "", harga: "" }])}>{t("+ Tambah Baris")}</button>
      <div className="sum"><div><span>{t("Total")}</span><b className="n">{rp(total)}</b></div></div>
    </Modal>
  );
}

/* ============================ PELANGGAN ============================ */
function Pelanggan({ pelanggan, doCreatePelanggan, doUpdatePelanggan, penjualan, totalSO, piutang, gById, pById, say, can, minta, doDeletePelanggan, online, reload }) {
  const { t } = useLang();
  const [buka, setBuka] = useState(false);
  const [ubah, setUbah] = useState(null);       // pelanggan yang sedang diubah
  const [detail, setDetail] = useState(null);
  const [cari, setCari] = useState("");
  // Usulan limit dimuat terpisah dari /bootstrap: hanya layar ini yang memakainya.
  const [usulan, setUsulan] = useState(null);
  const [usul, setUsul] = useState(null);       // pelanggan yang sedang diusulkan
  const [putusan, setPutusan] = useState(null); // usulan yang sedang diputuskan

  const muatUsulan = async () => {
    if (!online) return setUsulan([]);
    try { setUsulan(await api.listUsulan()); } catch (e) { setUsulan([]); say(e.message, true); }
  };
  useEffect(() => { muatUsulan(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const ajukan = async (u) => {
    if (!online) return say(t("Usulan limit hanya tersedia saat online."), true);
    await api.createUsulan(u); await muatUsulan();
    say(t("Usulan limit dikirim, menunggu persetujuan admin."));
  };
  // Persetujuan mengubah limit di tabel pelanggan, jadi data utama ikut dimuat ulang.
  const putuskan = async (id, hasil, catatan) => {
    if (!online) return say(t("Putusan usulan hanya tersedia saat online."), true);
    await api.putusanUsulan(id, hasil, catatan);
    await Promise.all([muatUsulan(), reload()]);
    say(hasil === "disetujui" ? t("Usulan disetujui, limit kredit diperbarui.") : t("Usulan ditolak."));
  };
  const menunggu = (usulan || []).filter((u) => u.status === "menunggu");
  const omzet = (cid) => penjualan.filter((s) => s.pelanggan === cid && s.status !== "penawaran").reduce((a, s) => a + totalSO(s), 0);
  const list = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return pelanggan;
    return pelanggan.filter((c) =>
      [c.kode, c.nama, c.pemilik, c.pic, c.kota, c.sales].some((v) => (v || "").toLowerCase().includes(q)));
  }, [pelanggan, cari]);

  const unduhExcel = () => {
    const aoa = [
      [t("Kode"), t("Nama"), t("Pemilik"), t("PIC"), t("Telepon"), t("Email"), t("Alamat"), t("Kota"),
       t("NPWP"), t("Sales"), t("Grade"), t("Limit Kredit"), t("Termin (hari)"), t("Piutang"), t("Omzet"), t("Catatan")],
      ...list.map((c) => [
        c.kode, c.nama, c.pemilik, c.pic, c.telp, c.email, c.alamat, c.kota, c.npwp, c.sales,
        c.grade, c.limit, c.termin, piutang(c.id), omzet(c.id), c.catatan,
      ]),
    ];
    downloadXlsx(`pelanggan_${today()}`, "Pelanggan", aoa);
  };

  return (
    <>
      <SectionTitle id={t("Pelanggan")}
        mid={
          <div className="filters">
            <label className="fld cari">
              <span className="lbl">{t("Cari")}</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder={t("Kode / nama / pemilik / PIC / kota / sales")} />
            </label>
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri" onClick={() => setBuka(true)}>{t("+ Pelanggan Baru")}</button>
      </SectionTitle>

      {usulan !== null && (menunggu.length > 0 || can("putusan")) && (
        <Card title={t("Usulan Limit Kredit")}
          note={t("Diajukan oleh petugas, disahkan oleh admin. Limit berubah hanya setelah disetujui.")}>
          <Scroll max={260}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("Pelanggan")}</th>
                  <th scope="col" className="r">{t("Limit Sekarang")}</th>
                  <th scope="col" className="r">{t("Usulan")}</th>
                  <th scope="col" className="r">{t("Termin")}</th>
                  <th scope="col">{t("Alasan")}</th>
                  <th scope="col">{t("Pengaju")}</th>
                  <th scope="col">{t("Status")}</th>
                  <th scope="col" className="r">{t("Aksi")}</th>
                </tr>
              </thead>
              <tbody>
                {(usulan || []).map((u) => (
                  <tr key={u.id}>
                    <td><span className="chip">{u.pelanggan_kode}</span> {u.pelanggan_nama}</td>
                    <td className="r n mut">{rp(Number(u.limit_lama))}</td>
                    <td className="r n strong">{rp(Number(u.limit_baru))}</td>
                    {/* NULL = usulan lama, dibuat sebelum TOP ikut diusulkan. */}
                    <td className="r n mut">
                      {u.termin_baru == null ? "—"
                        : <>{Number(u.termin_lama)} → <b>{t("{n} hari", { n: Number(u.termin_baru) })}</b></>}
                    </td>
                    <td className="mut">{u.alasan || "—"}</td>
                    <td className="mut">{u.pengusul_nama}<em className="mut2">{String(u.diusulkan).slice(0, 10)}</em></td>
                    <td><span className={"role u-" + u.status}>{t(USULAN_LABEL[u.status])}</span></td>
                    <td className="r">
                      {u.status === "menunggu" && can("putusan")
                        ? <button className="btn sm pri" onClick={() => setPutusan(u)}>{t("Putuskan")}</button>
                        : <span className="mut2">{u.penentu_nama || "—"}</span>}
                    </td>
                  </tr>
                ))}
                {(usulan || []).length === 0 && <tr><td colSpan={8}><Empty id={t("Belum ada usulan limit.")} /></td></tr>}
              </tbody>
            </table>
          </Scroll>
        </Card>
      )}

      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Kode")}</th>
                <th scope="col">{t("Pelanggan")}</th>
                <th scope="col">{t("Kota")}</th>
                <th scope="col" className="c">{t("Grade")}</th>
                <th scope="col" className="r">{t("Termin")}</th>
                <th scope="col" className="r">{t("Piutang")}</th>
                <th scope="col" className="r">{t("Limit Kredit")}</th>
                <th scope="col" className="r">{t("Omzet")}</th>
                <th scope="col" className="r">{t("Aksi")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const p = piutang(c.id);
                const lewat = p > c.limit;
                return (
                  <tr key={c.id} className="klik" onClick={() => setDetail(c)}>
                    <td><span className="chip">{c.kode}</span></td>
                    <td>
                      <b>{c.nama}</b>
                      <em className="mut2">{c.pic} · {c.telp}</em>
                    </td>
                    <td className="mut">{c.kota}</td>
                    <td className="c"><span className={"grade g" + c.grade}>{c.grade}</span></td>
                    <td className="r n mut">{t("{n} hari", { n: c.termin })}</td>
                    <td className={"r n strong " + (lewat ? "bad" : "")}>{rp(p)}</td>
                    <td className="r n">{rp(c.limit)}</td>
                    <td className="r n">{rp(omzet(c.id))}</td>
                    {/* tombol tidak boleh ikut membuka detail baris */}
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <div className="aksi">
                        <button className="btn sm" onClick={() => setUsul(c)}>{t("Usul Limit")}</button>
                        {can("delete") && (
                          <button className="btn sm danger" title={t("Hapus")}
                            onClick={() => minta(t("Hapus pelanggan {nama}?", { nama: c.nama }), () => doDeletePelanggan(c))}>{t("Hapus")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={9}><Empty id={cari ? t("Tidak ada pelanggan yang cocok.") : t("Belum ada pelanggan.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {buka && (
        <FormPelanggan close={() => setBuka(false)} say={say} submit={doCreatePelanggan} />
      )}
      {ubah && <FormPelanggan c={ubah} close={() => setUbah(null)} say={say} submit={doUpdatePelanggan} />}
      {usul && <FormUsulLimit c={usul} close={() => setUsul(null)} say={say} submit={ajukan} />}
      {putusan && <FormPutusan u={putusan} close={() => setPutusan(null)} say={say} submit={putuskan} />}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)}
          onUsul={() => { setUsul(detail); setDetail(null); }}
          onUbah={() => { setUbah(detail); setDetail(null); }} />
      )}
    </>
  );
}

/* Satu formulir untuk tambah dan ubah: c terisi berarti mode ubah. Saat ubah,
   limit & termin tidak ditampilkan — keduanya hanya berpindah lewat usulan
   yang disetujui admin, supaya jejak persetujuannya tidak bisa dilewati. */
function FormPelanggan({ c, close, say, submit }) {
  const { t } = useLang();
  const [f, setF] = useState({
    nama: c?.nama || "", pemilik: c?.pemilik || "", pic: c?.pic || "", telp: c?.telp || "",
    email: c?.email || "", alamat: c?.alamat || "", kota: c?.kota || "", npwp: c?.npwp || "",
    sales: c?.sales || "", catatan: c?.catatan || "", grade: c?.grade || "B",
    limit: String(c?.limit ?? 100000000), termin: String(c?.termin ?? 30),
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    if (!f.nama.trim()) return say(t("Nama pelanggan wajib diisi."), true);
    const isi = {
      nama: f.nama.trim(), pemilik: f.pemilik.trim(), pic: f.pic.trim(), telp: f.telp.trim(),
      email: f.email.trim(), alamat: f.alamat.trim(), kota: f.kota.trim(), npwp: f.npwp.trim(),
      sales: f.sales.trim(), catatan: f.catatan.trim(), grade: f.grade,
    };
    try {
      await submit(c
        ? { ...c, ...isi }
        : { id: uid("C"), kode: "PLG-" + String(Math.floor(Math.random() * 900) + 100), ...isi,
            limit: Number(f.limit), termin: Number(f.termin) });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={c ? t("Ubah Pelanggan") : t("Pelanggan Baru")} close={close} onSave={kirim} wide>
      <h4 className="mut2">{t("Identitas Faktur")}</h4>
      <Inp label={t("Nama Perusahaan")} value={f.nama} onChange={set("nama")} />
      <div className="row2">
        <Inp label={t("Pemilik")} value={f.pemilik} onChange={set("pemilik")} hint={t("Nama pemilik/direktur.")} />
        <Inp label={t("NPWP")} value={f.npwp} onChange={set("npwp")} hint={t("Nomor pajak, dicetak di faktur.")} />
      </div>
      <Inp label={t("Alamat")} value={f.alamat} onChange={set("alamat")} hint={t("Alamat penagihan lengkap.")} />
      <div className="row2">
        <Inp label={t("Kota")} value={f.kota} onChange={set("kota")} />
        <Inp label={t("Email")} value={f.email} onChange={set("email")} />
      </div>
      <div className="row2">
        <Inp label={t("PIC")} value={f.pic} onChange={set("pic")} hint={t("Penanggung jawab di tempat pelanggan.")} />
        <Inp label={t("Telepon")} value={f.telp} onChange={set("telp")} />
      </div>

      <h4 className="mut2">{t("Data Penjualan")}</h4>
      <div className="row2">
        <Inp label={t("Sales")} value={f.sales} onChange={set("sales")} hint={t("Petugas penjualan penanggung akun.")} />
        <Sel label={t("Grade")} value={f.grade} onChange={set("grade")} opts={[["A", "A"], ["B", "B"], ["C", "C"]]} />
      </div>
      {c ? (
        <p className="note">
          {t("Limit Kredit")}: <b>{rp(c.limit)}</b> · {t("Termin")}: <b>{t("{n} hari", { n: c.termin })}</b>
          {" — "}{t("Hanya berubah lewat usulan yang disetujui admin.")}
        </p>
      ) : (
        <div className="row2">
          <Inp label={t("Limit Kredit (Rp)")} type="number" value={f.limit} onChange={set("limit")} />
          <Inp label={t("Termin (hari)")} type="number" value={f.termin} onChange={set("termin")} />
        </div>
      )}
      <Inp label={t("Catatan")} value={f.catatan} onChange={set("catatan")} hint={t("Catatan internal, tidak dicetak.")} />
    </Modal>
  );
}

function DetailPelanggan({ c, penjualan, totalSO, piutang, gById, pById, close, onUsul, onUbah }) {
  const { t } = useLang();
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
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">
          <h4 className="mut2">{t("Identitas Faktur")}</h4>
          <div className="cust-info">
            <div><span className="lbl2">{t("Pemilik")}</span><b>{c.pemilik || "-"}</b></div>
            <div><span className="lbl2">{t("PIC")}</span><b>{c.pic || "-"}</b></div>
            <div><span className="lbl2">{t("Telepon")}</span><b>{c.telp || "-"}</b></div>
            <div><span className="lbl2">{t("Email")}</span><b>{c.email || "-"}</b></div>
            <div><span className="lbl2">{t("NPWP")}</span><b>{c.npwp || "-"}</b></div>
            <div><span className="lbl2">{t("Kota")}</span><b>{c.kota || "-"}</b></div>
            <div className="span3"><span className="lbl2">{t("Alamat")}</span><b>{c.alamat || "-"}</b></div>
          </div>

          <h4 className="mut2">{t("Data Penjualan")}</h4>
          <div className="cust-info">
            <div><span className="lbl2">{t("Sales")}</span><b>{c.sales || "-"}</b></div>
            <div><span className="lbl2">{t("Grade")}</span><span className={"grade g" + c.grade}>{c.grade}</span></div>
            <div><span className="lbl2">{t("Termin")}</span><b>{t("{n} hari", { n: c.termin })}</b></div>
            <div><span className="lbl2">{t("Limit Kredit")}</span><b>{rp(c.limit)}</b></div>
            <div><span className="lbl2">{t("Sisa Limit")}</span><b>{rp(Math.max(0, c.limit - p))}</b></div>
            <div><span className="lbl2">{t("Transaksi Terakhir")}</span><b>{riwayat[0]?.tgl || "-"}</b></div>
            {c.catatan && <div className="span3"><span className="lbl2">{t("Catatan")}</span><b>{c.catatan}</b></div>}
          </div>

          <div className="kpis">
            <Kpi label={t("Piutang")} val={rp(p)} sub={p > c.limit ? t("melebihi limit kredit") : t("belum lunas")} tone={p > c.limit ? "alert" : p > 0 ? "warn" : ""} />
            <Kpi label={t("Omzet")} val={rp(omzet)} sub={t("{n} transaksi", { n: riwayat.length })} />
          </div>

          <h4 className="mut2">{t("Riwayat Transaksi")}</h4>
          <Scroll max={280}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("No.")}</th>
                  <th scope="col">{t("Tanggal")}</th>
                  <th scope="col">{t("Gudang")}</th>
                  <th scope="col">{t("Rincian")}</th>
                  <th scope="col" className="r">{t("Total")}</th>
                  <th scope="col">{t("Status")}</th>
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
                {riwayat.length === 0 && <tr><td colSpan={6}><Empty id={t("Belum ada transaksi.")} /></td></tr>}
              </tbody>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          {onUbah && <button className="btn" onClick={onUbah}>{t("Ubah Pelanggan")}</button>}
          {onUsul && <button className="btn" onClick={onUsul}>{t("Usul Limit Kredit")}</button>}
          <button className="btn pri" onClick={close}>{t("Tutup")}</button>
        </div>
      </div>
    </div>
  );
}

/* Pengajuan limit: siapa pun yang login boleh mengusulkan angkanya; yang
   berlaku tetap limit lama sampai admin memutuskan. */
function FormUsulLimit({ c, close, say, submit }) {
  const { t } = useLang();
  const [f, setF] = useState({ limit: String(c.limit ?? 0), termin: String(c.termin ?? 0), alasan: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    const n = Number(f.limit);
    if (!Number.isFinite(n) || n < 0) return say(t("Limit kredit harus angka nol atau lebih."), true);
    // Termin = TOP, jumlah HARI jatuh tempo, jadi harus bulat. Pecahan hari tidak
    // punya arti di faktur dan membuat umur piutang meleset.
    const hari = Number(f.termin);
    if (!Number.isInteger(hari) || hari < 0) return say(t("Termin harus bilangan bulat nol hari atau lebih."), true);
    // Cukup salah satu yang berubah — usulan TOP saja tetap sah.
    if (n === Number(c.limit) && hari === Number(c.termin))
      return say(t("Limit dan termin sama dengan yang berlaku sekarang."), true);
    try {
      await submit({ pelanggan: c.id, limit: n, termin: hari, alasan: f.alasan.trim() });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Usul Limit Kredit")} close={close} onSave={kirim} saveLabel={t("Ajukan")}>
      <p className="note">{c.kode} · {c.nama}</p>
      <Inp label={t("Limit Kredit Baru (Rp)")} type="number" value={f.limit} onChange={set("limit")}
        hint={t("Limit sekarang: {n}", { n: rp(c.limit) })} />
      <Inp label={t("Termin Baru (hari)")} type="number" value={f.termin} onChange={set("termin")}
        hint={t("Termin sekarang: {n} hari", { n: c.termin })} />
      <Inp label={t("Alasan")} value={f.alasan} onChange={set("alasan")} hint={t("Dibaca admin saat memutuskan.")} />
    </Modal>
  );
}

/* Pengesahan oleh admin — menyetujui sekaligus memasang limit barunya. */
function FormPutusan({ u, close, say, submit }) {
  const { t } = useLang();
  const [f, setF] = useState({ putusan: "disetujui", catatan: "" });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const kirim = async () => {
    try {
      await submit(u.id, f.putusan, f.catatan.trim());
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Putusan Limit Kredit")} close={close} onSave={kirim}>
      <p className="note">{u.pelanggan_kode} · {u.pelanggan_nama}</p>
      <p className="note">
        {rp(Number(u.limit_lama))} → <b>{rp(Number(u.limit_baru))}</b>
        {" · "}{t("Diajukan oleh {u}", { u: u.pengusul_nama })}
      </p>
      {u.termin_baru != null && (
        <p className="note">
          {t("Termin")}: {t("{n} hari", { n: Number(u.termin_lama) })} → <b>{t("{n} hari", { n: Number(u.termin_baru) })}</b>
        </p>
      )}
      {u.alasan && <p className="note">{t("Alasan")}: {u.alasan}</p>}
      <Sel label={t("Putusan")} value={f.putusan} onChange={set("putusan")}
        opts={[["disetujui", t("Setujui")], ["ditolak", t("Tolak")]]} />
      <Inp label={t("Catatan")} value={f.catatan} onChange={set("catatan")} />
    </Modal>
  );
}

/* ============================ PIUTANG ============================ */
function Piutang({ penjualan, cById, totalSO, piutang, gById, pById }) {
  const { t } = useLang();
  const [cari, setCari] = useState("");
  const [detail, setDetail] = useState(null); // pelanggan yang dibuka dari nama
  const [rinci, setRinci] = useState(null);   // penjualan yang dibuka dari nomor
  const [umur, setUmur] = useState(null);     // kelompok umur yang dibuka
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
      [t("No."), t("Pelanggan"), t("Tanggal"), t("Jatuh Tempo"), t("Telat (hari)"), t("Nilai")],
      ...rincian.map((r) => [r.so.no, r.c.nama, r.so.tgl, r.tempo, r.telat, r.nilai]),
    ];
    downloadXlsx(`piutang_${today()}`, "Piutang", aoa);
  };

  return (
    <>
      <SectionTitle id={t("Piutang")} mid={<span className="mut2">{t("acuan: panduan analisis umur piutang")}</span>}>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
      </SectionTitle>

      <div className="kpis">
        <Kpi label={t("Piutang Berjalan")} val={rp(piutangF)} sub={t("{n} invoice belum lunas", { n: fmt(piutangRows.length) })} tone={piutangF > 0 ? "warn" : ""} />
        <Kpi label={t("Piutang > 90 Hari")} val={rp(piutang90)} sub={t("{p}% dari piutang berjalan", { p: fmt(rasio90) })} tone={piutang90 > 0 ? "alert" : ""} />
        <Kpi label={t("Pelanggan Berpiutang")} val={fmt(topPelanggan.length)} sub={t("pelanggan dengan tagihan berjalan")} />
      </div>

      <SectionTitle id={t("Umur Piutang (Aging)")} />
      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Umur")}</th>
                <th scope="col" className="r">{t("Invoice")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
                <th scope="col" className="r">{t("Porsi")}</th>
              </tr>
            </thead>
            <tbody>
              {agingRows.map((r) => (
                /* kelompok kosong tidak bisa dibuka: dialog tanpa isi hanya menipu */
                <tr key={r.k} className={r.n ? "klik" : ""} onClick={r.n ? () => setUmur(r) : undefined}>
                  <td className={r.k === "90180" || r.k === "180" ? "bad strong" : r.k === "3060" || r.k === "6090" ? "warn" : ""}>
                    {r.n
                      ? <button type="button" className="namelink" title={t("Lihat rincian")}>{t(r.label)}</button>
                      : t(r.label)}
                  </td>
                  <td className="r n">{fmt(r.n)}</td>
                  <td className="r n">{rp(r.nilai)}</td>
                  <td className="r n">{piutangF ? fmt((r.nilai / piutangF) * 100) : 0}%</td>
                </tr>
              ))}
              {piutangRows.length === 0 && <tr><td colSpan={4}><Empty id={t("Tidak ada piutang berjalan.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <SectionTitle id={t("Pelanggan Berisiko")}
        mid={
          <div className="filters">
            <label className="fld cari">
              <span className="lbl">{t("Cari")}</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder={t("Nama pelanggan")} />
            </label>
          </div>
        } />
      <Card>
        {berisiko.length === 0 ? (
          <Empty id={cari ? t("Tidak ada pelanggan yang cocok.") : t("Tidak ada piutang berjalan.")} />
        ) : (
          <Scroll>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("Pelanggan")}</th>
                  <th scope="col" className="r">{t("Piutang")}</th>
                  <th scope="col" className="r">{t("Telat")}</th>
                  <th scope="col" className="r">{t("Pakai Limit")}</th>
                  <th scope="col">{t("Grade")}</th>
                </tr>
              </thead>
              <tbody>
                {berisiko.map((x) => {
                  const [label, tone] = gradePiutang(x);
                  return (
                    <tr key={x.c.id}>
                      <td>
                        <button type="button" className="namelink" onClick={() => setDetail(x.c)}>{x.c.nama}</button>
                      </td>
                      <td className="r n">{rp(x.nilai)}</td>
                      <td className={"r n " + (x.telat > 90 ? "bad" : x.telat > 30 ? "warn" : "")}>{x.telat > 0 ? t("{n} hr", { n: fmt(x.telat) }) : "—"}</td>
                      <td className="r n">{x.c.limit ? `${fmt(x.pakai)}%` : "—"}</td>
                      <td><span className={"st s-" + tone}>{t(label)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
        )}
      </Card>

      <SectionTitle id={t("Rincian Invoice")} />
      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("No.")}</th>
                <th scope="col">{t("Pelanggan")}</th>
                <th scope="col">{t("Tanggal")}</th>
                <th scope="col">{t("Jatuh Tempo")}</th>
                <th scope="col" className="r">{t("Telat")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
              </tr>
            </thead>
            <tbody>
              {rincian.map((r) => (
                <tr key={r.so.id}>
                  <td className="n strong">
                    <button type="button" className="namelink" title={t("Lihat rincian")} onClick={() => setRinci(r.so)}>{r.so.no}</button>
                  </td>
                  <td>
                    <button type="button" className="namelink" onClick={() => setDetail(r.c)}>{r.c.nama}</button>
                    <em className="mut2">{t("Grade {g}", { g: r.c.grade })}</em>
                  </td>
                  <td className="n">{r.so.tgl}</td>
                  <td className="n">{r.tempo}</td>
                  <td className={"r n " + (r.telat > 90 ? "bad" : r.telat > 30 ? "warn" : "")}>{r.telat > 0 ? t("{n} hr", { n: fmt(r.telat) }) : "—"}</td>
                  <td className="r n strong">{rp(r.nilai)}</td>
                </tr>
              ))}
              {rincian.length === 0 && <tr><td colSpan={6}><Empty id={t("Tidak ada piutang berjalan.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {/* tanpa onUsul/onUbah: pengajuan limit tetap di layar pelanggan */}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)} />
      )}
      {umur && (
        <DaftarUmur label={t(umur.label)} rows={piutangRows.filter((r) => r.bucket === umur.k)}
          close={() => setUmur(null)} onPilih={(so) => { setRinci(so); setUmur(null); }} />
      )}
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)} />
      )}
    </>
  );
}

/* Daftar invoice satu kelompok umur. Tabel aging hanya memberi jumlah dan
   nilai; pertanyaan berikutnya selalu "invoice mana", dan tanpa ini jawabannya
   harus dicari sendiri di tabel rincian di bawahnya. */
function DaftarUmur({ label, rows, close, onPilih }) {
  const { t } = useLang();
  const box = useDialog(close);
  const judul = useId();
  const total = rows.reduce((a, r) => a + r.nilai, 0);

  return (
    <div className="ov" onClick={close}>
      <div className="md wide" ref={box} role="dialog" aria-modal="true" aria-labelledby={judul} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{t("Rincian Invoice")} <em>{label}</em></h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">
          <Scroll max={340}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("No.")}</th>
                  <th scope="col">{t("Pelanggan")}</th>
                  <th scope="col">{t("Tanggal")}</th>
                  <th scope="col">{t("Jatuh Tempo")}</th>
                  <th scope="col" className="r">{t("Telat")}</th>
                  <th scope="col" className="r">{t("Nilai")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.so.id} className="klik" onClick={() => onPilih(r.so)}>
                    <td className="n strong">
                      <button type="button" className="namelink" title={t("Lihat rincian")}>{r.so.no}</button>
                    </td>
                    <td>{r.c.nama}<em className="mut2">{t("Grade {g}", { g: r.c.grade })}</em></td>
                    <td className="n">{r.so.tgl}</td>
                    <td className="n">{r.tempo}</td>
                    <td className={"r n " + (r.telat > 90 ? "bad" : r.telat > 30 ? "warn" : "")}>
                      {r.telat > 0 ? t("{n} hr", { n: fmt(r.telat) }) : "—"}
                    </td>
                    <td className="r n strong">{rp(r.nilai)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tf-total">
                  <td colSpan={5}><b>{t("Total")}</b></td>
                  <td className="r n strong">{rp(total)}</td>
                </tr>
              </tfoot>
            </table>
          </Scroll>
        </div>
        <div className="md-ft">
          <button className="btn pri" onClick={close}>{t("Tutup")}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ UI ============================ */
/* Logo Ascendo — aset resmi di public/. Dipakai untuk identitas aplikasi
   (header & layar masuk) saja. JANGAN dipasang di kop dokumen cetak:
   penerbit faktur adalah CV. Sinar Perkasa Ban / PT. Daimond Fajar Jaya. */
function AscendoMark({ size = 34 }) {
  return (
    <img className="mark" src="/ascendo-symbol.png" alt="" aria-hidden="true"
      width={size} height={Math.round((size * 196) / 200)} />
  );
}

/* kop dokumen cetak memakai mark netral, bukan logo Ascendo */
function TreadMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="mark">
      <rect width="34" height="34" rx="4" fill="var(--asm-primary)" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={r + "-" + c} x={5 + c * 6.5} y={5 + r * 8} width={4.5} height={5.5} rx="1"
            fill={r === 1 ? "var(--asm-white)" : "var(--asm-primary-40)"} opacity={r === 1 ? 1 : 0.9} />
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

/* "Keluar|mutasi" diberi konteks karena "Keluar" di header berarti logout */
/* "awal" bukan nilai kolom tipe — baris ref='AWAL' ditampilkan tersendiri
   supaya stok pembukaan tidak terbaca sebagai hasil stok opname. */
const TIPE_LABEL = { masuk: "Masuk", keluar: "Keluar|mutasi", transfer: "Transfer", penyesuaian: "Penyesuaian", awal: "Saldo Awal" };
const Tag = ({ t: tipe }) => {
  const { t } = useLang();
  return <span className={"tag t-" + tipe}>{tipe ? t(TIPE_LABEL[tipe] || tipe) : "—"}</span>;
};

const Status = ({ s, map }) => {
  const { t } = useLang();
  return <span className={"st s-" + s}>{map[s]?.id ? t(map[s].id) : s || "—"}</span>;
};

/* Kolom tanggal. Peramban mengambil teks penuntun kolom KOSONG ("hh/bb/tttt")
   dari bahasa antarmukanya sendiri, bukan dari atribut lang — jadi di Chrome
   berbahasa Korea layar Indonesia pun menampilkan "연도. 월. 일.". Atribut lang
   tetap dipasang karena itu yang menentukan urutan hh/bb/tttt setelah terisi;
   penuntun bawaannya disembunyikan saat kosong dan digantikan penuntun kita
   sendiri yang mengikuti bahasa aplikasi. */
const Tgl = ({ value, onChange, min, max }) => {
  const { lang, t } = useLang();
  return (
    <span className={"tgl" + (value ? "" : " kosong")}>
      <input type="date" lang={lang === "ko" ? "ko-KR" : "id-ID"} value={value}
        onChange={(e) => onChange(e.target.value)} min={min} max={max} />
      {!value && <span className="tgl-ph" aria-hidden="true">{t("hh/bb/tttt")}</span>}
    </span>
  );
};

const Inp = ({ label, value, onChange, type = "text", hint, disabled }) => (
  <label className="fld">
    <span className="lbl">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    {hint && <span className="hint">{hint}</span>}
  </label>
);

const Sel = ({ label, value, onChange, opts, placeholder, hint, disabled }) => (
  <label className="fld">
    <span className="lbl">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
    {hint && <span className="hint">{hint}</span>}
  </label>
);

/* dropdown pencarian: ketik kata kunci untuk menyaring opsi, klik untuk memilih */
const Combo = ({ label, ariaLabel, value, onChange, opts, placeholder, bare }) => {
  const { t } = useLang();
  const domId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = opts.find(([v]) => v === value);
  const selectedLabel = selected ? selected[1] : "";

  useEffect(() => { if (!open) setQuery(selectedLabel); }, [selectedLabel, open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? opts.filter(([, t]) => t.toLowerCase().includes(q)) : opts;

  const pilih = (v, t) => { onChange(v); setQuery(t); setOpen(false); };

  const body = (
    <div className="combo-wrap">
      <input
        type="text" autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${domId}-list`}
        aria-label={!label ? ariaLabel : undefined} aria-labelledby={label ? `${domId}-lbl` : undefined}
        value={query} placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul className="combo-list" id={`${domId}-list`} role="listbox">
          {filtered.length === 0
            ? <li className="combo-empty">{t("Tidak ditemukan")}</li>
            : filtered.map(([v, t]) => (
              <li key={v} role="option" aria-selected={v === value}
                onMouseDown={(e) => { e.preventDefault(); pilih(v, t); }}>{t}</li>
            ))}
        </ul>
      )}
    </div>
  );

  if (bare) return body;
  return (
    <div className="fld combo">
      {label && <span className="lbl" id={`${domId}-lbl`}>{label}</span>}
      {body}
    </div>
  );
};

const Modal = ({ title, close, onSave, children, wide, saveLabel }) => {
  const { t } = useLang();
  const box = useDialog(close);
  const judul = useId();
  return (
    <div className="ov" onClick={close}>
      <div className={"md" + (wide ? " wide" : "")} ref={box} role="dialog" aria-modal="true" aria-labelledby={judul}
        onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={judul}>{title}</h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">{children}</div>
        <div className="md-ft">
          <button className="btn" onClick={close}>{t("Batal")}</button>
          <button className="btn pri" onClick={onSave}>{saveLabel || t("Simpan")}</button>
        </div>
      </div>
    </div>
  );
};

/* ============================ STYLE ============================ */
function Style() {
  return (
    <style>{`
/* font dimuat dari index.html (preload non-blocking) — jangan @import di sini */

/* ============================================================
   ASCENDO BI — token dasar (ASM 디자인 가이드 v1.0, Bab 11)
   Warna BI tidak boleh diubah: primary #0062C6, dark #333333.
   Nama lama (--slab/--paper/--ink/...) dipertahankan sebagai alias
   agar seluruh aturan di bawah ikut berubah otomatis.
   ============================================================ */
.vk{
  /* BI 지정색 — 변경 금지 */
  --asm-primary:#0062C6; --asm-dark:#333333; --asm-white:#FFFFFF;
  /* perluasan merek */
  --asm-primary-hover:#0053A8; --asm-primary-active:#00458B; --asm-primary-fg:#FFFFFF;
  --asm-primary-6:#F0F6FC; --asm-primary-10:#E6EFF9; --asm-primary-15:#D9E7F6;
  --asm-primary-20:#CCE0F4; --asm-primary-40:#99C0E8;
  /* netral */
  --asm-bg:#F5F5F5; --asm-card:#FFFFFF;
  --asm-fg:#333333; --asm-fg-muted:#666666;
  --asm-secondary:#F3F3F3; --asm-muted:#EBEBEB;
  --asm-border:#D6D6D6; --asm-border-50:#EBEBEB;
  /* status: teks / latar lembut / garis */
  --asm-success:#1E7B34; --asm-success-soft:#E6F4EA; --asm-success-border:#A8D5B3;
  --asm-warning:#8A5A00; --asm-warning-soft:#FFF6E0; --asm-warning-border:#F5D580;
  --asm-danger:#C62828;  --asm-danger-soft:#FCE9E9;  --asm-danger-border:#F0A3A3;
  --asm-info:#0062C6;    --asm-info-soft:#E6EFF9;    --asm-info-border:#99C0E8;
  --asm-neutral:#5F5F5F; --asm-neutral-soft:#EDEDED; --asm-neutral-border:#D6D6D6;
  /* sudut & bayangan */
  --asm-radius-sm:4px; --asm-radius-md:6px; --asm-radius-lg:8px;
  --asm-shadow-md:0 4px 12px rgb(51 51 51 / .12);
  --asm-shadow-lg:0 12px 32px rgb(51 51 51 / .18);

  /* alias lama → token BI */
  --slab:var(--asm-bg); --paper:var(--asm-card); --ink:var(--asm-fg); --rubber:var(--asm-dark);
  --muted:var(--asm-fg-muted); --line:var(--asm-border);
  --ok:var(--asm-success); --warn:var(--asm-warning); --alert:var(--asm-danger);

  --fd:'Noto Sans KR','Noto Sans','Apple SD Gothic Neo',system-ui,sans-serif;
  --fb:'Noto Sans KR','Noto Sans','Apple SD Gothic Neo',system-ui,-apple-system,sans-serif;
  --fm:var(--fb);

  background:var(--asm-bg); color:var(--asm-fg); font-family:var(--fb);
  font-size:14px; line-height:1.5; min-height:100%;
  /* tanpa font mono khusus — perataan angka memakai tabular-nums (Bab 4) */
  font-variant-numeric:tabular-nums;
}
.vk *{box-sizing:border-box}
.vk em{font-style:normal}
.vk h1,.vk h2,.vk h3,.vk h4{font-family:var(--fd); margin:0; font-weight:700; letter-spacing:-.01em}
.vk .n,.vk .num{font-variant-numeric:tabular-nums}
.vk .mut{color:var(--asm-fg-muted)}
.vk .mut2{display:block; color:var(--asm-fg-muted); font-size:11px}
.vk .strong{font-weight:700}
.vk .ok{color:var(--asm-success)} .vk .bad{color:var(--asm-danger)} .vk .warn{color:var(--asm-warning)}
.vk .r{text-align:right}
.vk .c{text-align:center}
.vk ::selection{background:var(--asm-primary-20); color:var(--asm-primary)}

/* header */
.vk .hd{background:var(--asm-card); border-bottom:1px solid var(--asm-border)}
.vk .hd-in{max-width:1240px; margin:0 auto; padding:12px 20px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap}
.vk .brand{display:flex; gap:12px; align-items:center; background:none; border:0; padding:0; margin:0; cursor:pointer; text-align:left; font:inherit; color:inherit}
.vk .mark{flex:none; display:block}
.vk .sig{display:block; height:auto; max-width:100%}
.vk .hd h1{font-size:20px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--asm-primary)}
.vk .hd p{margin:1px 0 0; font-size:12px; color:var(--asm-fg-muted)}
.vk .hd p em{display:block; font-size:11px}
.vk .hd-meta{text-align:right; font-size:12px}
.vk .hd-meta .k{display:block; font-size:11px; font-weight:500; letter-spacing:.06em; color:var(--asm-primary)}
.vk .hd-meta .v{font-size:13px}
.vk .conn{display:inline-block; margin-top:4px; font-size:11px; padding:1px 8px; border:1px solid var(--asm-border); border-radius:var(--asm-radius-sm); color:var(--asm-fg-muted)}
.vk .conn.online{color:var(--asm-success); border-color:var(--asm-success-border); background:var(--asm-success-soft)}
.vk .conn.offline{color:var(--asm-warning); border-color:var(--asm-warning-border); background:var(--asm-warning-soft)}
/* garis aksen merek — 4px, warna utama BI (Bab 11 .asm-accent-bar) */
.vk .accent{height:4px; background:var(--asm-primary)}

/* tabs */
.vk .tabs{max-width:1240px; margin:0 auto; padding:0 12px; display:flex; justify-content:center; gap:2px; overflow-x:auto;
  background:
    linear-gradient(to right, var(--asm-card) 0, var(--asm-card) 0) left / 24px 100%,
    linear-gradient(to left, var(--asm-card) 0, var(--asm-card) 0) right / 24px 100%,
    linear-gradient(to right, rgba(51,51,51,.14), rgba(51,51,51,0) 24px) left / 24px 100%,
    linear-gradient(to left, rgba(51,51,51,.14), rgba(51,51,51,0) 24px) right / 24px 100%;
  background-repeat:no-repeat;
  background-attachment:local, local, scroll, scroll;
}
.vk .tab{background:none; border:0; border-bottom:2px solid transparent; padding:10px 16px; cursor:pointer;
  font-family:var(--fd); font-size:.875rem; font-weight:500; color:var(--asm-fg-muted); white-space:nowrap; margin-bottom:-1px}
.vk .tab em{display:block; font-size:11px; font-weight:400; color:var(--asm-fg-muted)}
.vk .tab:hover{background:var(--asm-secondary); color:var(--asm-fg)}
.vk .tab.on{color:var(--asm-primary); font-weight:700; border-bottom-color:var(--asm-primary)}

.vk .wrap{max-width:1240px; margin:0 auto; padding:24px 20px}

/* section */
.vk .sect{display:flex; justify-content:space-between; align-items:center; gap:16px; margin:4px 0 16px; flex-wrap:wrap}
.vk .sect-l{display:flex; align-items:center; gap:16px; flex-wrap:wrap; min-width:0; flex:1}
.vk .sect h2{font-size:1.125rem; font-weight:700; letter-spacing:-.01em; flex-shrink:0; padding-left:10px; border-left:3px solid var(--asm-primary)}
.vk .sect h2 em{font-size:12px; letter-spacing:0; color:var(--asm-fg-muted); margin-left:8px; font-weight:400}
.vk .acts{display:flex; gap:8px; flex-wrap:wrap}

/* buttons (Bab 11 STEP 2) */
.vk .btn{background:var(--asm-white); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  padding:.5rem 1rem; min-height:36px; cursor:pointer; white-space:nowrap; box-shadow:none;
  font-family:var(--fd); font-size:.875rem; font-weight:500; color:var(--asm-fg);
  transition:color .15s, background-color .15s, border-color .15s}
.vk .btn em{display:block; font-size:10.5px; font-weight:400; color:var(--asm-fg-muted)}
.vk .btn:hover{background:var(--asm-secondary); color:var(--asm-primary); border-color:var(--asm-primary)}
.vk .btn:hover em{color:inherit}
.vk .btn.pri{background:var(--asm-primary); color:var(--asm-primary-fg); border-color:var(--asm-primary)}
.vk .btn.pri em{color:var(--asm-primary-40)}
.vk .btn.pri:hover{background:var(--asm-primary-hover); border-color:var(--asm-primary-hover); color:var(--asm-primary-fg)}
.vk .btn.pri:active{background:var(--asm-primary-active); border-color:var(--asm-primary-active)}
.vk .btn.sm{min-height:30px; padding:.375rem .75rem; font-size:.75rem}
.vk .btn.lg{min-height:40px; padding:.5rem 1.5rem; font-weight:700}
.vk .btn:disabled{opacity:.5; pointer-events:none}
.vk .x{background:none; border:0; font-size:18px; line-height:1; cursor:pointer; color:var(--asm-fg-muted); padding:2px 6px; border-radius:var(--asm-radius-sm)}
.vk .x:hover{color:var(--asm-danger); background:var(--asm-danger-soft)}
.vk .x:disabled{opacity:.25; cursor:not-allowed}
.vk button:focus-visible,.vk input:focus-visible,.vk select:focus-visible{outline:none; box-shadow:0 0 0 3px var(--asm-primary-40)}

/* kpi */
.vk .kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:16px}
.vk .grid3{display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-bottom:16px}
.vk .kpi{background:var(--asm-card); border:1px solid var(--asm-border); border-left:3px solid var(--asm-primary);
  border-radius:var(--asm-radius-lg); padding:12px 14px; container-type:inline-size}
.vk .kpi.warn{border-left-color:var(--asm-warning)}
.vk .kpi.alert{border-left-color:var(--asm-danger)}
.vk .kl{font-size:12px; font-weight:500; color:var(--asm-fg-muted); display:block; margin-bottom:4px}
.vk .kl em{margin-left:6px; font-size:11px; font-weight:400}
.vk .kv{display:block; font-size:clamp(1.15rem, 8cqi, 1.5rem); font-weight:700; line-height:1.2; margin:2px 0 1px;
  font-variant-numeric:tabular-nums; white-space:nowrap; letter-spacing:-.01em}
.vk .ks{font-size:11px; color:var(--asm-fg-muted)}

/* card */
.vk .card{background:var(--asm-card); border:1px solid var(--asm-border); border-radius:var(--asm-radius-lg); margin-bottom:16px}
.vk .card-hd{padding:12px 16px; border-bottom:1px solid var(--asm-border); border-radius:var(--asm-radius-lg) var(--asm-radius-lg) 0 0}
.vk .card-hd h3{font-size:.9375rem; font-weight:700; letter-spacing:-.01em}
.vk .card-hd h3 em{font-size:11.5px; letter-spacing:0; color:var(--asm-fg-muted); margin-left:7px; font-weight:400}
.vk .note{margin:3px 0 0; font-size:11.5px; color:var(--asm-fg-muted)}
.vk .card-bd{padding:0}
.vk .card-bd>.scroll{border-radius:0 0 var(--asm-radius-lg) var(--asm-radius-lg)}
.vk .grid2{display:grid; grid-template-columns:1fr 1fr; gap:16px}
@media (max-width:860px){.vk .grid2{grid-template-columns:1fr}}
/* item grid tidak boleh melebar mengikuti tabel di dalamnya (min-width:auto
   bawaan grid) — inilah penyebab halaman ikut scroll ke samping di layar kecil */
.vk .grid2>*,.vk .grid3>*,.vk .kpis>*,.vk .card{min-width:0}

/* accordion (Penjualan, dikelompokkan per tanggal) */
.vk .card-hd.acc-hd{display:flex; align-items:center; gap:10px; width:100%; background:none; border:0;
  border-bottom:1px solid var(--asm-border); cursor:pointer; text-align:left; font:inherit; color:inherit}
.vk .card-hd.acc-hd:hover{background:var(--asm-primary-6)}
.vk .acc-chev{flex:none; width:12px; font-size:11px; color:var(--asm-fg-muted)}
.vk .acc-tgl{flex:none; font-size:.875rem; font-weight:700}
.vk .acc-sub{flex:1; font-size:12px; color:var(--asm-fg-muted)}

/* table (Bab 11 STEP 3) */
.vk .scroll{overflow:auto; max-width:100%;
  background:
    linear-gradient(to right, var(--asm-card) 0, var(--asm-card) 0) left / 18px 100%,
    linear-gradient(to left, var(--asm-card) 0, var(--asm-card) 0) right / 18px 100%,
    linear-gradient(to right, rgba(51,51,51,.12), rgba(51,51,51,0) 18px) left / 18px 100%,
    linear-gradient(to left, rgba(51,51,51,.12), rgba(51,51,51,0) 18px) right / 18px 100%;
  background-repeat:no-repeat;
  background-attachment:local, local, scroll, scroll;
}
.vk .mut-more{display:flex; justify-content:center; padding:10px 0 2px}
.vk .mut-note{text-align:center; font-size:11.5px; color:var(--asm-fg-muted); padding:6px 0 2px}
.vk table{width:100%; border-collapse:collapse; font-size:13px}
.vk thead th{position:sticky; top:0; z-index:2; background:var(--asm-primary-6); color:var(--asm-fg);
  text-align:left; padding:9px 12px; border-bottom:2px solid var(--asm-primary);
  font-family:var(--fd); font-size:12px; font-weight:500; white-space:nowrap}
.vk thead th em{font-size:11px; color:var(--asm-fg-muted); font-weight:400}
.vk tbody td{height:38px; padding:9px 12px; border-bottom:1px solid var(--asm-border-50); vertical-align:middle}
.vk tbody tr:hover{background:var(--asm-primary-6)}
.vk tbody tr.klik{cursor:pointer}
.vk tbody td .mut2{font-size:12px}
.vk tfoot td{padding:9px 12px; border-top:2px solid var(--asm-primary)}
.vk tfoot tr.tf-total td{background:var(--asm-primary-10); color:var(--asm-primary); font-weight:700}
.vk tfoot tr.tf-avg td{border-top:0; padding-top:4px; font-size:12px}
.vk .chip{display:inline-block; font-size:11.5px; font-weight:500; background:var(--asm-primary-10); color:var(--asm-primary);
  padding:1px 8px; border-radius:var(--asm-radius-sm)}

/* tags & status (Bab 11 .asm-badge) */
.vk .tag,.vk .st,.vk .role{display:inline-block; font-family:var(--fd); font-size:11px; font-weight:700; letter-spacing:.04em;
  padding:2px 8px; border:1px solid transparent; border-radius:var(--asm-radius-sm); line-height:1.4; white-space:nowrap;
  background:var(--asm-neutral-soft); color:var(--asm-neutral); border-color:var(--asm-neutral-border)}
.vk .tag em,.vk .st em,.vk .role em{display:block; font-size:9.5px; letter-spacing:0; font-weight:400; opacity:.75}
.vk .t-masuk,.vk .s-lunas,.vk .s-ok{background:var(--asm-success-soft); color:var(--asm-success); border-color:var(--asm-success-border)}
.vk .t-keluar,.vk .s-alert{background:var(--asm-danger-soft); color:var(--asm-danger); border-color:var(--asm-danger-border)}
.vk .t-transfer,.vk .s-pesanan{background:var(--asm-info-soft); color:var(--asm-info); border-color:var(--asm-info-border)}
.vk .t-penyesuaian,.vk .s-kirim,.vk .s-warn{background:var(--asm-warning-soft); color:var(--asm-warning); border-color:var(--asm-warning-border)}
.vk .s-penawaran{background:var(--asm-neutral-soft); color:var(--asm-neutral); border-color:var(--asm-neutral-border)}
/* tagihan = biru penuh, agar jelas berbeda dari "pesanan" yang biru lembut */
.vk .s-tagihan{background:var(--asm-primary); color:var(--asm-primary-fg); border-color:var(--asm-primary)}

/* flow */
.vk .flow{display:flex; align-items:stretch; gap:6px; margin-bottom:16px; overflow-x:auto; padding-bottom:2px}
.vk .step{flex:1; min-width:110px; background:var(--asm-card); border:1px solid var(--asm-border); border-bottom:3px solid var(--asm-border);
  border-radius:var(--asm-radius-md); padding:8px 12px; cursor:pointer; text-align:left; display:flex; justify-content:space-between; align-items:center; gap:8px}
.vk .step span{font-family:var(--fd); font-size:12px; font-weight:500; color:var(--asm-fg-muted)}
.vk .step span em{display:block; font-size:10px; color:var(--asm-fg-muted); font-weight:400}
.vk .step b{font-size:17px; font-weight:700; font-variant-numeric:tabular-nums}
.vk .step:hover{border-color:var(--asm-primary-40)}
.vk .step.on{border-bottom-color:var(--asm-primary); background:var(--asm-primary-10)}
.vk .step.on span,.vk .step.on b{color:var(--asm-primary)}
.vk .arrow{align-self:center; color:var(--asm-border); font-size:18px}

/* filters */
.vk .filters{display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap}
/* kolom tanggal: penuntun bawaan peramban disembunyikan, penuntun sendiri di atasnya */
.vk .tgl{position:relative; display:block; flex:1; min-width:0}
.vk .tgl.kosong input::-webkit-datetime-edit{opacity:0}
.vk .tgl-ph{position:absolute; left:.75rem; top:50%; transform:translateY(-50%);
  pointer-events:none; color:var(--asm-fg-muted); font-size:.875rem}
.vk .filters .fld{min-width:210px}
.vk .filters .cari input{min-width:190px}

/* filters & flow lifted into the section-title row (single-line height) */
.vk .sect-l .filters{margin-bottom:0}
.vk .sect-l .filters .fld{min-width:0; margin-bottom:0; display:flex; align-items:center; gap:8px}
.vk .sect-l .filters .lbl{margin-bottom:0; white-space:nowrap}
.vk .sect-l .filters select{width:auto; min-width:150px}
.vk .sect-l .flow{margin-bottom:0; flex:1}

/* fields (Bab 11 .form-control / .form-label) */
.vk .fld{display:block; margin-bottom:12px}
.vk .lbl{font-family:var(--fd); font-size:.75rem; font-weight:500; color:var(--asm-fg); display:block; margin-bottom:6px}
.vk .lbl em{margin-left:6px; font-size:11px; font-weight:400; color:var(--asm-fg-muted)}
.vk .lbl .req{color:var(--asm-danger)}
.vk .lbl.mt{margin-top:16px}
.vk input,.vk select{width:100%; min-height:36px; padding:.375rem .75rem; border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  background:var(--asm-white); font-family:var(--fb); font-size:.875rem; color:var(--asm-fg); box-shadow:none}
.vk input::placeholder{color:var(--asm-fg-muted)}
.vk input:focus,.vk select:focus{outline:none; border-color:var(--asm-primary); box-shadow:0 0 0 3px var(--asm-primary-40)}
.vk input:disabled,.vk select:disabled{background:var(--asm-secondary); opacity:.6}
.vk input.err{border-color:var(--asm-danger); background:var(--asm-danger-soft)}
.vk input.qty{width:7rem; text-align:right}
.vk .awal-aksi{display:flex; justify-content:flex-start; gap:.75rem; margin:.5rem 0}
.vk .hint{display:block; font-size:11px; color:var(--asm-fg-muted); margin-top:3px}
.vk .row2{display:grid; grid-template-columns:1fr 1fr; gap:12px}
@media (max-width:560px){.vk .row2{grid-template-columns:1fr}}
@media (max-width:520px){.vk .cust-info, .vk .spec-info{grid-template-columns:1fr 1fr}}

/* dropdown pencarian */
.vk .combo-wrap{position:relative}
.vk .combo-list{position:absolute; top:calc(100% + 2px); left:0; right:0; z-index:30; margin:0; padding:6px;
  list-style:none; background:var(--asm-white); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  max-height:220px; overflow:auto; box-shadow:var(--asm-shadow-md)}
.vk .combo-list li{padding:8px 12px; font-size:.875rem; cursor:pointer; border-radius:var(--asm-radius-sm)}
.vk .combo-list li:hover{background:var(--asm-secondary)}
.vk .combo-list li[aria-selected="true"]{background:var(--asm-primary-10); color:var(--asm-primary); font-weight:700}
.vk .combo-empty{color:var(--asm-fg-muted); cursor:default}
.vk .combo-empty:hover{background:none}

/* item lines */
.vk .line{display:grid; grid-template-columns:1fr 80px 110px 70px 28px; gap:6px; align-items:center; margin-bottom:6px}
@media (max-width:640px){
  .vk .line{grid-template-columns:1fr 1fr}
  .vk .line>select,.vk .line>.combo-wrap{grid-column:1 / -1}
}
.vk .stokinfo{font-size:11.5px; color:var(--asm-fg-muted); text-align:right; font-variant-numeric:tabular-nums}
.vk .stokinfo.bad{color:var(--asm-danger); font-weight:700}
.vk .sum{margin-top:16px; border-top:2px solid var(--asm-primary); padding-top:10px; display:grid; gap:5px}
.vk .sum div{display:flex; justify-content:space-between; align-items:baseline}
.vk .sum span{font-family:var(--fd); font-size:12px; font-weight:500; color:var(--asm-fg-muted)}
.vk .sum span em{margin-left:6px; font-size:11px; font-weight:400}
.vk .sum b{font-size:1.125rem; font-weight:700}
.vk .delta{display:flex; justify-content:space-between; padding:9px 12px; background:var(--asm-primary-6); border:1px solid var(--asm-primary-40);
  border-radius:var(--asm-radius-md); margin-bottom:12px; font-family:var(--fd); font-size:12px; font-weight:500}
.vk .delta b{font-size:15px; font-weight:700}
.vk .peringatan{margin:12px 0 0; padding:10px 12px; font-size:12.5px; line-height:1.5; border-radius:var(--asm-radius-md);
  background:var(--asm-warning-soft); border:1px solid var(--asm-warning-border); border-left:3px solid var(--asm-warning); color:var(--asm-warning)}
.vk .peringatan b{font-weight:700}
.vk .peringatan.bad-box{background:var(--asm-danger-soft); border-color:var(--asm-danger-border); border-left-color:var(--asm-danger); color:var(--asm-danger)}

/* alerts list */
.vk .alerts{list-style:none; margin:0; padding:0}
.vk .alerts li{display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:1px solid var(--asm-border-50)}
.vk .alerts .an{flex:1; font-size:13px}
.vk .empty{padding:24px 16px; text-align:center; color:var(--asm-fg-muted); font-size:13px}
.vk .empty em{display:block; font-size:11.5px; margin-top:2px}

/* grade badge */
.vk .grade{font-family:var(--fd); font-size:15px; font-weight:700; width:28px; height:28px; display:inline-grid; place-items:center;
  border:1px solid transparent; border-radius:var(--asm-radius-sm); flex:none; vertical-align:middle}
.vk .gA{background:var(--asm-success-soft); color:var(--asm-success); border-color:var(--asm-success-border)}
.vk .gB{background:var(--asm-info-soft); color:var(--asm-info); border-color:var(--asm-info-border)}
.vk .gC{background:var(--asm-neutral-soft); color:var(--asm-neutral); border-color:var(--asm-neutral-border)}

/* modal */
.vk .ov{position:fixed; inset:0; background:rgb(51 51 51 / .5); display:grid; place-items:center; padding:16px; z-index:50}
.vk .md{background:var(--asm-card); border:1px solid var(--asm-border); border-top:4px solid var(--asm-primary);
  border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-lg);
  width:100%; max-width:440px; max-height:90vh; display:flex; flex-direction:column}
.vk .md.wide{max-width:720px}
.vk .md-hd{display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--asm-border)}
.vk .md-hd h3{font-size:.9375rem; font-weight:700; letter-spacing:-.01em}
.vk .md-hd h3 em{font-size:11.5px; letter-spacing:0; color:var(--asm-fg-muted); margin-left:7px; font-weight:400}
.vk .md-bd{padding:16px; overflow:auto}
.vk .md-ft{display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid var(--asm-border);
  background:var(--asm-secondary); border-radius:0 0 var(--asm-radius-lg) var(--asm-radius-lg)}

/* footer & toast */
.vk .ft{max-width:1240px; margin:0 auto; padding:16px 20px 28px; font-size:11.5px; color:var(--asm-fg-muted); text-align:center; border-top:1px solid var(--asm-border)}
.vk .ft em{display:block}
.vk .ft code{background:var(--asm-secondary); padding:1px 5px; border-radius:var(--asm-radius-sm); border:1px solid var(--asm-border)}
.vk .toast{position:fixed; left:50%; bottom:22px; transform:translateX(-50%); background:var(--asm-dark); color:var(--asm-white);
  padding:10px 16px; border-radius:var(--asm-radius-md); font-size:13px; z-index:60; border-left:4px solid var(--asm-success);
  box-shadow:var(--asm-shadow-lg); max-width:90%}
.vk .toast.bad{border-left-color:var(--asm-danger)}
@media (prefers-reduced-motion:no-preference){
  .vk .toast{animation:vkup .22s ease-out}
  @keyframes vkup{from{opacity:0; transform:translate(-50%,8px)} to{opacity:1; transform:translate(-50%,0)}}
}

/* login & session */
.vk .login{min-height:100vh; display:grid; place-items:center; padding:20px;
  background:radial-gradient(120% 90% at 50% 0%, var(--asm-primary-6) 0%, var(--asm-bg) 60%)}
.vk .splash{font-family:var(--fd); font-size:12px; font-weight:500; letter-spacing:.06em; color:var(--asm-primary)}
.vk .login-card{width:100%; max-width:380px; background:var(--asm-card); border:1px solid var(--asm-border);
  border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-md); overflow:hidden}
.vk .login-brand{display:flex; gap:12px; align-items:flex-start; padding:22px 20px 16px}
.vk .login-brand .lang{margin-left:auto; margin-top:2px}
.vk .login-id{display:flex; flex-direction:column; gap:7px; min-width:0}
.vk .login-brand h1{font-size:14px; font-weight:500; letter-spacing:.2em; text-transform:uppercase; color:var(--asm-fg-muted);
  text-align:center; padding-left:.2em}
.vk .login-brand p{margin:1px 0 0; font-size:11.5px; color:var(--asm-fg-muted)}
.vk .login-brand p em{display:block; font-size:10.5px}
.vk .login-bd{padding:20px}
.vk .btn.lg{width:auto}
.vk .login .btn.lg{width:100%; margin-top:4px}
.vk .login .conn{width:100%; text-align:center}

/* pemilih bahasa: kendali tersegmen ID / KO */
.vk .lang{display:inline-flex; border:1px solid var(--asm-border); border-radius:var(--asm-radius-md); overflow:hidden; background:var(--asm-card)}
/* bendera, bukan kode huruf: bahasa terbaca sekilas tanpa harus dieja.
   Yang tidak aktif diredam abu-abu — dua bendera berwarna bersebelahan tidak
   menunjukkan mana yang sedang dipakai, dan latar saja terlalu samar. */
.vk .lang-b{background:none; border:0; padding:3px 9px; cursor:pointer; font:inherit; font-size:15px;
  line-height:1.3; filter:grayscale(1); opacity:.5; transition:background .15s, filter .15s, opacity .15s}
.vk .lang-b + .lang-b{border-left:1px solid var(--asm-border)}
.vk .lang-b:hover{background:var(--asm-primary-6); filter:none; opacity:.8}
.vk .lang-b.on{background:var(--asm-primary-10); filter:none; opacity:1}
.vk .lang-b:focus-visible{outline:2px solid var(--asm-primary); outline-offset:-2px}

/* header: menu pengguna (identitas + aksi akun dalam satu tombol) */
.vk .who{display:flex; align-items:center; gap:8px; justify-content:flex-end}
.vk .um{position:relative}
.vk .um-b{display:inline-flex; align-items:center; gap:7px; background:none; cursor:pointer; font:inherit; font-size:13px;
  color:var(--asm-fg); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md); padding:3px 8px 3px 4px}
.vk .um-b:hover,.vk .um-b.on{border-color:var(--asm-primary); background:var(--asm-primary-6)}
.vk .um-av{width:22px; height:22px; flex:none; display:grid; place-items:center; border-radius:50%;
  font-family:var(--fd); font-size:11px; font-weight:700; line-height:1}
.vk .um-nm{max-width:12ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.vk .um-ar{flex:none; color:var(--asm-fg-muted); transition:transform .15s}
.vk .um-b.on .um-ar{transform:rotate(180deg)}
.vk .um-pop{position:absolute; top:calc(100% + 6px); right:0; z-index:40; min-width:180px; padding:4px;
  background:var(--asm-card); border:1px solid var(--asm-border); border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-md)}
.vk .um-hd{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 9px 8px;
  border-bottom:1px solid var(--asm-border); margin-bottom:4px}
.vk .um-hd b{font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.vk .um-i{display:block; width:100%; text-align:left; background:none; border:0; cursor:pointer; font:inherit; font-size:12.5px;
  color:var(--asm-fg); padding:7px 9px; border-radius:var(--asm-radius-md)}
.vk .um-i:hover{background:var(--asm-primary-6); color:var(--asm-primary)}
.vk .um-i.keluar:hover{background:var(--asm-danger-soft); color:var(--asm-danger)}

.vk .namelink{background:none; border:0; padding:0; margin:0; font:inherit; font-weight:inherit; color:inherit; cursor:pointer; text-align:left}
.vk .namelink:hover{text-decoration:underline; color:var(--asm-primary)}

.vk .cust-info, .vk .spec-info{display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 18px; margin-bottom:16px}
.vk .cust-info .span3{grid-column:1 / -1}
.vk .cust-info .lbl2, .vk .spec-info .lbl2{display:block; font-size:11px; font-weight:500; color:var(--asm-fg-muted); margin-bottom:3px}
/* role badge */
.vk .role{font-size:10px; padding:1px 7px}
.vk .role em{font-size:8.5px}
.vk .r-admin{background:var(--asm-danger-soft); color:var(--asm-danger); border-color:var(--asm-danger-border)}
.vk .r-manager{background:var(--asm-info-soft); color:var(--asm-info); border-color:var(--asm-info-border)}
.vk .r-staff{background:var(--asm-neutral-soft); color:var(--asm-neutral); border-color:var(--asm-neutral-border)}
.vk .u-menunggu{background:var(--asm-warning-soft); color:var(--asm-warning); border-color:var(--asm-warning-border)}
.vk .u-disetujui{background:var(--asm-success-soft); color:var(--asm-success); border-color:var(--asm-success-border)}
.vk .u-ditolak{background:var(--asm-danger-soft); color:var(--asm-danger); border-color:var(--asm-danger-border)}

/* danger buttons & action cell */
.vk .aksi{display:inline-flex; gap:6px; justify-content:flex-end; align-items:center; flex-wrap:wrap}
.vk .btn.danger{color:var(--asm-danger); border-color:var(--asm-danger-border)}
.vk .btn.danger:hover{background:var(--asm-danger); color:var(--asm-white); border-color:var(--asm-danger)}
.vk .btn.danger em{color:inherit}

/* dokumen (faktur / penawaran) — kop surat mengikuti BI */
.vk .doc-modal{background:var(--asm-bg); border:1px solid var(--asm-border); border-top:4px solid var(--asm-primary);
  border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-lg);
  width:100%; max-width:900px; max-height:94vh; display:flex; flex-direction:column}
.vk .doc-bar{display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--asm-border); background:var(--asm-card); flex-wrap:wrap}
.vk .doc-tabs{display:flex; gap:6px}
.vk .doc-firm{display:flex; gap:6px; align-items:center}
.vk .doc-firm-lbl{font-family:var(--fd); font-size:11px; font-weight:500; color:var(--asm-fg-muted)}
.vk .doc-firm-lbl em{display:block; font-size:9.5px}
.vk .doc-bar-r{display:flex; gap:10px; align-items:center; margin-left:auto}
.vk .doc-scroll{overflow:auto; padding:22px; background:#8C8C8C}
.vk .doc-paper{background:#fff; color:#333333; width:100%; max-width:760px; margin:0 auto; padding:34px 40px 30px;
  box-shadow:var(--asm-shadow-lg); font-family:var(--fb); font-size:12px; line-height:1.5;
  -webkit-print-color-adjust:exact; print-color-adjust:exact}
.vk .doc-hd{display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:2px solid #0062C6; padding-bottom:14px}
.vk .doc-co{display:flex; gap:12px; align-items:center}
.vk .doc-co h2{font-family:var(--fd); font-size:17px; font-weight:700; letter-spacing:.06em; color:#0062C6}
.vk .doc-co p{margin:2px 0 0; font-size:11px; color:#666666}
.vk .doc-addr{font-size:10px !important; color:#666666 !important}
.vk .doc-title{text-align:right}
.vk .doc-title h1{font-family:var(--fd); font-size:20px; font-weight:700; letter-spacing:-.01em; color:#333333}
.vk .doc-title em{display:block; font-size:12px; color:#666666; margin-top:2px}
.vk .doc-meta{display:flex; justify-content:space-between; gap:20px; margin-top:16px}
.vk .doc-lbl{display:block; font-family:var(--fd); font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase; color:#0062C6; margin-bottom:4px}
.vk .doc-to b{font-size:13px; color:#333333}
.vk .doc-to p{margin:2px 0 0; font-size:11px; color:#666666}
.vk .doc-info{border-collapse:collapse; font-size:11px; min-width:230px}
.vk .doc-info td{padding:2px 0}
.vk .doc-info td:first-child{color:#666666; padding-right:16px}
.vk .doc-info td:last-child{text-align:right; color:#333333}
.vk .doc-items{width:100%; border-collapse:collapse; margin-top:18px; font-size:11px}
.vk .doc-items th{background:#0062C6; color:#fff; font-family:var(--fd); font-weight:500;
  text-align:left; padding:8px; font-size:10.5px}
.vk .doc-items th.r{text-align:right} .vk .doc-items th.c{text-align:center; width:26px}
.vk .doc-items td{padding:7px 8px; border-bottom:1px solid #EBEBEB; vertical-align:top; color:#333333}
.vk .doc-items td.r{text-align:right} .vk .doc-items td.c{text-align:center; color:#666666}
.vk .doc-brand{font-style:normal; color:#666666; font-size:10px}
.vk .doc-sum{display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:14px}
.vk .doc-terbilang{flex:1; padding-top:2px}
.vk .doc-terbilang i{font-style:italic; color:#666666; font-size:11px}
.vk .doc-sum > table{border-collapse:collapse; min-width:240px; font-size:12px}
.vk .doc-sum > table td{padding:4px 0}
.vk .doc-sum > table td:first-child{color:#666666; padding-right:24px}
.vk .doc-sum > table td.r{text-align:right; color:#333333}
.vk .doc-grand td{border-top:2px solid #0062C6; padding-top:7px !important; font-weight:700; font-size:13px; color:#0062C6 !important}
.vk .doc-pay{margin-top:18px; padding:12px; background:#F0F6FC; border-left:3px solid #0062C6; border-radius:var(--asm-radius-md)}
.vk .doc-pay p{margin:0; font-size:11px; color:#333333}
.vk .doc-sign{display:flex; justify-content:space-between; gap:40px; margin-top:34px}
.vk .doc-sign > div{flex:1; text-align:center}
.vk .doc-sign span{font-size:11px; color:#333333}
.vk .doc-sign em{display:block; font-size:10px; color:#666666; margin-top:1px}
.vk .doc-line{height:46px; border-bottom:1px solid #D6D6D6; margin:0 10px 4px}
.vk .doc-sign b{font-size:11px; color:#333333}
.vk .doc-foot{margin-top:26px; padding-top:10px; border-top:1px solid #EBEBEB; font-size:9.5px; color:#666666; text-align:center}

/* ---------- layar kecil (tablet & ponsel) ---------- */
@media (max-width:900px){
  .vk .hd-in{padding:12px 14px}
  .vk .wrap{padding:16px 14px}
  .vk .sect-l .filters .fld{flex:1 1 170px}
  .vk .sect-l .filters select{min-width:0; width:100%}
}
@media (max-width:720px){
  .vk .hd-in{padding:12px; gap:10px}
  .vk .hd h1{font-size:18px; letter-spacing:.1em}
  .vk .hd-meta{text-align:left; width:100%}
  .vk .who{justify-content:flex-start; flex-wrap:wrap}
  /* justify-content:center memotong tab pertama saat baris ini ikut scroll */
  .vk .tabs{justify-content:flex-start; padding:0 10px; scrollbar-width:thin}
  .vk .tab{padding:10px 12px}
  .vk .wrap{padding:16px 12px}
  .vk .sect{align-items:stretch}
  .vk .sect-l{gap:10px}
  .vk .sect h2{font-size:1rem}
  .vk .acts{width:100%}
  .vk .acts .btn{flex:1 1 auto; text-align:center}
  .vk .filters,.vk .sect-l .flow{width:100%}
  .vk .step{min-width:92px; padding:7px 9px}
  .vk .step b{font-size:15px}
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
  .vk .line{grid-template-columns:1fr 1fr; gap:6px; padding:10px; margin-bottom:10px;
    background:var(--asm-secondary); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md)}
  .vk .line>select,.vk .line>.combo-wrap{grid-column:1 / -1}
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
