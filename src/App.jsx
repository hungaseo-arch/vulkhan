import React, { useState, useMemo, useEffect, useRef, useId, useCallback } from "react";
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
/* Ringkasan layar memakai satuan juta/miliar dua desimal; angka penuh disimpan
   untuk Excel, cetak dan dokumen keluar. Rp 3,001,976,000 harus dibaca digit
   demi digit untuk tahu ordenya — "Rp 3.00 miliar" tidak. Di bawah satu juta
   satuannya dilewati: "Rp 0.85 juta" lebih sulit dibaca daripada Rp 850,000.
   Ambang batasnya pada nilai mutlak, supaya retur bertanda minus ikut ringkas. */
const d2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const satuan = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9) return d2.format(v / 1e9) + " miliar";
  if (a >= 1e6) return d2.format(v / 1e6) + " juta";
  return fmt(v);
};
const rpRingkas = (n) => "Rp " + satuan(n);
/* Persen selalu satu desimal — kolom angka yang jumlah desimalnya berubah-ubah
   tidak bisa dibandingkan sekilas. Pembagi nol/kosong memberi null, bukan
   Infinity: itulah yang membedakan "tidak ada pembanding" dari "turun 100%". */
const naikTurun = (kini, dulu) => (!dulu ? null : ((Number(kini) || 0) - dulu) / dulu * 100);
const pct = (n) => (n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
/* Harga rata-rata = nilai total ÷ kuantitas total (rata-rata tertimbang).
   Rata-rata dari harga per baris memberi angka lain: satu baris 1 pcs berbobot
   sama dengan satu baris 200 pcs, padahal yang ditanyakan adalah harga yang
   sebenarnya diterima per pcs. */
const hargaRata = (total, qty) => (qty ? Number(total) / qty : null);
/* Arah perubahan untuk pewarnaan. Harga rata-rata ikut arah yang sama dengan
   nilai dan kuantitas: turunnya harga satuan adalah kabar buruk, bukan netral.
   ±0.5% dianggap mendatar — derau bulanan bukan tren. */
const arah = (n) => (n == null ? "" : n > 0.5 ? "naik" : n < -0.5 ? "turun" : "datar");
const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
/* Tanggal berjalan menurut WIB sebagai YYYY-MM-DD — dihitung saat dipakai,
   bukan konstanta, agar formulir & nama berkas selalu memakai tanggal berjalan.

   Sengaja BUKAN jam peramban. Perusahaannya di Jakarta, tapi yang membuka
   layar ini belum tentu: dari Seoul (UTC+9) jam peramban sudah berganti hari
   dua jam sebelum pabriknya, dan transaksi hari itu akan lahir dengan tanggal
   besok. Basis datanya sendiri berjalan di UTC, tujuh jam di belakang — jadi
   tanpa satu acuan tetap ada tiga jam yang berbeda dalam satu aplikasi.

   WIB tidak mengenal daylight saving, jadi geser +7 jam lalu baca tanggal
   UTC-nya sudah tepat sepanjang tahun. */
const WIB_OFFSET = 7 * 60 * 60 * 1000;
const today = () => new Date(Date.now() + WIB_OFFSET).toISOString().slice(0, 10);

/* Masa stabilisasi sistem — sama persis dengan AKHIR_MASA_STABILISASI di
   api-server.js. Selama masa ini dokumen lama masih dimasukkan menyusul,
   jadi tanggal kirim boleh mendahului tanggal dokumen; sesudahnya tidak.
   Server tetap yang memutuskan, ini hanya supaya penolakannya terbaca
   sebelum tombolnya ditekan. */
const AKHIR_MASA_STABILISASI = "2026-09-30";
const bolehMundurTgl = () => today() <= AKHIR_MASA_STABILISASI;

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
/* Hari terakhir bulan "YYYY-MM". Dihitung di UTC supaya zona waktu peramban
   tidak menggesernya ke tanggal 30 atau ke bulan sebelumnya. */
const akhirBulan = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
/* ---------- rentang periode ---------- */
/* Dua kotak tanggal, bawaannya 1 Januari tahun berjalan sampai hari ini.
   Bawaannya berhenti di hari ini, bukan di akhir tahun: bulan yang belum tiba
   hanya menambah kolom dan baris kosong pada grafik dan tabel. Batasnya
   dihitung sebagai teks YYYY-MM-DD, bukan objek Date — seluruh penyaringan di
   layar ini membandingkan teks. */
const rentangBawaan = (acuan) => [`${acuan.slice(0, 4)}-01-01`, acuan];
/* Periode yang sama setahun sebelumnya. Cukup menukar empat angka pertama:
   29 Februari pada tahun kabisat menjadi batas yang tanggalnya tidak ada, dan
   sebagai batas perbandingan teks itu tetap sah — tidak ada yang hilang. */
const setahunLalu = (s) => (s ? `${Number(s.slice(0, 4)) - 1}${s.slice(4)}` : "");
/* Daftar "YYYY-MM" menaik di dalam rentang. Bulan tanpa transaksi tetap masuk:
   baris bernilai "—" memberi tahu bahwa bulannya memang nol, sedangkan baris
   yang hilang terbaca seperti data yang belum dimuat. */
const bulanRentang = (d0, d1) => {
  if (!d0 || !d1 || d1 < d0) return [];
  const out = [];
  let y = Number(d0.slice(0, 4)), m = Number(d0.slice(5, 7));
  const y1 = Number(d1.slice(0, 4)), m1 = Number(d1.slice(5, 7));
  while ((y < y1 || (y === y1 && m <= m1)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y += 1; }
  }
  return out;
};
const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const bulanSingkat = (ym, lang) => {
  const m = Number(String(ym).slice(5, 7));
  return lang === "ko" ? `${m}월` : BULAN_SINGKAT[m - 1];
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

/* ---------- cabang (kota) ----------
   Empat cabang dengan satu ejaan resmi, dipakai di seluruh aplikasi: kode
   tiga huruf untuk dokumen dan nama kotanya untuk dibaca orang. Semarang
   memakai SMR — 'SMG' masih tertinggal di baris gudang lama, jadi ejaan itu
   tetap dikenali sebagai alias, tapi tidak lagi ditampilkan.

   Data lama menulis kota dengan bermacam ejaan ('SEMARANG', 'Semarang'),
   dan pelanggan bisa saja berkota di luar keempatnya. Karena itu pencarian
   lewat alias, dan yang tidak dikenali dibiarkan apa adanya — kota pelanggan
   bukan daftar tertutup. */
const CABANG = [
  { kode: "SBY", nama: "Surabaya", alias: ["SBY", "SURABAYA"] },
  { kode: "JKT", nama: "Jakarta", alias: ["JKT", "JAKARTA"] },
  { kode: "KRW", nama: "Karawang", alias: ["KRW", "KARAWANG"] },
  { kode: "SMR", nama: "Semarang", alias: ["SMG", "SMR", "SEMARANG"] },
];
const cabangDari = (teks) => {
  const k = String(teks || "").trim().toUpperCase();
  return CABANG.find((c) => c.alias.includes(k)) || null;
};
/* Nama kota siap tampil: diterjemahkan bila termasuk cabang, apa adanya bila
   tidak. `t` diminta sebagai argumen karena ini bukan komponen. */
const namaKota = (teks, t) => {
  const c = cabangDari(teks);
  return c ? t(c.nama) : String(teks || "");
};
const kodeGudang = (g) => cabangDari(g?.kota || g?.kode)?.kode || String(g?.kode || "");
const namaGudang = (g, t) => {
  const c = cabangDari(g?.kota || String(g?.nama || "").replace(/^Gudang\s+/i, "") || g?.kode);
  return c ? t("Gudang {kota}", { kota: t(c.nama) }) : String(g?.nama || "");
};
const opsiGudang = (t) => GUDANG.map((x) => [x.id, `${kodeGudang(x)} · ${namaGudang(x, t)}`]);

/* ---------- data contoh ---------- */
let GUDANG = [
  { id: "G1", kode: "KRW", nama: "Gudang Karawang", kota: "Karawang" },
  { id: "G2", kode: "SMR", nama: "Gudang Semarang", kota: "Semarang" },
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

/* ---------- hak akses (RBAC 3 tingkat) ----------
   Klien tidak lagi membandingkan peringkat peran: setiap izin yang dibatasi
   sekarang milik admin saja, dan sisanya terbuka untuk semua peran yang login.
   Peringkatnya tetap ada di server (RANK di api-server.js), tempat keputusannya
   benar-benar berlaku — yang di sini hanya menyembunyikan tombol. */
// Status usulan limit kredit — harus sama dengan CHECK di tabel limit_usulan.
const USULAN_LABEL = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" };
// Jenis data yang bisa diusulkan penghapusannya — sama dengan CHECK di tabel hapus_usulan.
const HAPUS_LABEL = { penjualan: "Penjualan", pembelian: "Pembelian", pelanggan: "Pelanggan" };
/* Sasaran yang usulan hapusnya sedang menunggu. Dipakai untuk mematikan tombol
   usul kedua atas baris yang sama — server menolaknya dengan 409, tapi tombol
   yang jelas-jelas mati lebih baik daripada pesan galat setelah ditekan. */
const menungguHapus = (usulan, jenis) =>
  new Set((usulan || []).filter((u) => u.jenis === jenis && u.status === "menunggu").map((u) => u.sasaran));

/* limit_kredit bawaan di basis data adalah 0, dan pelanggan hasil impor masuk
   tanpa angka sendiri — jadi 0 berarti "belum diatur", bukan "tidak boleh
   berutang". Keduanya harus dibaca sama di seluruh layar: tanpa ini, pelanggan
   impor tidak bisa dijual sama sekali dan selalu tampil melebihi limit. */
const punyaLimit = (c) => Number(c?.limit) > 0;
const lewatiLimit = (c, piutang) => punyaLimit(c) && piutang > c.limit;

const ROLE_LABEL = {
  admin:   { id: "Admin", desc: "Akses penuh" },
  manager: { id: "Manajer", desc: "+ Hapus" },
  staff:   { id: "Staf", desc: "Input & ubah" },
};

/* ============================================================ */

/* Modul yang untuk sementara disembunyikan dari menu.

   Gudang & pembelian tidak dipakai: buku mutasinya sudah dikosongkan
   (migrations/2026-09-15-reset-stok-pembelian) dan akan dimulai lagi dari
   pengisian saldo awal kalau nanti dipakai. Sampai saat itu layarnya hanya
   menampilkan nol dan tabel kosong, yang lebih membingungkan daripada tidak
   ada sama sekali.

   Ini semata soal tampilan — kodenya utuh, datanya utuh, dan tidak ada
   endpoint yang ditutup. Untuk mengembalikannya: kosongkan daftar ini. */
const MODUL_SEMBUNYI = ["stok", "beli"];

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
    /* Menghapus penjualan/pembelian membuang juga mutasi stoknya, jadi satu klik
       yang salah menggeser saldo gudang tanpa jejak. Sejak ada usulan hapus,
       tombol langsungnya hanya untuk admin; peran lain mengajukannya lebih dulu. */
    if (perm === "delete" || perm === "users" || perm === "putusan") return user.peran === "admin";
    return true; // input, ubah & usul: semua peran yang login
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
  /* Langkah ke 'kirim' minta tanggalnya lebih dulu: barang sering berangkat
     bukan pada hari dokumennya ditulis, dan sesudah tercatat tanggal itu
     tidak bisa diperbaiki dari layar mana pun. Dialognya dipasang di sini,
     bukan di tiap layar, supaya rincian penjualan berperilaku sama dari
     layar Penjualan, Pelanggan maupun Piutang. */
  const [tanyaKirim, setTanyaKirim] = useState(null); // { so }
  async function majuSO(so, tglKirim) {
    const i = SO_FLOW.indexOf(so.status);
    if (i >= SO_FLOW.length - 1) return;
    const next = SO_FLOW[i + 1];
    if (next === "kirim" && !tglKirim) return setTanyaKirim(so);
    // Pengelolaan stok tidak dipakai lagi: pengiriman tidak pernah ditahan
    // oleh jumlah stok. Mutasi keluar tetap dicatat (boleh minus) agar
    // riwayat pengiriman tidak berubah.
    try {
      if (online) {
        await api.statusPenjualan(so.id, next, tglKirim); // trigger DB catat mutasi keluar saat 'kirim'
        await reload();
      } else {
        if (next === "kirim")
          addMutasi(so.items.map((it) => ({ tgl: tglKirim, gudang: so.gudang, produk: it.produk, tipe: "keluar", qty: -it.qty, ref: so.no, catatan: "Pengiriman penjualan" })));
        setPenjualan((list) => list.map((x) => (x.id === so.id
          ? { ...x, status: next, ...(next === "kirim" ? { tgl_kirim: tglKirim } : {}) }
          : x)));
      }
      say(`${so.no} → ${t(SO_LABEL[next].id)}`);
    } catch (e) { say(e.message, true); }
  }

  /* Mundur satu langkah untuk membetulkan salah tekan — termasuk salah kirim
     (kirim → pesanan), yang di server menghapus lagi mutasi keluar dokumen
     ini dan mengosongkan tanggal kirimnya. Batas bawahnya 'pesanan':
     penawaran yang terlanjur jadi pesanan tetap hanya bisa dihapus. */
  async function mundurSO(so) {
    const i = SO_FLOW.indexOf(so.status);
    if (i <= SO_FLOW.indexOf("pesanan")) return;
    const prev = SO_FLOW[i - 1];
    try {
      if (online) {
        await api.statusPenjualan(so.id, prev);
        await reload();
      } else {
        if (so.status === "kirim") setMutasi((m) => m.filter((x) => !(x.ref === so.no && x.tipe === "keluar")));
        setPenjualan((list) => list.map((x) => (x.id === so.id
          ? { ...x, status: prev, ...(so.status === "kirim" ? { tgl_kirim: null } : {}) }
          : x)));
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

  /* Ubah isi SO yang sudah ada. Nomor & status tidak ikut: nomor menaut buku
     mutasi, status punya jalur majuSO/mundurSO sendiri. Server yang memutuskan
     boleh atau tidak — lihat bisaUbahSO / tolakUbahSO. */
  async function doUpdatePenjualan(so) {
    if (online) { await api.updatePenjualan(so.id, so); await reload(); }
    else setPenjualan((l) => l.map((x) => (x.id === so.id ? { ...x, ...so } : x)));
    say(t("{no} diperbarui.", { no: so.no }));
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

  /* ---------- hapus (admin saja) & usulan hapus (semua peran) ---------- */
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

  /* Usulan hapus dimuat sekali di sini, bukan di tiap layar: penjualan,
     pembelian dan pelanggan sama-sama memakainya, dan menyetujui satu usulan
     berarti menghapus barisnya — jadi muat ulangnya menyentuh seluruh buku,
     bukan hanya layar yang sedang terbuka. */
  const [hapusUsulan, setHapusUsulan] = useState(null);
  const muatHapus = async () => {
    if (!online || !user) return setHapusUsulan([]);
    try { setHapusUsulan(await api.listHapusUsulan()); } catch (e) { setHapusUsulan([]); say(e.message, true); }
  };
  useEffect(() => { muatHapus(); }, [online, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const ajukanHapus = async (u) => {
    if (!online) return say(t("Usulan hapus hanya tersedia saat online."), true);
    await api.createHapusUsulan(u);
    await muatHapus();
    say(t("Usulan hapus dikirim, menunggu persetujuan admin."));
  };
  // Persetujuan menjalankan penghapusannya, jadi data utama ikut dimuat ulang.
  const putusanHapus = async (id, hasil, catatan) => {
    if (!online) return say(t("Putusan hapus hanya tersedia saat online."), true);
    await api.putusanHapusUsulan(id, hasil, catatan);
    await Promise.all([muatHapus(), reload()]);
    say(hasil === "disetujui" ? t("Usulan disetujui, data dihapus.") : t("Usulan ditolak."));
  };

  /* Pindah ke layar Penjualan dengan periode tertentu. Penyaring layar itu
     dibaca dari URL saat ia dipasang, jadi URL diatur dulu, tabnya kemudian —
     tanpa memuat ulang halaman. */
  const bukaPenjualan = (dari, sampai) => {
    const q = new URLSearchParams({ dari, sampai });
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    setTab("jual");
  };

  const ctx = {
    produk, pelanggan, pemasok, mutasi, mutasiLimit, penjualan, pembelian,
    getStok, stokTotal, pById, cById, gById, sById, totalSO,
    piutang, piutangTotal, majuSO, mundurSO, majuPO, mundurPO, say, online,
    doTransfer, doAdjust, doSaldoAwal, doCreatePenjualan, doUpdatePenjualan, doCreatePembelian, doCreatePelanggan,
    doUpdatePelanggan, user, can, minta, doDeletePenjualan, doDeletePembelian, doDeletePelanggan, reload,
    hapusUsulan, ajukanHapus, putusanHapus, bukaPenjualan,
  };

  const TABS = [
    ["dasbor", "Ringkasan"],
    ["stok", "Stok Gudang"],
    ["jual", "Penjualan"],
    ["beli", "Pembelian"],
    ["mitra", "Pelanggan"],
    ["piutang", "Piutang"],
    ...(can("users") ? [["admin", "Pengguna"]] : []),
  ].filter(([k]) => !MODUL_SEMBUNYI.includes(k));

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
              {/* Sesi tersimpan di localStorage tetap membuka layar walau server
                  mati, dan layar itu diam-diam memakai data contoh. Tanpa tanda
                  ini, angka contoh terbaca seperti angka perusahaan. */}
              {!online && <span className="conn offline">{t("○ Server tidak terhubung — angka di layar ini hanya contoh")}</span>}
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
        {tab === "stok" && !MODUL_SEMBUNYI.includes("stok") && <Stok {...ctx} />}
        {tab === "jual" && <Penjualan {...ctx} />}
        {tab === "beli" && !MODUL_SEMBUNYI.includes("beli") && <Pembelian {...ctx} />}
        {tab === "mitra" && <Pelanggan {...ctx} />}
        {tab === "piutang" && <Piutang {...ctx} />}
        {tab === "admin" && can("users") && <PenggunaAdmin {...ctx} />}
      </main>

      <footer className="ft">Copyright © ASEOA</footer>

      {gantiSandi && <GantiSandi online={online} say={say} close={() => setGantiSandi(false)} />}
      {tanyaKirim && (
        <FormTglKirim so={tanyaKirim} say={say} close={() => setTanyaKirim(null)}
          submit={(tgl) => { const so = tanyaKirim; setTanyaKirim(null); return majuSO(so, tgl); }} />
      )}
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

/* Tanggal pengiriman — ditanyakan sekali, saat dokumen berpindah ke 'kirim'.
   Bawaannya hari ini karena itu yang paling sering benar. Selama masa
   stabilisasi tanggal yang lebih tua dari dokumennya masih diterima. */
function FormTglKirim({ so, submit, say, close }) {
  const { t } = useLang();
  const [tgl, setTgl] = useState(today());
  const kirim = async () => {
    if (!tgl) return say(t("Isi tanggal pengiriman."), true);
    if (tgl < so.tgl && !bolehMundurTgl())
      return say(t("Tanggal kirim tidak boleh mendahului tanggal dokumen ({tgl}).", { tgl: so.tgl }), true);
    try { await submit(tgl); } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Kirim {no}", { no: so.no })} close={close} onSave={kirim} saveLabel={t("Kirim")}>
      <Inp label={t("Tanggal Pengiriman")} type="date" value={tgl} onChange={setTgl}
        hint={t("Tanggal dokumen: {tgl}", { tgl: so.tgl })} />
    </Modal>
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
      <div className="kpis">
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
/* [kunci, label umur, status]. Statusnya sengaja hanya tiga — yang ditanyakan
   orang pertama kali bukan "berapa hari", melainkan "sudah lewat atau belum".
   'Belum Jatuh Tempo' dipecah dua: yang jatuh tempo HARI INI bukan lagi aman
   (uangnya harus masuk hari ini juga), tapi juga belum terlambat. */
const AGING_DEF = [
  ["undue", "Belum Jatuh Tempo", "Undue"],
  ["ondue", "Jatuh Tempo Hari Ini", "Ondue"],
  ["130", "1–30 Hari", "Overdue"],
  ["3060", "31–60 Hari", "Overdue"],
  ["6090", "61–90 Hari", "Overdue"],
  ["90180", "91–180 Hari", "Overdue"],
  ["180", "> 180 Hari", "Overdue"],
];

const STATUS_UMUR = Object.fromEntries(AGING_DEF.map(([k, , status]) => [k, status]));

/* piutang & umur piutang (mengacu panduan analisis AR) — dipakai Dasbor & halaman Piutang.
   SO berstatus "kirim"/"tagihan" = sudah dikirim tapi belum lunas.
   Jatuh tempo = tanggal SO + termin pelanggan (default 30 hari bila kosong). */
const hitungPiutang = (penjualan, cById, totalSO) => {
  const hariIni = today(); // WIB — umur piutang ikut acuan yang sama
  const piutangRows = penjualan
    .filter((s) => ["kirim", "tagihan"].includes(s.status))
    .map((s) => {
      const c = cById(s.pelanggan);
      const nilai = totalSO(s);
      const tempo = addDays(s.tgl, Number(c.termin) || 30);
      const telat = Math.max(0, diffDays(tempo, hariIni));
      const bucket = telat > 180 ? "180" : telat > 90 ? "90180" : telat > 60 ? "6090" : telat > 30 ? "3060" : telat > 0 ? "130"
        : tempo === hariIni ? "ondue" : "undue";
      return { so: s, c, nilai, telat, tempo, bucket };
    });
  const piutangF = piutangRows.reduce((a, r) => a + r.nilai, 0);
  /* Yang dihitung per kelompok adalah PELANGGAN, bukan lembar invoice: satu
     pelanggan dengan lima invoice lewat tempo tetap satu telepon penagihan.
     Rincian per invoice tetap ada — tinggal klik baris umurnya. */
  const agingRows = AGING_DEF.map(([k, label, status]) => {
    const rows = piutangRows.filter((r) => r.bucket === k);
    return {
      k, label, status,
      n: new Set(rows.map((r) => r.c.id)).size,
      inv: rows.length,
      maks: rows.reduce((a, r) => Math.max(a, r.telat), 0),
      nilai: rows.reduce((a, r) => a + r.nilai, 0),
    };
  });
  /* Tiga status yang sama dipakai dasbor, dihitung dari baris yang sama supaya
     dasbor dan halaman Piutang tidak pernah menyebut angka yang berbeda. */
  const statusRows = ["Undue", "Ondue", "Overdue"].map((status) => {
    const rows = piutangRows.filter((r) => STATUS_UMUR[r.bucket] === status);
    return {
      status,
      n: new Set(rows.map((r) => r.c.id)).size,
      maks: rows.reduce((a, r) => Math.max(a, r.telat), 0),
      nilai: rows.reduce((a, r) => a + r.nilai, 0),
    };
  });
  const perPelanggan = new Map();
  piutangRows.forEach((r) => {
    const cur = perPelanggan.get(r.c.id) || { c: r.c, nilai: 0, telat: 0 };
    cur.nilai += r.nilai; cur.telat = Math.max(cur.telat, r.telat);
    perPelanggan.set(r.c.id, cur);
  });
  const topPelanggan = [...perPelanggan.values()]
    .map((x) => ({ ...x, pakai: punyaLimit(x.c) ? (x.nilai / x.c.limit) * 100 : 0 }))
    .sort((a, b) => b.nilai - a.nilai);

  return { piutangRows, piutangF, agingRows, statusRows, topPelanggan };
};
/* Keterangan di bawah ketiga kartu piutang. Bentuknya sengaja sama untuk
   ketiganya — kartu yang berbeda susunannya terbaca seperti ukuran berbeda,
   padahal ketiganya menghitung hal yang sama. Berapa hari lewatnya ada di
   kolom "Lewat (hari)" pada rinciannya. */
const subPiutang = (x, t) => t("{n} pelanggan · {i} invoice", { n: fmt(x.n), i: fmt(x.inv) });

/* grade risiko: kombinasi umur piutang & pemakaian limit kredit — bukan nilai piutang semata */
const gradePiutang = (x) => {
  if (x.telat > 180 || x.pakai > 100) return ["Kritis", "alert"];
  if (x.telat > 90 || x.pakai >= 90) return ["Tinggi", "alert"];
  if (x.telat > 30 || x.pakai >= 70) return ["Sedang", "warn"];
  return ["Rendah", "ok"];
};

function Dasbor({ produk, penjualan, pembelian, getStok, stokTotal, cById, pById, gById, totalSO, piutang, bukaPenjualan }) {
  const { t, lang } = useLang();
  const qtySO = (s) => s.items.reduce((a, i) => a + i.qty, 0);
  const nilaiPO = (p) => p.items.reduce((a, i) => a + i.qty * i.harga, 0);
  const jualKonfirm = penjualan.filter((s) => s.status !== "penawaran");

  const nilaiStok = produk.reduce((a, p) => a + stokTotal(p.id) * p.hpp, 0);
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

  /* Yang ditanyakan tiap pagi bukan "berapa piutangnya" melainkan "mana yang
     sudah lewat tempo" — jadi saldonya dipecah tiga sejak di dasbor. */
  const { piutangRows, statusRows } = hitungPiutang(penjualan, cById, totalSO);
  const [undue, ondue, overdue] = statusRows;

  /* Penjualan bulan berjalan, bukan sepanjang masa: yang dinilai tiap pagi
     adalah bulan yang sedang jalan, dan angka kumulatif hanya membesar. */
  const bulanIni = today().slice(0, 7);
  const jualBulanIni = jualKonfirm.filter((s) => String(s.tgl).slice(0, 7) === bulanIni);
  const nilaiBulanIni = jualBulanIni.reduce((a, s) => a + totalSO(s), 0);
  const labelJual = t("Penjualan {bulan}", { bulan: bulanLabel(bulanIni, lang) });

  const [detail, setDetail] = useState(null); // kartu KPI yang dibuka
  const [rinci, setRinci] = useState(null);   // dokumen yang dibuka dari daftar itu
  const [pel, setPel] = useState(null);       // pelanggan yang dibuka dari daftar itu
  const bukaJual = () => setDetail({
    judul: labelJual,
    kolom: [[t("No."), 0], [t("Tanggal"), 0], [t("Pelanggan"), 0], [t("Nilai"), 1]],
    taut: { 0: "so", 2: "c" },
    baris: [...jualBulanIni]
      .sort((a, b) => (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0))
      .map((s) => ({ k: s.id, so: s, c: cById(s.pelanggan), sel: [s.no, s.tgl, cById(s.pelanggan).nama, rp(totalSO(s))] })),
    total: rp(nilaiBulanIni),
  });
  const bukaPiutang = (status, judul) => () => setDetail({
    judul,
    kolom: [[t("No."), 0], [t("Pelanggan"), 0], [t("Jatuh Tempo"), 0], [t("Lewat (hari)"), 1], [t("Nilai"), 1]],
    taut: { 0: "so", 1: "c" },
    baris: piutangRows
      .filter((r) => STATUS_UMUR[r.bucket] === status)
      .sort((a, b) => b.telat - a.telat || b.nilai - a.nilai)
      .map((r) => ({ k: r.so.id, so: r.so, c: r.c, sel: [r.so.no, r.c.nama, r.tempo, r.telat ? fmt(r.telat) : "—", rp(r.nilai)] })),
    total: rp(statusRows.find((x) => x.status === status).nilai),
  });

  return (
    <>
      <SectionTitle id={t("Ringkasan Operasi")} />
      <div className="kpis">
        {/* KPI gudang & pembelian ikut hilang bersama menunya — kalau tidak,
            dasbor menampilkan Rp 0 besar-besar yang terbaca seperti kerugian,
            bukan seperti modul yang memang sedang tidak dipakai. */}
        {!MODUL_SEMBUNYI.includes("stok") && (
          <Kpi label={t("Nilai Stok")} val={rp(nilaiStok)} sub={nilaiStok < 0 ? t("⚠ stok negatif — periksa Buku Mutasi Stok") : t("harga pokok")} tone={nilaiStok < 0 ? "alert" : ""} />
        )}
        <Kpi label={labelJual} val={rp(nilaiBulanIni)} sub={t("{n} transaksi", { n: jualBulanIni.length })} onClick={bukaJual} />
        {!MODUL_SEMBUNYI.includes("beli") && (
          <Kpi label={t("Pembelian")} val={rp(beli)} sub={t("{n} transaksi", { n: pembelian.length })} />
        )}
        <Kpi label={t("Undue")} val={rp(undue.nilai)} sub={subPiutang(undue, t)} onClick={bukaPiutang("Undue", t("Undue"))} />
        <Kpi label={t("Ondue")} val={rp(ondue.nilai)} sub={subPiutang(ondue, t)} tone={ondue.nilai > 0 ? "warn" : ""} onClick={bukaPiutang("Ondue", t("Ondue"))} />
        <Kpi label={t("Overdue")} val={rp(overdue.nilai)} sub={subPiutang(overdue, t)} tone={overdue.nilai > 0 ? "alert" : ""} onClick={bukaPiutang("Overdue", t("Overdue"))} />
      </div>
      {detail && (
        <DetailKpi {...detail} close={() => setDetail(null)}
          onPilih={(jenis, obj) => { setDetail(null); if (jenis === "so") setRinci(obj); else setPel(obj); }} />
      )}
      {/* Dokumen & pelanggan hanya dibaca dari sini. Mengubah status atau data
          pelanggan tetap milik layarnya masing-masing, tempat orang sudah
          terbiasa mencarinya. */}
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)} />
      )}
      {pel && (
        <DetailPelanggan c={pel} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setPel(null)}
          onPilihSO={(so) => { setPel(null); setRinci(so); }} />
      )}

      <SectionTitle id={t("Ringkasan Bulanan")} />
      <Card title={t("Penjualan per Bulan")} note={t("tidak termasuk penawaran")}>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Bulan")}</th>
                <th scope="col" className="r">{t("Transaksi")}</th>
                {GUDANG.map((g) => (
                  <th scope="col" className="r" key={g.id}>{kodeGudang(g)}</th>
                ))}
                <th scope="col" className="r">{t("Qty")}</th>
                <th scope="col" className="r">{t("Nilai")}</th>
              </tr>
            </thead>
            <tbody>
              {jualBulanan.map((b) => (
                <tr key={b.bulan}>
                  <td>
                    <button type="button" className="namelink" title={t("Lihat rincian")}
                      onClick={() => bukaPenjualan(`${b.bulan}-01`, akhirBulan(b.bulan))}>
                      {bulanLabel(b.bulan, lang)}
                    </button>
                  </td>
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

      {!MODUL_SEMBUNYI.includes("stok") && (<>
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
                    <td><span className="chip">{kodeGudang(g)}</span> {namaGudang(g, t)}</td>
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
      </>)}
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

  /* KPI mengikuti penyaring yang sama dengan tabel (gudang, kategori, kata
     kunci): angkanya adalah ringkasan dari baris yang sedang terlihat, bukan
     seluruh gudang — supaya "nilai stok" di kartu dan jumlah kolom di bawahnya
     tidak saling bertentangan. */
  const stokDi = (p) => (g === "ALL" ? stokTotal(p.id) : getStok(g, p.id));
  const ring = list.reduce((a, p) => {
    const sisa = stokDi(p);
    a.nilai += sisa * p.hpp; a.qty += sisa;
    if (sisa < 0) a.negatif += 1; else if (sisa < p.min) a.rendah += 1;
    return a;
  }, { nilai: 0, qty: 0, rendah: 0, negatif: 0 });

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
              opts={[["ALL", t("Semua Gudang")], ...opsiGudang(t)]} />
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

      <div className="kpis">
        <Kpi label={t("Nilai Stok")} val={rp(ring.nilai)} sub={t("harga pokok")} tone={ring.nilai < 0 ? "alert" : ""} />
        <Kpi label={t("Total Stok")} val={`${fmt(ring.qty)} pcs`} sub={t("{n} produk", { n: fmt(list.length) })} />
        <Kpi label={t("Di Bawah Minimum")} val={t("{n} produk", { n: fmt(ring.rendah) })}
          sub={ring.rendah ? t("stok di bawah batas minimum") : t("semua di atas minimum")} tone={ring.rendah ? "warn" : ""} />
        <Kpi label={t("Stok Negatif")} val={t("{n} produk", { n: fmt(ring.negatif) })}
          sub={ring.negatif ? t("periksa Buku Mutasi Stok") : t("tidak ada stok negatif")} tone={ring.negatif ? "alert" : ""} />
      </div>

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
        <Scroll>
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
                  <td><span className="chip">{kodeGudang(gById(m.gudang))}</span></td>
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
      <Combo label={t("Dari Gudang")} value={f.dari} onChange={set("dari")} placeholder={t("-- Pilih Gudang --")} opts={opsiGudang(t)} />
      <Combo label={t("Ke Gudang")} value={f.ke} onChange={set("ke")} placeholder={t("-- Pilih Gudang --")} opts={opsiGudang(t)} />
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
      <Combo label={t("Gudang")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={opsiGudang(t)} />
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
        opts={opsiGudang(t)} />
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
                    <td><span className="chip">{kodeGudang(g)}</span> {namaGudang(g, t)}</td>
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

/* ============================ USULAN HAPUS ============================ */
/* Kartu permintaan hapus. Dipakai tiga layar (penjualan, pembelian,
   pelanggan) dengan jenis yang berbeda; yang tampil hanya usulan untuk jenis
   layarnya sendiri, supaya daftar di layar penjualan tidak dipenuhi permintaan
   hapus pelanggan. Tidak ada usulan sama sekali berarti kartunya tidak muncul:
   kartu kosong memakan tinggi layar untuk mengatakan "tidak ada apa-apa". */
function KartuUsulHapus({ jenis, hapusUsulan, can, onPutuskan }) {
  const { t } = useLang();
  const [semua, setSemua] = useState(false);
  const rows = (hapusUsulan || []).filter((u) => u.jenis === jenis);
  if (!rows.length) return null;
  return (
    <Card title={t("Permintaan Hapus")}
      note={t("Diajukan oleh petugas, disahkan oleh admin. Data terhapus tepat saat usulan disetujui.")}>
      <Scroll>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("Data|sasaran usulan hapus")}</th>
              <th scope="col" className="r">{t("Nilai")}</th>
              <th scope="col">{t("Alasan")}</th>
              <th scope="col">{t("Pengaju")}</th>
              <th scope="col">{t("Status")}</th>
              <th scope="col" className="r">{t("Aksi")}</th>
            </tr>
          </thead>
          <tbody>
            {(semua ? rows : rows.slice(0, PERINGKAT_N)).map((u) => (
              <tr key={u.id}>
                <td><span className="chip">{u.sasaran_no}</span><em className="mut2">{u.sasaran_ket}</em></td>
                {/* pelanggan tidak punya nilai transaksi — nol berarti "tidak berlaku" */}
                <td className="r n mut">{Number(u.nilai) ? rp(Number(u.nilai)) : "—"}</td>
                <td className="mut">{u.alasan || "—"}</td>
                <td className="mut">{u.pengusul_nama}<em className="mut2">{String(u.diusulkan).slice(0, 10)}</em></td>
                <td><span className={"role u-" + u.status}>{t(USULAN_LABEL[u.status])}</span></td>
                <td className="r">
                  {u.status === "menunggu" && can("putusan")
                    ? <button className="btn sm pri" onClick={() => onPutuskan(u)}>{t("Putuskan")}</button>
                    : <span className="mut2">{u.penentu_nama || "—"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
      <KakiSemua total={rows.length} semua={semua} onToggle={() => setSemua((v) => !v)} />
    </Card>
  );
}

/* Tombol hapus satu baris: admin membuang datanya langsung, peran lain hanya
   bisa mengusulkan. Selama usulannya menunggu, tombolnya mati — server menolak
   usulan kedua dengan 409, dan tombol yang jelas mati lebih baik daripada
   pesan galat yang baru muncul setelah ditekan. */
const TombolHapus = ({ can, tunggu, onHapus, onUsul }) => {
  const { t } = useLang();
  if (tunggu)
    return (
      /* .btn:disabled memakai pointer-events:none, jadi judulnya dipasang di
         pembungkus — kalau tidak, tidak ada yang menjelaskan tombol yang mati. */
      <span title={t("Permintaan hapus sedang menunggu putusan admin.")}>
        <button className="btn sm" disabled>{t("Menunggu Putusan")}</button>
      </span>
    );
  return can("delete")
    ? <button className="btn sm danger" title={t("Hapus")} onClick={onHapus}>{t("Hapus")}</button>
    : <button className="btn sm" onClick={onUsul}>{t("Usul Hapus")}</button>;
};

/* Pengajuan hapus: siapa pun yang login boleh mengusulkan, tidak ada yang
   terhapus sampai admin menyetujui. Alasan WAJIB diisi — admin memutuskan atas
   dasar itu, dan setelah barisnya hilang alasan inilah satu-satunya keterangan
   mengapa data itu pernah ada lalu tidak ada. */
function FormUsulHapus({ jenis, sasaran, judul, ket, close, say, submit }) {
  const { t } = useLang();
  const [alasan, setAlasan] = useState("");
  const kirim = async () => {
    const a = alasan.trim();
    if (!a) return say(t("Alasan penghapusan wajib diisi."), true);
    try {
      await submit({ jenis, sasaran, alasan: a });
      close();
    } catch (e) { say(e.message, true); }
  };
  return (
    <Modal title={t("Usul Hapus")} close={close} onSave={kirim} saveLabel={t("Ajukan")}>
      <p className="note"><b>{judul}</b>{ket ? " · " + ket : ""}</p>
      <p className="note">{t("Data belum terhapus. Penghapusan berjalan saat admin menyetujui usulan ini.")}</p>
      <Inp label={t("Alasan")} value={alasan} onChange={setAlasan} hint={t("Dibaca admin saat memutuskan.")} />
    </Modal>
  );
}

/* Pengesahan oleh admin. Berbeda dari putusan limit: menyetujui di sini
   MENGHAPUS datanya seketika, jadi nomor dan keterangan sasaran diulang di
   dialog — setelah tombol ditekan tidak ada layar yang bisa menampilkannya lagi. */
function FormPutusanHapus({ u, close, say, submit }) {
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
    <Modal title={t("Putusan Permintaan Hapus")} close={close} onSave={kirim}>
      <p className="note">{t(HAPUS_LABEL[u.jenis])} · <b>{u.sasaran_no}</b> · {u.sasaran_ket}</p>
      {Number(u.nilai) > 0 && <p className="note">{t("Nilai")}: <b className="n">{rp(Number(u.nilai))}</b></p>}
      <p className="note">{t("Diajukan oleh {u}", { u: u.pengusul_nama })}</p>
      {u.alasan && <p className="note">{t("Alasan")}: {u.alasan}</p>}
      {/* pelanggan tidak punya mutasi stok — peringatannya tidak boleh menjanjikan
          akibat yang tidak akan terjadi */}
      <p className="note"><b className="bad">{u.jenis === "pelanggan"
        ? t("Menyetujui akan menghapus data ini. Tidak bisa dibatalkan.")
        : t("Menyetujui akan menghapus data ini beserta mutasi stoknya. Tidak bisa dibatalkan.")}</b></p>
      <Sel label={t("Putusan")} value={f.putusan} onChange={set("putusan")}
        opts={[["disetujui", t("Setujui & Hapus")], ["ditolak", t("Tolak")]]} />
      <Inp label={t("Catatan")} value={f.catatan} onChange={set("catatan")} />
    </Modal>
  );
}

/* ============================ PENJUALAN ============================ */
/* Layar penjualan disusun tiga tingkat ke bawah: penyaring → ringkasan (KPI &
   grafik) → tabel rincian. Susunan lama menumpuk angka tanpa pembanding —
   "Rp 3,001,976,000" tidak memberi tahu apakah bulan ini bagus atau buruk —
   dan memakai matriks kuartal 4 kolom yang pecah begitu satu bulan dibuka.
   Semua pendalaman sekarang terjadi di dalam satu tabel, sehingga lebarnya
   tidak pernah berubah. */
const qtySO = (s) => s.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
const KOSONG = () => ({ n: 0, qty: 0, total: 0 });

/* Tiga sumbu analisis atas data yang sama: waktu menjawab "kapan", pelanggan
   menjawab "siapa", produk menjawab "apa". Penyaring dan kartu KPI dipakai
   bersama ketiganya — yang berganti hanya cara barisnya dikelompokkan. */
const SUMBU = [["waktu", "Per Periode"], ["pelanggan", "Per Pelanggan"], ["produk", "Per Produk"]];
/* Produk tidak punya kolom merek di basis data; ukuran dan pola adalah dua
   penanda teknis yang tersedia, dan keduanya yang dipakai di sini. */
const KELOMPOK = [["produk", "Produk"], ["ukuran", "Ukuran"], ["pola", "Pola"]];
const PERINGKAT_N = 10;

/* Kaki tabel "tampilkan semua / 10 teratas". Dipakai di setiap tabel halaman
   yang bisa panjang: halaman hanya boleh punya satu gulir (dokumen), jadi
   tabel tidak diberi max-height — yang dibatasi jumlah barisnya. */
function KakiSemua({ total, semua, onToggle }) {
  const { t } = useLang();
  if (total <= PERINGKAT_N) return null;
  return (
    <div className="rank-ft">
      <button type="button" className="btn" onClick={onToggle}>
        {semua ? t("Tampilkan 10 Teratas") : t("Tampilkan Semua ({n})", { n: fmt(total) })}
      </button>
    </div>
  );
}

/* Keadaan penyaring dibaca dari URL supaya memuat ulang halaman atau
   membagikan tautannya memberi layar yang sama. */
const bacaPeriodeUrl = () => {
  const q = new URLSearchParams(window.location.search);
  const s = q.get("sumbu");
  const g = q.get("grup");
  /* URL yang menyebut salah satu batas dianggap sengaja — batas yang kosong
     di situ berarti "tanpa batas", bukan diisi bawaan */
  const adaTgl = q.has("dari") || q.has("sampai");
  const [dari, sampai] = rentangBawaan(today());
  return {
    sumbu: SUMBU.some(([kode]) => kode === s) ? s : "waktu",
    kelompok: KELOMPOK.some(([kode]) => kode === g) ? g : "produk",
    dari: adaTgl ? q.get("dari") || "" : dari,
    sampai: adaTgl ? q.get("sampai") || "" : sampai,
    cust: q.get("cari") || "",
  };
};

/* "Dokumen bulan berjalan boleh diperbaiki pembuatnya sendiri."

   Admin bebas. Selain itu: harus pembuat dokumen (penjualan.dibuat_oleh) DAN
   tanggalnya masih di bulan berjalan. Dokumen bulan lalu tetap lewat usulan
   hapus seperti sebelumnya, dan baris hasil import historis tidak punya
   dibuat_oleh sehingga jatuh ke admin saja.

   Ini hanya menentukan tombolnya muncul atau tidak — aturan yang mengikat ada
   di server (tolakUbahSO di api-server.js). Tanggal dibandingkan sebagai teks
   'YYYY-MM' supaya tidak ikut bergeser oleh zona waktu peramban. */
const bisaUbahSO = (so, user) =>
  !!user && !!so &&
  (user.peran === "admin" ||
    (!!so.dibuat_oleh && so.dibuat_oleh === user.id &&
      String(so.tgl).slice(0, 7) === today().slice(0, 7)));

function Penjualan({ penjualan, doCreatePenjualan, doUpdatePenjualan, user, pelanggan, produk, pById, cById, gById, totalSO, majuSO, mundurSO, piutang, say, can, minta, doDeletePenjualan, hapusUsulan, ajukanHapus, putusanHapus }) {
  const { t, lang } = useLang();
  const [rinci, setRinci] = useState(null); // penjualan yang rinciannya dibuka
  const [baru, setBaru] = useState(false);
  const [dok, setDok] = useState(null);
  const [detail, setDetail] = useState(null); // pelanggan yang dibuka dari peringkat
  const [tagihan, setTagihan] = useState(null); // piutang satu pelanggan
  const [sunting, setSunting] = useState(null);       // SO yang sedang diubah
  const [usulHapus, setUsulHapus] = useState(null);   // SO yang diusulkan dihapus
  const [putusanH, setPutusanH] = useState(null);     // usulan hapus yang diputuskan
  const tungguHapus = useMemo(() => menungguHapus(hapusUsulan, "penjualan"), [hapusUsulan]);
  const [f, setF] = useState(bacaPeriodeUrl);
  const { sumbu, kelompok, dari, sampai, cust } = f;
  const ubah = (b) => setF((s) => ({ ...s, ...b }));
  const daftarCust = useId();
  const hariIni = today();
  const d0 = dari, d1 = sampai;

  useEffect(() => {
    const q = new URLSearchParams();
    if (dari) q.set("dari", dari);
    if (sampai) q.set("sampai", sampai);
    if (sumbu !== "waktu") q.set("sumbu", sumbu);
    if (sumbu === "produk" && kelompok !== "produk") q.set("grup", kelompok);
    if (cust.trim()) q.set("cari", cust.trim());
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [sumbu, kelompok, dari, sampai, cust]);

  /* Dua lapis penyaring. Nama pelanggan disaring lebih dulu karena pembanding
     "vs bulan lalu" dan "vs tahun lalu" justru mengambil baris DI LUAR rentang
     tanggal terpilih; kalau tanggal ikut disaring di sini, Januari tidak akan
     pernah punya bulan sebelumnya untuk dibandingkan. */
  const perNama = useMemo(() => {
    const q = cust.trim().toLowerCase();
    return q ? penjualan.filter((s) => cById(s.pelanggan).nama.toLowerCase().includes(q)) : penjualan;
  }, [penjualan, cust, cById]);
  const list = useMemo(
    () => perNama.filter((s) => (!d0 || s.tgl >= d0) && (!d1 || s.tgl <= d1)),
    [perNama, d0, d1],
  );

  const agregat = useMemo(() => (rows) => rows.reduce((a, s) => {
    a.n += 1; a.qty += qtySO(s); a.total += totalSO(s);
    return a;
  }, KOSONG()), [totalSO]);

  const kini = useMemo(() => agregat(list), [list, agregat]);
  /* Periode yang sama tahun lalu. Rentang kustom tanpa tanggal tidak punya
     pembanding — null, bukan nol, supaya kartunya menulis "tidak ada data". */
  const lalu = useMemo(() => {
    const a = setahunLalu(d0), b = setahunLalu(d1);
    if (!a || !b) return null;
    const r = agregat(perNama.filter((s) => s.tgl >= a && s.tgl <= b));
    return r.n ? r : null;
  }, [perNama, d0, d1, agregat]);

  const isiBulan = useMemo(() => {
    const m = new Map();
    for (const s of list) {
      const ym = s.tgl.slice(0, 7);
      if (!m.has(ym)) m.set(ym, { ...KOSONG(), rows: [] });
      const b = m.get(ym);
      b.n += 1; b.qty += qtySO(s); b.total += totalSO(s); b.rows.push(s);
    }
    return m;
  }, [list, totalSO]);

  /* Sumbu bulan: Januari–Desember setiap tahun yang disentuh rentang atau
     data. Sumbu yang selalu dua belas bulan membuat batang bulan yang sama
     jatuh di tempat yang sama apa pun rentangnya, jadi dua kali membuka
     layar ini bisa dibandingkan sekilas. Bulan yang tersentuh data tetap
     dihitung: rentang kustom tanpa tanggal tidak punya rentang. */
  const graf = useMemo(() => {
    const tahun = new Set([...bulanRentang(d0, d1), ...isiBulan.keys()].map((ym) => ym.slice(0, 4)));
    const semua = [...tahun].sort().flatMap((y) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`));
    const ymIni = hariIni.slice(0, 7);
    return semua.map((ym) => {
      const b = isiBulan.get(ym);
      const total = b?.total || 0, qty = b?.qty || 0;
      return {
        ym, total, qty, n: b?.n || 0, rows: b ? b.rows : [],
        harga: hargaRata(total, qty),
        /* bulan yang belum tiba dibedakan dari bulan bernilai nol: yang satu
           belum terjadi, yang lain terjadi tanpa penjualan */
        datang: ym > ymIni,
      };
    });
  }, [isiBulan, d0, d1, hariIni]);

  /* Peringkat pelanggan atas sekumpulan SO. Dipakai dua kali: atas seluruh
     rentang (sumbu pelanggan) dan atas satu bulan yang diklik di grafik (sumbu
     waktu). Barisnya menyimpan SO-nya sendiri supaya pendalaman tidak perlu
     menyaring ulang seluruh buku. */
  /* Kuantitas dipecah menurut kategori produk: ban jadi (dijual dari stok) dan
     ban jasa (casing milik pelanggan yang divulkanisir). Keduanya "pcs", tetapi
     yang satu keluar dari gudang dan yang lain tidak — jumlah gabungannya
     tidak menjawab "berapa ban yang terjual". */
  const qtyKat = useCallback(
    (s, kat) => s.items.reduce((a, i) => a + (pById(i.produk).kategori === kat ? Number(i.qty) || 0 : 0), 0),
    [pById],
  );
  const peringkatPelanggan = useCallback((rows) => {
    const m = new Map();
    for (const s of rows) {
      let b = m.get(s.pelanggan);
      if (!b) { b = { id: s.pelanggan, ...KOSONG(), jadi: 0, jasa: 0, rows: [] }; m.set(s.pelanggan, b); }
      b.n += 1; b.qty += qtySO(s); b.jadi += qtyKat(s, "jadi"); b.jasa += qtyKat(s, "jasa");
      b.total += totalSO(s); b.rows.push(s);
    }
    return [...m.values()]
      .map((b) => ({ ...b, c: cById(b.id), harga: hargaRata(b.total, b.qty) }))
      .sort((a, z) => z.total - a.total);
  }, [cById, totalSO, qtyKat]);
  const perPelanggan = useMemo(() => peringkatPelanggan(list), [list, peringkatPelanggan]);
  /* Pembagi rata-rata bulanan = bulan di dalam rentang, bukan dua belas bulan
     sumbu grafik: Oktober yang belum tiba tidak boleh menurunkan rata-rata. */
  const bulanTerpakai = bulanRentang(d0, d1).length || graf.filter((g) => !g.datang).length;

  /* Bulan yang diklik di grafik. Bawaannya bulan terakhir yang berisi
     penjualan, supaya layar sudah menjawab sesuatu sebelum diklik. */
  const [bulanPilih, setBulanPilih] = useState(null);
  const bulanAktif = useMemo(() => {
    const ada = graf.find((g) => g.ym === bulanPilih);
    return ada || [...graf].reverse().find((g) => g.n > 0) || null;
  }, [graf, bulanPilih]);
  const perPelangganBulan = useMemo(
    () => (bulanAktif ? peringkatPelanggan(bulanAktif.rows) : []),
    [bulanAktif, peringkatPelanggan],
  );

  /* Peringkat produk dihitung dari baris item, bukan dari SO: satu SO berisi
     tiga item menyumbang ke tiga kelompok. "Transaksi" karena itu dihitung
     sebagai SO unik, bukan jumlah baris item. */
  const perProduk = useMemo(() => {
    const m = new Map();
    for (const s of list) {
      for (const i of s.items) {
        const p = pById(i.produk);
        const k = kelompok === "produk" ? i.produk : p[kelompok] || "";
        let b = m.get(k);
        if (!b) { b = { k, p, ...KOSONG(), so: new Set(), jenis: new Set() }; m.set(k, b); }
        const q = Number(i.qty) || 0;
        b.qty += q; b.total += q * (Number(i.harga) || 0);
        b.so.add(s.id); b.jenis.add(i.produk);
      }
    }
    return [...m.values()]
      .map((b) => ({ ...b, n: b.so.size, harga: hargaRata(b.total, b.qty) }))
      .sort((a, z) => z.total - a.total);
  }, [list, pById, kelompok]);

  /* Pelanggan baru & hilang. Keduanya butuh dua rentang sekaligus, jadi
     rentang kustom yang belum terisi lengkap tidak menghasilkan apa pun —
     tanpa batas bawah, SETIAP pelanggan terbaca sebagai baru. */
  const gerak = useMemo(() => {
    if (!d0 || !d1) return null;
    const a = setahunLalu(d0), z = setahunLalu(d1);
    const pertama = new Map(), terakhir = new Map(), sekarang = new Set(), setahun = new Map();
    for (const s of perNama) {
      const id = s.pelanggan;
      if (!pertama.has(id) || s.tgl < pertama.get(id)) pertama.set(id, s.tgl);
      if (!terakhir.has(id) || s.tgl > terakhir.get(id)) terakhir.set(id, s.tgl);
      if (s.tgl >= d0 && s.tgl <= d1) sekarang.add(id);
      if (s.tgl >= a && s.tgl <= z) setahun.set(id, (setahun.get(id) || 0) + totalSO(s));
    }
    const nilai = new Map(perPelanggan.map((b) => [b.id, b.total]));
    return {
      baru: [...sekarang]
        .filter((id) => pertama.get(id) >= d0)
        .map((id) => ({ id, c: cById(id), tgl: pertama.get(id), total: nilai.get(id) || 0 }))
        .sort((x, y) => y.total - x.total),
      hilang: [...setahun.keys()]
        .filter((id) => !sekarang.has(id))
        .map((id) => ({ id, c: cById(id), tgl: terakhir.get(id), lalu: setahun.get(id), jeda: diffDays(terakhir.get(id), hariIni) }))
        .sort((x, y) => y.lalu - x.lalu),
    };
  }, [perNama, d0, d1, perPelanggan, cById, totalSO, hariIni]);

  /* Penyaring berganti berarti susunan barisnya berganti pula, jadi keadaan
     buka/tutup dan bulan pilihan yang lama tidak lagi berarti apa-apa. */
  const kunci = `${d0}|${d1}|${cust.trim()}`;
  const [bukaCust, setBukaCust] = useState(() => new Set());
  const [semua, setSemua] = useState(false); // peringkat penuh, bukan hanya sepuluh teratas
  useEffect(() => {
    setBukaCust(new Set());
    setSemua(false);
    setBulanPilih(null);
  }, [kunci]);
  const balik = (set, k) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  /* Piutang dipinjam dari perhitungan umur piutang yang sama dengan layar
     Piutang, supaya angkanya tidak pernah berbeda antar layar. Dikelompokkan
     sekali untuk seluruh tabel: memanggil piutang(id) per baris berarti
     menyisir seluruh buku sebanyak jumlah baris peringkat. */
  const tagihanCust = useMemo(() => {
    const m = new Map();
    for (const r of hitungPiutang(penjualan, cById, totalSO).piutangRows) {
      const cur = m.get(r.c.id) || { nilai: 0, rows: [] };
      cur.nilai += r.nilai; cur.rows.push(r);
      m.set(r.c.id, cur);
    }
    return m;
  }, [penjualan, cById, totalSO]);

  /* Berkas keluar memakai angka penuh, bukan satuan juta/miliar: nilainya
     dipakai untuk dihitung ulang, bukan dibaca sekilas. */
  const unduhExcel = () => {
    const aoa = sumbu === "pelanggan"
      ? [
          [t("Peringkat"), t("Pelanggan"), t("Kota"), t("Transaksi|kolom"), t("Ban Jadi"), t("Ban Jasa"), t("Total Qty"), t("Nilai Penjualan"), t("Harga Rata-rata"), t("Piutang")],
          ...perPelanggan.map((b, i) => [i + 1, b.c.nama, namaKota(b.c.kota, t), b.n, b.jadi, b.jasa, b.qty, b.total, b.harga ?? "", tagihanCust.get(b.id)?.nilai || 0]),
        ]
      : sumbu === "produk"
        ? [
            [t("Peringkat"), t(KELOMPOK.find(([k]) => k === kelompok)[1]), t("Transaksi|kolom"), t("Qty"), t("Nilai Penjualan"), t("Harga Rata-rata")],
            ...perProduk.map((b, i) => [i + 1, namaKelompok(b, kelompok, t), b.n, b.qty, b.total, b.harga ?? ""]),
          ]
        : [
            [t("No."), t("Tanggal"), t("Pelanggan"), t("PIC"), t("Kota"), t("Gudang"), t("Status"), t("Rincian"), t("Qty"), t("Total")],
            ...list.map((s) => [
              s.no, s.tgl, cById(s.pelanggan).nama, cById(s.pelanggan).pic, namaKota(cById(s.pelanggan).kota, t), kodeGudang(gById(s.gudang)),
              t(SO_LABEL[s.status].id),
              s.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", "),
              qtySO(s), totalSO(s),
            ]),
          ];
    downloadXlsx(`penjualan_${sumbu}_${today()}`, "Penjualan", aoa);
  };

  /* Baris transaksi di bawah pelanggan yang dibuka. Jumlah selnya harus persis
     sama dengan baris peringkat — baris dengan jumlah sel yang salah merusak
     lebar seluruh tabel. */
  /* nol kategori ditulis "—", bukan "0": baris yang hanya menjual ban jadi
     tidak "menjual 0 jasa", kategorinya saja tidak ada di situ */
  const selQty = (n) => <td className="r n">{n ? fmt(n) : <span className="mut">—</span>}</td>;
  const barisSO = (s) => (
    <tr key={s.id} className="br-t klik" onClick={() => setRinci(s)}>
      <td className="no" />
      <td>
        <span className="per per-h">
          <button type="button" className="namelink strong" title={t("Lihat rincian")}
            onClick={(e) => { e.stopPropagation(); setRinci(s); }}>{s.no}</button>
          <Status s={s.status} map={SO_LABEL} />
          <em className="mut2">
            {s.tgl} · {s.items.map((i) => `${pById(i.produk).kode} × ${fmt(i.qty)}`).join(", ")}
          </em>
        </span>
      </td>
      <td />
      {selQty(qtyKat(s, "jadi"))}
      {selQty(qtyKat(s, "jasa"))}
      <td className="r n">{fmt(qtySO(s))}</td>
      <td className="r n">{satuan(totalSO(s))}</td>
      <td className="r n mut">{hargaRata(totalSO(s), qtySO(s)) == null ? "—" : satuan(hargaRata(totalSO(s), qtySO(s)))}</td>
      <td /><td />
    </tr>
  );

  /* Tabel peringkat pelanggan, satu bentuk untuk seluruh rentang dan untuk
     satu bulan. "Porsi" dihitung terhadap total baris yang ditampilkan, bukan
     terhadap total rentang: di kartu bulan, porsi seorang pelanggan atas
     setahun tidak menjawab "siapa yang besar bulan ini". */
  /* Baris total dihitung dari seluruh peringkat, bukan hanya 10 teratas yang
     tampak — "Tampilkan Semua" mengubah apa yang terlihat, bukan jumlahnya. */
  const jumlahPeringkat = (rows) => {
    const j = { n: 0, jadi: 0, jasa: 0, qty: 0, total: 0, piutang: 0 };
    for (const b of rows) {
      j.n += b.n; j.jadi += b.jadi; j.jasa += b.jasa; j.qty += b.qty; j.total += b.total;
      j.piutang += tagihanCust.get(b.id)?.nilai || 0;
    }
    return { ...j, harga: hargaRata(j.total, j.qty) };
  };
  const tabelPelanggan = (rows, total) => {
    const j = jumlahPeringkat(rows);
    return (
    <>
      <table className="drill rank">
        <thead>
          <tr>
            <th scope="col" className="no">#</th>
            <th scope="col">{t("Pelanggan")}</th>
            <th scope="col" className="r">{t("Transaksi|kolom")}</th>
            <th scope="col" className="r">{t("Jadi|kolom")}</th>
            <th scope="col" className="r">{t("Jasa|kolom")}</th>
            <th scope="col" className="r">{t("Total Qty")}</th>
            <th scope="col" className="r">{t("Nilai Penjualan")}</th>
            <th scope="col" className="r">{t("Harga Rata-rata")}</th>
            <th scope="col" className="r porsi-th">{t("Porsi")}</th>
            <th scope="col" className="r">{t("Piutang")}</th>
          </tr>
        </thead>
        <tbody>
          {puncak(rows).map((b, i) => {
            const on = bukaCust.has(b.id);
            const ar = tagihanCust.get(b.id);
            return (
              <React.Fragment key={b.id}>
                <tr className="br-b">
                  <td className="no">{i + 1}</td>
                  <td>
                    <span className="per per-b rank-nama">
                      <button type="button" className="chevb" aria-expanded={on}
                        aria-label={t("Rincian transaksi")} onClick={() => setBukaCust((s) => balik(s, b.id))}>
                        <span className="chev">{on ? "▾" : "▸"}</span>
                      </button>
                      <button type="button" className="namelink strong" title={t("Lihat rincian")}
                        onClick={() => setDetail(b.c)}>{b.c.nama}</button>
                      <em className="mut2">{namaKota(b.c.kota, t) || "-"}</em>
                    </span>
                  </td>
                  <td className="r n">{fmt(b.n)}</td>
                  {selQty(b.jadi)}
                  {selQty(b.jasa)}
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n strong">{satuan(b.total)}</td>
                  <td className="r n">{b.harga == null ? "—" : satuan(b.harga)}</td>
                  <td className="r"><Porsi v={total ? (b.total / total) * 100 : 0} /></td>
                  <td className="r n">
                    {ar
                      ? <button type="button" className="namelink" title={t("Lihat rincian")}
                          onClick={() => setTagihan({ label: b.c.nama, rows: ar.rows })}>{satuan(ar.nilai)}</button>
                      : <span className="mut">—</span>}
                  </td>
                </tr>
                {on && b.rows.map(barisSO)}
              </React.Fragment>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={10}><Empty id={t("Tidak ada transaksi pada filter ini.")} /></td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="tf-total">
              <td className="no" />
              <td className="rank-total"><b>{t("Total")}</b><em className="mut2">{t("{n} pelanggan", { n: fmt(rows.length) })}</em></td>
              <td className="r n strong">{fmt(j.n)}</td>
              <td className="r n strong">{j.jadi ? fmt(j.jadi) : "—"}</td>
              <td className="r n strong">{j.jasa ? fmt(j.jasa) : "—"}</td>
              <td className="r n strong">{fmt(j.qty)}</td>
              <td className="r n strong">{satuan(j.total)}</td>
              <td className="r n strong">{j.harga == null ? "—" : satuan(j.harga)}</td>
              <td className="r n strong">{total ? `${fmt((j.total / total) * 100)}%` : "—"}</td>
              <td className="r n strong">{j.piutang ? satuan(j.piutang) : "—"}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <KakiSemua total={rows.length} semua={semua} onToggle={() => setSemua((v) => !v)} />
    </>
    );
  };

  const puncak = (rows) => (semua ? rows : rows.slice(0, PERINGKAT_N));

  return (
    <>
      <SectionTitle id={t("Penjualan")}
        mid={
          <div className="filters jual-filter">
            <label className="fld">
              <span className="lbl">{t("Dari")}</span>
              <Tgl value={dari} onChange={(v) => ubah({ dari: v })} max={sampai || undefined} />
            </label>
            <label className="fld">
              <span className="lbl">{t("Sampai")}</span>
              <Tgl value={sampai} onChange={(v) => ubah({ sampai: v })} min={dari || undefined} />
            </label>
            <label className="fld cari">
              <span className="lbl">{t("Pelanggan")}</span>
              <input type="search" list={daftarCust} value={cust} placeholder={t("Cari nama pelanggan")}
                onChange={(e) => ubah({ cust: e.target.value })} />
              <datalist id={daftarCust}>
                {pelanggan.map((c) => <option key={c.id} value={c.nama} />)}
              </datalist>
            </label>
          </div>
        }>
        <button className="btn" onClick={unduhExcel}>↓ Excel</button>
        <button className="btn pri" onClick={() => setBaru(true)}>{t("+ Penjualan Baru")}</button>
      </SectionTitle>

      <KartuUsulHapus jenis="penjualan" hapusUsulan={hapusUsulan} can={can} onPutuskan={setPutusanH} />

      <div className="kpis jual-kpi">
        <KpiTren label={t("Nilai Penjualan")} val={rpRingkas(kini.total)} delta={naikTurun(kini.total, lalu?.total)} />
        <KpiTren label={t("Kuantitas")} val={`${fmt(kini.qty)} pcs`} delta={naikTurun(kini.qty, lalu?.qty)} />
        <KpiTren label={t("Harga Rata-rata")}
          val={hargaRata(kini.total, kini.qty) == null ? "—" : `${rpRingkas(hargaRata(kini.total, kini.qty))}/pcs`}
          delta={lalu ? naikTurun(hargaRata(kini.total, kini.qty), hargaRata(lalu.total, lalu.qty)) : null} />
        <KpiTren label={t("Jumlah Transaksi")} val={t("{n} transaksi", { n: fmt(kini.n) })}
          sub={t("rata-rata {n}/bulan", { n: fmt(bulanTerpakai ? kini.n / bulanTerpakai : 0) })} />
      </div>

      {/* Sumbu analisis. Diletakkan di bawah KPI, bukan di deret penyaring:
          yang berganti bukan data yang dihitung, melainkan cara membacanya. */}
      <div className="chips sumbu" role="group" aria-label={t("Sumbu Analisis")}>
        {SUMBU.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={sumbu === k}
            className={"chip-b" + (sumbu === k ? " on" : "")} onClick={() => ubah({ sumbu: k })}>{t(label)}</button>
        ))}
      </div>

      {sumbu === "waktu" && (
        <>
          <GrafBulanan data={graf} lang={lang} pilih={bulanAktif?.ym} onPilih={setBulanPilih} />

          {graf.length === 0 && (
            <Card><Empty id={penjualan.length ? t("Tidak ada transaksi pada filter ini.") : t("Belum ada transaksi penjualan.")} /></Card>
          )}
          {bulanAktif && (
            <Card cls="drill-card" title={t("Pelanggan pada {bulan}", { bulan: bulanLabel(bulanAktif.ym, lang) })}
              note={t("klik bulan lain pada grafik untuk berganti")}>
              {tabelPelanggan(perPelangganBulan, bulanAktif.total)}
            </Card>
          )}
        </>
      )}

      {sumbu === "pelanggan" && (
        <>
          <Card cls="drill-card" title={t("Peringkat Pelanggan")}
            note={t("diurutkan menurut nilai penjualan pada periode terpilih")}>
            {tabelPelanggan(perPelanggan, kini.total)}
          </Card>

          <div className="grid2 gerak">
            <Card title={t("Pelanggan Baru")} note={t("transaksi pertamanya jatuh di dalam periode ini")}>
              <DaftarGerak rows={gerak?.baru} kosong={t("Belum ada pelanggan baru pada periode ini.")}
                takJelas={!gerak} onPilih={setDetail}
                kolom={(r) => <><td className="n">{r.tgl}</td><td className="r n strong">{satuan(r.total)}</td></>}
                kepala={<><th scope="col">{t("Transaksi Pertama")}</th><th scope="col" className="r">{t("Nilai Penjualan")}</th></>} />
            </Card>
            <Card title={t("Pelanggan Hilang")} note={t("ada penjualan pada periode yang sama tahun lalu, tidak ada sekarang")}>
              <DaftarGerak rows={gerak?.hilang} kosong={t("Tidak ada pelanggan yang hilang.")}
                takJelas={!gerak} onPilih={setDetail}
                kolom={(r) => (
                  <>
                    <td className="n">{r.tgl}<em className="mut2">{t("{n} hari lalu", { n: fmt(r.jeda) })}</em></td>
                    <td className="r n strong">{satuan(r.lalu)}</td>
                  </>
                )}
                kepala={<><th scope="col">{t("Transaksi Terakhir")}</th><th scope="col" className="r">{t("Nilai Tahun Lalu")}</th></>} />
            </Card>
          </div>
        </>
      )}

      {sumbu === "produk" && (
        <Card cls="drill-card" title={t("Peringkat Produk")}
          note={t("transaksi dihitung sebagai SO unik, bukan baris item")}>
          <div className="chips rank-grup" role="group" aria-label={t("Kelompok")}>
            {KELOMPOK.map(([k, label]) => (
              <button key={k} type="button" className={"chip-b" + (kelompok === k ? " on" : "")}
                aria-pressed={kelompok === k} onClick={() => ubah({ kelompok: k })}>{t(label)}</button>
            ))}
          </div>
          <table className="drill rank">
            <thead>
              <tr>
                <th scope="col" className="no">#</th>
                <th scope="col">{t(KELOMPOK.find(([k]) => k === kelompok)[1])}</th>
                <th scope="col" className="r">{t("Transaksi|kolom")}</th>
                <th scope="col" className="r">{t("Qty")}</th>
                <th scope="col" className="r">{t("Nilai Penjualan")}</th>
                <th scope="col" className="r">{t("Harga Rata-rata")}</th>
                <th scope="col" className="r porsi-th">{t("Porsi")}</th>
              </tr>
            </thead>
            <tbody>
              {puncak(perProduk).map((b, i) => (
                <tr key={b.k || "-"} className="br-b">
                  <td className="no">{i + 1}</td>
                  <td>
                    <span className="per per-b">
                      {namaKelompok(b, kelompok, t)}
                      <em className="mut2">
                        {kelompok === "produk"
                          ? [b.p.ukuran, b.p.pola].filter(Boolean).join(" · ") || "-"
                          : t("{n} produk", { n: fmt(b.jenis.size) })}
                      </em>
                    </span>
                  </td>
                  <td className="r n">{fmt(b.n)}</td>
                  <td className="r n">{fmt(b.qty)}</td>
                  <td className="r n strong">{satuan(b.total)}</td>
                  <td className="r n">{b.harga == null ? "—" : satuan(b.harga)}</td>
                  <td className="r"><Porsi v={kini.total ? (b.total / kini.total) * 100 : 0} /></td>
                </tr>
              ))}
              {perProduk.length === 0 && <tr><td colSpan={7}><Empty id={t("Tidak ada transaksi pada filter ini.")} /></td></tr>}
            </tbody>
          </table>
          <KakiSemua total={perProduk.length} semua={semua} onToggle={() => setSemua((v) => !v)} />
        </Card>
      )}

      {baru && (
        <FormPenjualan
          close={() => setBaru(false)} pelanggan={pelanggan} produk={produk}
          piutang={piutang} say={say} submit={doCreatePenjualan}
          nomor={(tgl) => nomorBaru("SO", penjualan, tgl)}
        />
      )}
      {/* Form yang sama dipakai untuk mengubah: yang berbeda hanya nilai awal,
          judul, dan bahwa nomor/tanggal dokumen dipertahankan apa adanya. */}
      {sunting && (
        <FormPenjualan
          awal={sunting}
          close={() => setSunting(null)} pelanggan={pelanggan} produk={produk}
          piutang={piutang} say={say} submit={doUpdatePenjualan}
        />
      )}
      {/* Tabel ringkas tidak lagi memuat kolom aksi — semua tindakan atas satu
          transaksi pindah ke dialog rinciannya, tempat angkanya juga terbaca. */}
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)} onCetak={() => { setDok(rinci); setRinci(null); }}
          onMaju={rinci.status !== "lunas" ? () => { majuSO(rinci); setRinci(null); } : null}
          onMundur={SO_FLOW.indexOf(rinci.status) > SO_FLOW.indexOf("pesanan") ? () => { mundurSO(rinci); setRinci(null); } : null}
          /* Ubah & Hapus langsung dibuka aturan yang sama: admin, atau pembuat
             dokumen selama masih bulan berjalan. Di luar itu tombol hapusnya
             tetap berarti "Usul Hapus" dan tombol ubahnya tidak muncul. */
          onUbah={bisaUbahSO(rinci, user) ? () => { setSunting(rinci); setRinci(null); } : null}
          hapus={{
            label: bisaUbahSO(rinci, user) ? t("Hapus") : t("Usul Hapus"),
            tunggu: tungguHapus.has(rinci.id),
            aksi: bisaUbahSO(rinci, user)
              ? () => minta(t("Hapus penjualan {no}? Data & mutasi stoknya ikut terhapus.", { no: rinci.no }),
                  () => { doDeletePenjualan(rinci); setRinci(null); })
              /* dialog berurutan, bukan bertumpuk: rincian ditutup dulu */
              : () => { setUsulHapus(rinci); setRinci(null); },
          }} />
      )}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)}
          onPilihSO={(s) => { setRinci(s); setDetail(null); }} />
      )}
      {tagihan && (
        <DaftarUmur label={tagihan.label} rows={tagihan.rows} close={() => setTagihan(null)}
          onPilih={(s) => { setRinci(s); setTagihan(null); }} />
      )}
      {dok && (
        <DokumenPenjualan so={dok} pById={pById} cById={cById} gById={gById} totalSO={totalSO} close={() => setDok(null)} />
      )}
      {usulHapus && (
        <FormUsulHapus jenis="penjualan" sasaran={usulHapus.id} judul={usulHapus.no}
          ket={`${usulHapus.tgl} · ${cById(usulHapus.pelanggan).nama} · ${rp(totalSO(usulHapus))}`}
          close={() => setUsulHapus(null)} say={say} submit={ajukanHapus} />
      )}
      {putusanH && (
        <FormPutusanHapus u={putusanH} close={() => setPutusanH(null)} say={say} submit={putusanHapus} />
      )}
    </>
  );
}

/* Nama satu baris peringkat. Kelompok ukuran/pola bisa kosong di basis data —
   dibaca sebagai "tanpa ukuran", bukan sebagai baris tanpa nama. */
const namaKelompok = (b, kelompok, t) =>
  (kelompok === "produk" ? [b.p.kode, b.p.nama].filter(Boolean).join(" · ") : b.k) || t("(tidak diisi)");

/* Bilah porsi digambar di dalam sel, di belakang angkanya: satu kolom untuk
   dua keterangan, sehingga tabel peringkat tidak melebar. */
const Porsi = ({ v }) => (
  <span className="porsi">
    <span className="porsi-b" style={{ width: `${Math.min(Math.max(v, 0), 100)}%` }} />
    <em>{v.toFixed(1)}%</em>
  </span>
);

/* Daftar pelanggan baru / hilang. Keduanya hanya berbeda pada dua kolom
   terakhir, jadi kolomnya disuntikkan, bukan disalin menjadi dua komponen. */
function DaftarGerak({ rows, kepala, kolom, kosong, takJelas, onPilih }) {
  const { t } = useLang();
  const [semua, setSemua] = useState(false);
  if (takJelas) return <Empty id={t("Pilih tanggal awal dan akhir untuk membandingkan.")} />;
  if (!rows.length) return <Empty id={kosong} />;
  return (
    <>
    <Scroll>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("Pelanggan")}</th>
            {kepala}
          </tr>
        </thead>
        <tbody>
          {(semua ? rows : rows.slice(0, PERINGKAT_N)).map((r) => (
            <tr key={r.id} className="klik" onClick={() => onPilih(r.c)}>
              <td>
                <button type="button" className="namelink" title={t("Lihat rincian")}>{r.c.nama}</button>
                <em className="mut2">{namaKota(r.c.kota, t) || "-"}</em>
              </td>
              {kolom(r)}
            </tr>
          ))}
        </tbody>
      </table>
    </Scroll>
    <KakiSemua total={rows.length} semua={semua} onToggle={() => setSemua((v) => !v)} />
    </>
  );
}

/* Grafik batang bulanan dengan garis kuantitas. Digambar langsung sebagai
   HTML + satu polyline SVG, tanpa pustaka grafik: dua belas batang dan satu
   garis tidak sepadan dengan ~150 kB tambahan di bundel.
   Tinggi batang dihitung dalam piksel, bukan persen, supaya garis SVG yang
   dibentangkan di atasnya memakai sistem koordinat yang persis sama.
   Skala batang dibuat 10% lebih pendek dari skala garis dan garis diangkat
   10% tinggi plot dari dasar, supaya titik garis tidak menempel di puncak
   batang bulan yang nilai dan kuantitasnya sama-sama tertinggi. */
const GRAF_T = 200, GRAF_BAR = 150, GRAF_BATANG = GRAF_BAR * 0.9, GRAF_X = 16,
  GRAF_DASAR = GRAF_T - GRAF_X, GRAF_ANGKAT = GRAF_T * 0.1;
function GrafBulanan({ data, lang, pilih, onPilih }) {
  const { t } = useLang();
  const [tip, setTip] = useState(null);
  const plotRef = useRef(null);
  const [lebarKol, setLebarKol] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setLebarKol(e.contentRect.width / Math.max(data.length, 1)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.length]);
  const maxNilai = Math.max(...data.map((d) => d.total), 0);
  const maxQty = Math.max(...data.map((d) => d.qty), 0);
  if (!data.length) return null;

  /* Label kuantitas di atas titiknya — tetapi di lembah, ruas garis ke
     tetangga yang lebih tinggi lewat tepat di tempat label itu. Maka label
     diangkat setinggi garis pada tepi kiri/kanan label: tinggi garis pada
     jarak w dari titik adalah interpolasi linear ke titik tetangga, dan w
     adalah setengah lebar label dibagi lebar kolom. Lebar kolom diukur,
     bukan ditebak, karena grafik melar mengikuti lebar layar. */
  const tinggiQ = (d) => (d.datang || maxQty === 0 ? null : (d.qty / maxQty) * GRAF_BAR);
  const angkatLabel = (i) => {
    const h = tinggiQ(data[i]);
    if (h == null || !lebarKol) return 0;
    const r = Math.min(0.5, ((`${fmt(data[i].qty)} pcs`.length * 6.5) / 2 + 2) / lebarKol);
    let naik = 0;
    for (const j of [i - 1, i + 1]) {
      const hj = j >= 0 && j < data.length ? tinggiQ(data[j]) : null;
      if (hj != null) naik = Math.max(naik, (hj - h) * r);
    }
    return naik;
  };

  /* Bulan yang belum tiba dilewati, bukan digambar sebagai nol: garisnya akan
     terjun ke dasar dan terbaca sebagai penurunan yang belum terjadi. Bulan
     yang sudah lewat tanpa penjualan tetap digambar — nol di situ nyata. */
  const titik = data
    .map((d, i) => (d.datang ? null : `${((i + 0.5) / data.length) * 100},${GRAF_DASAR - GRAF_ANGKAT - (maxQty ? (d.qty / maxQty) * GRAF_BAR : 0)}`))
    .filter(Boolean).join(" ");
  const aktif = tip == null ? null : data[tip];

  return (
    <Card cls="graf-card" title={t("Tren Bulanan")} note={t("Batang = nilai penjualan · garis = kuantitas")}>
      <div className="graf-plot" ref={plotRef} style={{ height: GRAF_T }}>
        {maxQty > 0 && (
          <svg className="graf-garis" viewBox={`0 0 100 ${GRAF_T}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={titik} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {data.map((d, i) => (
          <button key={d.ym} type="button"
            className={"graf-kol" + (d.datang ? " datang" : "") + (tip === i ? " sorot" : "") + (d.ym === pilih ? " pilih" : "")}
            disabled={d.n === 0} aria-pressed={d.ym === pilih} aria-label={`${bulanLabel(d.ym, lang)} — ${rpRingkas(d.total)}`}
            onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}
            onFocus={() => setTip(i)} onBlur={() => setTip(null)}
            onClick={() => onPilih(d.ym)}>
            {/* nilai di tengah batangnya, kuantitas tepat di atas titik garisnya:
                tiap angka menempel pada bentuk yang diwakilinya. Nilai ditulis
                lengkap dengan satuannya — tabel di bawah grafik sudah tidak ada. */}
            <span className="graf-bar" style={{ height: maxNilai ? Math.round((d.total / maxNilai) * GRAF_BATANG) : 0 }}>
              {d.total > 0 && <span className="graf-nilai">{satuan(d.total)}</span>}
            </span>
            <span className="graf-x">{bulanSingkat(d.ym, lang)}</span>
            {!d.datang && d.qty > 0 && (
              <span className="graf-q" style={{ bottom: Math.min(GRAF_T - 12, GRAF_X + GRAF_ANGKAT + tinggiQ(d) + angkatLabel(i) + 3) }}>
                {fmt(d.qty)} pcs
              </span>
            )}
          </button>
        ))}
        {aktif && (
          <div className="graf-tip" style={{ left: `${((tip + 0.5) / data.length) * 100}%` }}>
            <b>{bulanLabel(aktif.ym, lang)}</b>
            <span>{t("Transaksi|kolom")}<em>{fmt(aktif.n)}</em></span>
            <span>{t("Qty")}<em>{fmt(aktif.qty)} pcs</em></span>
            <span>{t("Nilai Penjualan")}<em>{rpRingkas(aktif.total)}</em></span>
          </div>
        )}
      </div>
    </Card>
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
function RincianPenjualan({ so, pById, cById, gById, totalSO, close, onCetak, onMaju, onMundur, onUbah, hapus }) {
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
            <div><span className="lbl2">{t("Gudang")}</span><b>{namaGudang(gById(so.gudang), t)}</b></div>
            <div><span className="lbl2">{t("Status")}</span><Status s={so.status} map={SO_LABEL} /></div>
            <div><span className="lbl2">{t("Termin")}</span><b>{t("{n} hari", { n: c.termin })}</b></div>
            <div><span className="lbl2">{t("Jatuh Tempo")}</span><b>{addDays(so.tgl, Number(c.termin) || 30)}</b></div>
            {/* Baris lama hasil import dikirim tanpa tanggal ini; "—" lebih
                jujur daripada meminjam tanggal dokumen. */}
            <div><span className="lbl2">{t("Tanggal Kirim")}</span><b>{so.tgl_kirim || "—"}</b></div>
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
        {/* Tindakan atas transaksi ini. Layar daftar tidak lagi punya kolom
            aksi — tombolnya pindah ke sini, tempat nilai yang sedang diubah
            statusnya juga terbaca. Logikanya tetap milik layar induk. */}
        <div className="md-ft">
          {/* Satu tombol, dua arti: admin menghapus, peran lain mengusulkan. */}
          {hapus && (hapus.tunggu ? (
            <span title={t("Permintaan hapus sedang menunggu putusan admin.")}>
              <button className="btn" disabled>{t("Menunggu Putusan")}</button>
            </span>
          ) : (
            <button className="btn danger" onClick={hapus.aksi}>{hapus.label}</button>
          ))}
          {onUbah && <button className="btn" onClick={onUbah}>{t("Ubah")}</button>}
          <span className="ft-isi" />
          {onMundur && (
            <button className="btn" title={t("Kembalikan status satu langkah")} onClick={onMundur}>
              ← {t(SO_LABEL[SO_FLOW[SO_FLOW.indexOf(so.status) - 1]].id)}
            </button>
          )}
          {onMaju && (
            <button className="btn" onClick={onMaju}>
              → {t(SO_LABEL[SO_FLOW[SO_FLOW.indexOf(so.status) + 1]].id)}
            </button>
          )}
          {onCetak && <button className="btn" title={t("Cetak dokumen")} onClick={onCetak}>{t("Cetak")}</button>}
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

/* Dipakai dua arah: tanpa `awal` = penjualan baru, dengan `awal` = mengubah
   dokumen yang sudah ada. Yang TIDAK bisa diubah dari sini adalah nomor,
   tanggal, dan status — nomor menaut buku mutasi, tanggal menentukan dokumen
   ini masih boleh disentuh atau tidak, dan status punya tombol majunya sendiri. */
function FormPenjualan({ close, pelanggan, produk, piutang, say, submit, nomor, awal }) {
  /* yang bisa dijual: ban jadi + Ban Jasa */
  const { t } = useLang();
  const jadi = produk.filter((p) => ["jadi", "jasa"].includes(p.kategori));
  const [f, setF] = useState(awal
    ? { pelanggan: awal.pelanggan, gudang: awal.gudang, tgl: awal.tgl,
        status: awal.status, tglKirim: awal.tgl_kirim || "" }
    : { pelanggan: "", gudang: "", tgl: today() });
  const [items, setItems] = useState(awal
    ? awal.items.map((i) => ({ produk: i.produk, qty: String(i.qty), harga: String(i.harga) }))
    : [{ produk: "", qty: "", harga: "" }]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const ubah = (i, k, v) => setItems((l) => l.map((x, n) => {
    if (n !== i) return x;
    const y = { ...x, [k]: v };
    if (k === "produk") y.harga = (jadi.find((p) => p.id === v) || {}).harga ?? "";
    return y;
  }));
  const total = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);
  const c = pelanggan.find((p) => p.id === f.pelanggan) || {};
  /* limit 0 = belum diatur, bukan "tidak boleh berutang": pelanggan hasil impor
     masuk dengan limit_kredit bawaan 0, dan menolaknya di sini membuat mereka
     tidak bisa dijual sama sekali. Layar pelanggan sudah membaca 0 begitu juga. */
  const adaLimit = punyaLimit(c);
  /* Saat mengubah dokumen yang sudah masuk hitungan piutang (kirim/tagihan),
     nilai LAMA-nya sudah ada di dalam piutang(c.id). Kalau tidak dikembalikan
     dulu, total baru akan dihitung dua kali dan koreksi kecil pun tertolak
     sebagai "melebihi limit". */
  const sudahDihitung = awal && ["kirim", "tagihan"].includes(awal.status)
    ? awal.items.reduce((a, i) => a + i.qty * i.harga, 0) : 0;
  const sisaLimit = adaLimit ? c.limit - (piutang(c.id) - sudahDihitung) - total : null;
  const lewatLimit = sisaLimit !== null && sisaLimit < 0;
  /* Status & tanggal kirim hanya muncul saat mengubah dokumen: penjualan baru
     selalu lahir sebagai penawaran, dan memilih statusnya di sini hanya akan
     membuat langkah pertamanya bisa dilewati tanpa sengaja. */
  const dikirim = awal && SO_FLOW.indexOf(f.status) >= SO_FLOW.indexOf("kirim");

  const kirim = async () => {
    if (!f.pelanggan) return say(t("Pilih pelanggan terlebih dahulu."), true);
    if (!f.gudang) return say(t("Pilih gudang pengirim terlebih dahulu."), true);
    const salah = items.find((i) => String(i.qty).trim() !== "" && !(Number(i.qty) > 0));
    if (salah) return say(t("Qty harus berupa angka lebih besar dari 0."), true);
    const valid = items.filter((i) => Number(i.qty) > 0);
    if (!valid.length) return say(t("Tambahkan minimal satu baris barang."), true);
    if (valid.some((i) => !i.produk)) return say(t("Pilih barang untuk setiap baris."), true);
    if (valid.some((i) => !(Number(i.harga) >= 0))) return say(t("Harga harus berupa angka."), true);
    if (lewatLimit) return say(t("Melebihi limit kredit {nama} sebesar {v}.", { nama: c.nama, v: rp(-sisaLimit) }), true);
    if (dikirim && f.tglKirim && f.tglKirim < awal.tgl && !bolehMundurTgl())
      return say(t("Tanggal kirim tidak boleh mendahului tanggal dokumen ({tgl}).", { tgl: awal.tgl }), true);
    try {
      const baris = valid.map((i) => ({ produk: i.produk, qty: Number(i.qty), harga: Number(i.harga) }));
      await submit(awal
        ? { id: awal.id, no: awal.no, tgl: awal.tgl, pelanggan: f.pelanggan, gudang: f.gudang, items: baris,
            status: f.status,
            /* kosong = biar server yang memilih (tanggal kirim lama, atau
               tanggal dokumen bila dokumen ini baru dinyatakan terkirim) */
            tgl_kirim: dikirim ? (f.tglKirim || null) : null }
        : {
            id: uid("SO"), no: nomor(f.tgl),
            tgl: f.tgl, pelanggan: f.pelanggan, gudang: f.gudang, status: "penawaran",
            items: baris,
          });
      close();
    } catch (e) { say(e.message, true); }
  };

  return (
    <Modal title={awal ? t("Ubah Penjualan {no}", { no: awal.no }) : t("Penjualan Baru")}
      close={close} onSave={kirim} wide
      saveLabel={awal ? t("Simpan Perubahan") : t("Simpan Penawaran")}>
      <div className="row2">
        <Combo label={t("Pelanggan")} value={f.pelanggan} onChange={set("pelanggan")} placeholder={t("-- Pilih Pelanggan --")} opts={pelanggan.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
        <Combo label={t("Gudang Pengirim")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={opsiGudang(t)} />
      </div>

      {awal && (
        <div className="row2">
          <Sel label={t("Status")} value={f.status} onChange={set("status")}
            opts={SO_FLOW.map((k) => [k, t(SO_LABEL[k].id)])} />
          <Inp label={t("Tanggal Kirim")} type="date" value={f.tglKirim} onChange={set("tglKirim")}
            disabled={!dikirim}
            hint={dikirim
              ? t("Tanggal dokumen: {tgl}", { tgl: awal.tgl })
              : t("Hanya untuk dokumen yang sudah dikirim.")} />
        </div>
      )}

      <div className="lbl mt">{t("Rincian Barang")}</div>
      {/* Tidak ada lagi tanda "stok kurang" di sini: pengelolaan stok tidak
          dipakai, jadi angka gudang tidak berarti apa-apa dan pengiriman tidak
          pernah ditahan olehnya. Kolomnya diisi satuan barang, sama seperti
          form pembelian — kalau dikosongkan, grid .line kehilangan satu sel
          dan tombol × bergeser. */}
      {items.map((it, i) => (
        <div className="line" key={i}>
          <Combo bare ariaLabel={t("Barang baris {i}", { i: i + 1 })} value={it.produk} onChange={(v) => ubah(i, "produk", v)}
            placeholder={t("-- Pilih Barang --")} opts={jadi.map((p) => [p.id, `${p.kode} — ${p.nama}`])} />
          <input type="number" min="0" inputMode="numeric" placeholder={t("Qty")} aria-label={t("Jumlah baris {i}", { i: i + 1 })}
            value={it.qty} onChange={(e) => ubah(i, "qty", e.target.value)} />
          <input type="number" min="0" inputMode="numeric" placeholder={t("Harga")} aria-label={t("Harga baris {i}", { i: i + 1 })}
            value={it.harga} onChange={(e) => ubah(i, "harga", e.target.value)} title={rp(it.harga)} />
          <span className="stokinfo">{jadi.find((p) => p.id === it.produk)?.satuan}</span>
          <button className="x" aria-label={t("Hapus baris {i}", { i: i + 1 })} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1}>×</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setItems((l) => [...l, { produk: "", qty: "", harga: "" }])}>{t("+ Tambah Baris")}</button>

      <div className="sum">
        <div><span>{t("Total")}</span><b className="n">{rp(total)}</b></div>
        <div><span>{t("Sisa Limit Kredit")}</span>
          {adaLimit
            ? <b className={"n " + (lewatLimit ? "bad" : "ok")}>{rp(sisaLimit)}</b>
            : <b className="n mut" title={t("Limit kredit belum diatur untuk pelanggan ini.")}>—</b>}
        </div>
      </div>
      {lewatLimit && (
        <p className="peringatan bad-box" role="status">
          {t("Melebihi limit kredit {nama} sebesar {v} — penawaran tidak bisa disimpan.", { nama: c.nama, v: rp(-sisaLimit) })}
        </p>
      )}
    </Modal>
  );
}

/* ============================ PEMBELIAN ============================ */
function Pembelian({ pembelian, doCreatePembelian, pemasok, produk, pById, sById, gById, majuPO, mundurPO, say, can, minta, doDeletePembelian, hapusUsulan, ajukanHapus, putusanHapus }) {
  const { t, lang } = useLang();
  const [buka, setBuka] = useState(false);
  const [usulHapus, setUsulHapus] = useState(null); // PO yang diusulkan dihapus
  const [putusanH, setPutusanH] = useState(null);   // usulan hapus yang diputuskan
  const tungguHapus = useMemo(() => menungguHapus(hapusUsulan, "pembelian"), [hapusUsulan]);
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
        p.no, p.tgl, sById(p.pemasok).nama, namaGudang(gById(p.gudang), t), t(PO_LABEL[p.status].id),
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

      <KartuUsulHapus jenis="pembelian" hapusUsulan={hapusUsulan} can={can} onPutuskan={setPutusanH} />

      <div className="kpis">
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
        <Scroll>
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
                  <td><span className="chip">{kodeGudang(gById(p.gudang))}</span></td>
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
                      <TombolHapus can={can} tunggu={tungguHapus.has(p.id)}
                        onHapus={() => minta(t("Hapus pembelian {no}? Data & mutasi stoknya ikut terhapus.", { no: p.no }), () => doDeletePembelian(p))}
                        onUsul={() => setUsulHapus(p)} />
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
      {usulHapus && (
        <FormUsulHapus jenis="pembelian" sasaran={usulHapus.id} judul={usulHapus.no}
          ket={`${usulHapus.tgl} · ${sById(usulHapus.pemasok).nama} · ${rp(tot(usulHapus))}`}
          close={() => setUsulHapus(null)} say={say} submit={ajukanHapus} />
      )}
      {putusanH && (
        <FormPutusanHapus u={putusanH} close={() => setPutusanH(null)} say={say} submit={putusanHapus} />
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
        <Combo label={t("Gudang Tujuan")} value={f.gudang} onChange={set("gudang")} placeholder={t("-- Pilih Gudang --")} opts={opsiGudang(t)} />
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
function Pelanggan({ pelanggan, doCreatePelanggan, doUpdatePelanggan, penjualan, totalSO, piutang, gById, pById, cById, say, can, minta, doDeletePelanggan, online, reload, hapusUsulan, ajukanHapus, putusanHapus, majuSO, mundurSO }) {
  const { t } = useLang();
  const [buka, setBuka] = useState(false);
  const [ubah, setUbah] = useState(null);       // pelanggan yang sedang diubah
  const [detail, setDetail] = useState(null);
  const [rinci, setRinci] = useState(null);    // SO yang dibuka dari riwayat pelanggan
  const [cari, setCari] = useState("");
  // Usulan limit dimuat terpisah dari /bootstrap: hanya layar ini yang memakainya.
  const [usulan, setUsulan] = useState(null);
  const [usulanSemua, setUsulanSemua] = useState(false);
  const [usul, setUsul] = useState(null);       // pelanggan yang sedang diusulkan
  const [putusan, setPutusan] = useState(null); // usulan yang sedang diputuskan
  const [usulHapus, setUsulHapus] = useState(null); // pelanggan yang diusulkan dihapus
  const [putusanH, setPutusanH] = useState(null);   // usulan hapus yang diputuskan
  const tungguHapus = useMemo(() => menungguHapus(hapusUsulan, "pelanggan"), [hapusUsulan]);

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
  const omzet = (cid) => penjualan.filter((s) => s.pelanggan === cid && s.status !== "penawaran").reduce((a, s) => a + totalSO(s), 0);
  const list = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return pelanggan;
    return pelanggan.filter((c) =>
      /* namaKota ikut dicari: yang terbaca di tabel adalah nama
         terjemahannya, dan orang mengetikkan apa yang dilihatnya. */
      [c.kode, c.nama, c.pemilik, c.pic, c.kota, namaKota(c.kota, t), c.sales]
        .some((v) => (v || "").toLowerCase().includes(q)));
  }, [pelanggan, cari, t]);

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

      {/* Kartu muncul hanya bila ada usulan — sama seperti kartu permintaan
          hapus. Tabel kosong dengan delapan kepala kolom hanya memakan tempat
          di atas daftar pelanggan yang sebenarnya dicari. */}
      {usulan !== null && usulan.length > 0 && (
        <Card title={t("Usulan Limit Kredit")}
          note={t("Diajukan oleh petugas, disahkan oleh admin. Limit berubah hanya setelah disetujui.")}>
          <Scroll>
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
                {(usulanSemua ? usulan : usulan.slice(0, PERINGKAT_N)).map((u) => (
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
              </tbody>
            </table>
          </Scroll>
          <KakiSemua total={usulan.length} semua={usulanSemua} onToggle={() => setUsulanSemua((v) => !v)} />
        </Card>
      )}

      <KartuUsulHapus jenis="pelanggan" hapusUsulan={hapusUsulan} can={can} onPutuskan={setPutusanH} />

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
                const lewat = lewatiLimit(c, p);
                return (
                  <tr key={c.id} className="klik" onClick={() => setDetail(c)}>
                    <td><span className="chip">{c.kode}</span></td>
                    <td>
                      <b>{c.nama}</b>
                      <em className="mut2">{c.pic} · {c.telp}</em>
                    </td>
                    <td className="mut">{namaKota(c.kota, t)}</td>
                    <td className="c"><span className={"grade g" + c.grade}>{c.grade}</span></td>
                    <td className="r n mut">{t("{n} hari", { n: c.termin })}</td>
                    <td className={"r n strong " + (lewat ? "bad" : "")}>{rp(p)}</td>
                    <td className="r n">{punyaLimit(c) ? rp(c.limit) : <span className="mut">—</span>}</td>
                    <td className="r n">{rp(omzet(c.id))}</td>
                    {/* tombol tidak boleh ikut membuka detail baris */}
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <div className="aksi">
                        <button className="btn sm" onClick={() => setUsul(c)}>{t("Usul Limit")}</button>
                        <TombolHapus can={can} tunggu={tungguHapus.has(c.id)}
                          onHapus={() => minta(t("Hapus pelanggan {nama}?", { nama: c.nama }), () => doDeletePelanggan(c))}
                          onUsul={() => setUsulHapus(c)} />
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
      {usulHapus && (
        <FormUsulHapus jenis="pelanggan" sasaran={usulHapus.id} judul={usulHapus.nama}
          ket={[usulHapus.kode, usulHapus.kota].filter(Boolean).join(" · ")}
          close={() => setUsulHapus(null)} say={say} submit={ajukanHapus} />
      )}
      {putusanH && (
        <FormPutusanHapus u={putusanH} close={() => setPutusanH(null)} say={say} submit={putusanHapus} />
      )}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)}
          onUsul={() => { setUsul(detail); setDetail(null); }}
          onUbah={() => { setUbah(detail); setDetail(null); }}
          onPilihSO={(s) => { setRinci(s); setDetail(null); }} />
      )}
      {/* Tombol status ikut dibawa ke sini: dokumen yang mau dikirim paling
          sering ditemukan lewat pelanggannya, dan tanpa ini orang harus
          mencarinya lagi di layar Penjualan. Ubah & hapus tetap di sana. */}
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)}
          onMaju={rinci.status !== "lunas" ? () => { majuSO(rinci); setRinci(null); } : null}
          onMundur={SO_FLOW.indexOf(rinci.status) > SO_FLOW.indexOf("pesanan") ? () => { mundurSO(rinci); setRinci(null); } : null} />
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
          {t("Limit Kredit")}: <b>{punyaLimit(c) ? rp(c.limit) : t("Belum diatur")}</b> · {t("Termin")}: <b>{t("{n} hari", { n: c.termin })}</b>
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

function DetailPelanggan({ c, penjualan, totalSO, piutang, gById, pById, close, onUsul, onUbah, onPilihSO }) {
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
            <div><span className="lbl2">{t("Kota")}</span><b>{namaKota(c.kota, t) || "-"}</b></div>
            <div className="span3"><span className="lbl2">{t("Alamat")}</span><b>{c.alamat || "-"}</b></div>
          </div>

          <h4 className="mut2">{t("Data Penjualan")}</h4>
          <div className="cust-info">
            <div><span className="lbl2">{t("Sales")}</span><b>{c.sales || "-"}</b></div>
            <div><span className="lbl2">{t("Grade")}</span><span className={"grade g" + c.grade}>{c.grade}</span></div>
            <div><span className="lbl2">{t("Termin")}</span><b>{t("{n} hari", { n: c.termin })}</b></div>
            <div><span className="lbl2">{t("Limit Kredit")}</span><b>{punyaLimit(c) ? rp(c.limit) : t("Belum diatur")}</b></div>
            <div><span className="lbl2">{t("Sisa Limit")}</span><b>{punyaLimit(c) ? rp(Math.max(0, c.limit - p)) : "—"}</b></div>
            <div><span className="lbl2">{t("Transaksi Terakhir")}</span><b>{riwayat[0]?.tgl || "-"}</b></div>
            {c.catatan && <div className="span3"><span className="lbl2">{t("Catatan")}</span><b>{c.catatan}</b></div>}
          </div>

          <div className="kpis">
            <Kpi label={t("Piutang")} val={rp(p)} sub={lewatiLimit(c, p) ? t("melebihi limit kredit") : t("belum lunas")}
              tone={lewatiLimit(c, p) ? "alert" : p > 0 ? "warn" : ""} />
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
                    <td className="n strong">
                      {onPilihSO
                        ? <button type="button" className="namelink" title={t("Lihat rincian")} onClick={() => onPilihSO(s)}>{s.no}</button>
                        : s.no}
                    </td>
                    <td className="n mut">{s.tgl}</td>
                    <td><span className="chip">{kodeGudang(gById(s.gudang))}</span></td>
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
function Piutang({ penjualan, cById, totalSO, piutang, gById, pById, majuSO, mundurSO }) {
  const { t } = useLang();
  const [cari, setCari] = useState("");
  const [detail, setDetail] = useState(null); // pelanggan yang dibuka dari nama
  const [rinci, setRinci] = useState(null);   // penjualan yang dibuka dari nomor
  const [umur, setUmur] = useState(null);     // kelompok umur yang dibuka
  const { piutangRows, piutangF, agingRows, statusRows, topPelanggan } = useMemo(
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

  /* Kartu di atas memakai tiga status yang sama dengan dasbor — layar ini yang
     merinci, jadi saldo totalnya tetap ditampilkan sebagai garis dasar. */
  const [undue, ondue, overdue] = statusRows;

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
        <Kpi label={t("Undue")} val={rp(undue.nilai)} sub={subPiutang(undue, t)} />
        <Kpi label={t("Ondue")} val={rp(ondue.nilai)} sub={subPiutang(ondue, t)} tone={ondue.nilai > 0 ? "warn" : ""} />
        <Kpi label={t("Overdue")} val={rp(overdue.nilai)} sub={subPiutang(overdue, t)} tone={overdue.nilai > 0 ? "alert" : ""} />
      </div>

      <SectionTitle id={t("Umur Piutang (Aging)")} />
      <Card>
        <Scroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Umur")}</th>
                <th scope="col">{t("Status")}</th>
                <th scope="col" className="r">{t("Pelanggan")}</th>
                <th scope="col" className="r">{t("Lewat (hari)")}</th>
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
                  <td>
                    <span className={"st s-" + (r.status === "Overdue" ? "alert" : r.status === "Ondue" ? "warn" : "ok")}>
                      {t(r.status)}
                    </span>
                  </td>
                  <td className="r n">{fmt(r.n)}</td>
                  {/* Yang terlama di kelompoknya — batas bawah kelompok sudah
                      terbaca dari labelnya, yang tidak terbaca adalah seberapa
                      jauh ujungnya sudah lewat. */}
                  <td className="r n">{r.k === "undue" || !r.n ? "—" : fmt(r.maks)}</td>
                  <td className="r n">{rp(r.nilai)}</td>
                  <td className="r n">{piutangF ? fmt((r.nilai / piutangF) * 100) : 0}%</td>
                </tr>
              ))}
              {piutangRows.length === 0 && <tr><td colSpan={6}><Empty id={t("Tidak ada piutang berjalan.")} /></td></tr>}
            </tbody>
          </table>
        </Scroll>
      </Card>

      <Lipat id={t("Pelanggan Berisiko")}
        mid={
          <div className="filters">
            <label className="fld cari">
              <span className="lbl">{t("Cari")}</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder={t("Nama pelanggan")} />
            </label>
          </div>
        }>
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
                        <td className="r n">{punyaLimit(x.c) ? `${fmt(x.pakai)}%` : "—"}</td>
                        <td><span className={"st s-" + tone}>{t(label)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Scroll>
          )}
        </Card>
      </Lipat>

      <Lipat id={t("Rincian Invoice")}>
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
      </Lipat>

      {/* tanpa onUsul/onUbah: pengajuan limit tetap di layar pelanggan */}
      {detail && (
        <DetailPelanggan c={detail} penjualan={penjualan} totalSO={totalSO} piutang={piutang}
          gById={gById} pById={pById} close={() => setDetail(null)}
          onPilihSO={(s) => { setRinci(s); setDetail(null); }} />
      )}
      {umur && (
        <DaftarUmur label={t(umur.label)} rows={piutangRows.filter((r) => r.bucket === umur.k)}
          close={() => setUmur(null)} onPilih={(so) => { setRinci(so); setUmur(null); }} />
      )}
      {/* Tombol status ikut dibawa ke sini: dokumen yang mau dikirim paling
          sering ditemukan lewat pelanggannya, dan tanpa ini orang harus
          mencarinya lagi di layar Penjualan. Ubah & hapus tetap di sana. */}
      {rinci && (
        <RincianPenjualan so={rinci} pById={pById} cById={cById} gById={gById} totalSO={totalSO}
          close={() => setRinci(null)}
          onMaju={rinci.status !== "lunas" ? () => { majuSO(rinci); setRinci(null); } : null}
          onMundur={SO_FLOW.indexOf(rinci.status) > SO_FLOW.indexOf("pesanan") ? () => { mundurSO(rinci); setRinci(null); } : null} />
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

/* Rincian di balik satu kartu KPI. Kartunya menjawab "berapa"; yang ditanyakan
   berikutnya selalu "yang mana", dan sampai sekarang jawabannya menuntut pindah
   layar. Kolomnya datang dari pemanggil — [judul, rata kanan]. */
function DetailKpi({ judul, kolom, baris, total, taut, close, onPilih }) {
  const { t } = useLang();
  const box = useDialog(close);
  const id = useId();
  const akhir = kolom.length - 1;
  return (
    <div className="ov" onClick={close}>
      <div className="md wide" ref={box} role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <div className="md-hd">
          <h3 id={id}>{judul}</h3>
          <button className="x" onClick={close} aria-label={t("Tutup dialog")}>×</button>
        </div>
        <div className="md-bd">
          <Scroll max={420}>
            <table>
              <thead>
                <tr>{kolom.map(([nama, kanan]) => <th key={nama} scope="col" className={kanan ? "r" : undefined}>{nama}</th>)}</tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.k}>
                    {b.sel.map((v, i) => (
                      <td key={kolom[i][0]} className={kolom[i][1] ? "r n" : undefined}>
                        {onPilih && taut?.[i] && b[taut[i]]
                          ? <button type="button" className="namelink" title={t("Lihat rincian")} onClick={() => onPilih(taut[i], b[taut[i]])}>{v}</button>
                          : v}
                      </td>
                    ))}
                  </tr>
                ))}
                {!baris.length && <tr><td colSpan={kolom.length}><Empty id={t("Tidak ada data.")} /></td></tr>}
              </tbody>
              {!!baris.length && (
                <tfoot>
                  <tr className="tf-total">
                    <td><b>{t("Total")}</b></td>
                    {kolom.slice(1).map(([nama], i) => (
                      <td key={nama} className="r n strong">{i + 1 === akhir ? total : ""}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
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

/* Bagian yang bisa dilipat, tertutup dulu. Layar Piutang menumpuk tiga tabel;
   yang pertama (umur piutang) adalah ringkasan yang selalu dibaca, dua
   sisanya daftar panjang yang hanya dibuka kalau ada yang dicari. Tertutup,
   ringkasannya muat dalam satu layar tanpa digulung.

   Isinya tetap dirender dan hanya disembunyikan lewat `hidden`: pencarian
   yang sudah diketik dan posisi gulung tabelnya bertahan ketika dilipat
   lagi, dan datanya toh sudah ada di memori — tidak ada yang dihemat dengan
   membuangnya dari DOM. */
function Lipat({ id, mid, children }) {
  const { t } = useLang();
  const [buka, setBuka] = useState(false);
  const isi = useId();
  return (
    <>
      <SectionTitle id={id} mid={buka ? mid : null}>
        <button type="button" className="btn" aria-expanded={buka} aria-controls={isi}
          onClick={() => setBuka((b) => !b)}>
          {buka ? "▾" : "▸"} {buka ? t("Tutup") : t("Buka")}
        </button>
      </SectionTitle>
      <div id={isi} hidden={!buka}>{children}</div>
    </>
  );
}

const Card = ({ title, note, cls, children }) => (
  <section className={"card" + (cls ? " " + cls : "")}>
    {title && (
      <div className="card-hd">
        <h3>{title}</h3>
        {note && <p className="note">{note}</p>}
      </div>
    )}
    <div className="card-bd">{children}</div>
  </section>
);

/* Kartu KPI. Dengan `onClick` ia menjadi tombol sungguhan — angka ringkas
   selalu memancing pertanyaan "yang mana", dan jawabannya ada di balik klik. */
const Kpi = ({ label, val, sub, tone, onClick }) => {
  const isi = (
    <>
      <span className="kl">{label}</span>
      <b className="kv n">{val}</b>
      <span className="ks">{sub}</span>
    </>
  );
  const kelas = "kpi " + (tone || "");
  return onClick
    ? <button type="button" className={kelas + " klik"} onClick={onClick}>{isi}</button>
    : <div className={kelas}>{isi}</div>;
};

/* KPI dengan pembanding. Angka telanjang tidak bisa dinilai: "Rp 3.00 miliar"
   baru berarti sesuatu setelah diketahui tahun lalu berapa. Harga rata-rata
   diberi arah warna yang sama dengan nilai dan kuantitas — harga satuan yang
   turun adalah kabar buruk, bukan angka netral. */
const KpiTren = ({ label, val, delta, sub }) => {
  const { t } = useLang();
  return (
    <div className="kpi tren">
      <span className="kl">{label}</span>
      <b className="kv n">{val}</b>
      {sub !== undefined ? <span className="ks">{sub}</span>
        : delta == null ? <span className="ks mut">{t("tidak ada data tahun lalu")}</span>
        : <span className={"ks delta " + arah(delta)}>{pct(delta)}<em>{t("vs tahun lalu")}</em></span>}
    </div>
  );
};

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
  /* ukuran huruf: satu skala untuk seluruh layar (dokumen cetak punya
     skalanya sendiri di bawah). Angka mentah dilarang di luar blok ini. */
  --asm-fs-2xs:10px; --asm-fs-xs:11px; --asm-fs-sm:12px; --asm-fs-md:13px; --asm-fs-base:14px;
  --asm-fs-lg:15px; --asm-fs-xl:18px; --asm-fs-2xl:20px; --asm-fs-kpi:clamp(1.15rem, 8cqi, 1.5rem);

  /* alias lama → token BI */
  --slab:var(--asm-bg); --paper:var(--asm-card); --ink:var(--asm-fg); --rubber:var(--asm-dark);
  --muted:var(--asm-fg-muted); --line:var(--asm-border);
  --ok:var(--asm-success); --warn:var(--asm-warning); --alert:var(--asm-danger);

  --fd:'Noto Sans KR','Noto Sans','Apple SD Gothic Neo',system-ui,sans-serif;
  --fb:'Noto Sans KR','Noto Sans','Apple SD Gothic Neo',system-ui,-apple-system,sans-serif;
  --fm:var(--fb);

  background:var(--asm-bg); color:var(--asm-fg); font-family:var(--fb);
  font-size:var(--asm-fs-base); line-height:1.5; min-height:100%;
  /* tanpa font mono khusus — perataan angka memakai tabular-nums (Bab 4) */
  font-variant-numeric:tabular-nums;
}
.vk *{box-sizing:border-box}
.vk em{font-style:normal}
.vk h1,.vk h2,.vk h3,.vk h4{font-family:var(--fd); margin:0; font-weight:700; letter-spacing:-.01em}
.vk .n,.vk .num{font-variant-numeric:tabular-nums}
.vk .mut{color:var(--asm-fg-muted)}
.vk .mut2{display:block; color:var(--asm-fg-muted); font-size:var(--asm-fs-xs)}
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
.vk .hd h1{font-size:var(--asm-fs-2xl); font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--asm-primary)}
.vk .hd p{margin:1px 0 0; font-size:var(--asm-fs-sm); color:var(--asm-fg-muted)}
.vk .hd p em{display:block; font-size:var(--asm-fs-xs)}
.vk .hd-meta{text-align:right; font-size:var(--asm-fs-sm)}
.vk .hd-meta .k{display:block; font-size:var(--asm-fs-xs); font-weight:500; letter-spacing:.06em; color:var(--asm-primary)}
.vk .hd-meta .v{font-size:var(--asm-fs-md)}
.vk .conn{display:inline-block; margin-top:4px; font-size:var(--asm-fs-xs); padding:1px 8px; border:1px solid var(--asm-border); border-radius:var(--asm-radius-sm); color:var(--asm-fg-muted)}
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
  font-family:var(--fd); font-size:var(--asm-fs-base); font-weight:500; color:var(--asm-fg-muted); white-space:nowrap; margin-bottom:-1px}
.vk .tab em{display:block; font-size:var(--asm-fs-xs); font-weight:400; color:var(--asm-fg-muted)}
.vk .tab:hover{background:var(--asm-secondary); color:var(--asm-fg)}
.vk .tab.on{color:var(--asm-primary); font-weight:700; border-bottom-color:var(--asm-primary)}

.vk .wrap{max-width:1240px; margin:0 auto; padding:24px 20px}

/* section */
.vk .sect{display:flex; justify-content:space-between; align-items:center; gap:16px; margin:4px 0 16px; flex-wrap:wrap}
.vk .sect-l{display:flex; align-items:center; gap:16px; flex-wrap:wrap; min-width:0; flex:1}
.vk .sect h2{font-size:var(--asm-fs-xl); font-weight:700; letter-spacing:-.01em; flex-shrink:0; padding-left:10px; border-left:3px solid var(--asm-primary)}
.vk .sect h2 em{font-size:var(--asm-fs-sm); letter-spacing:0; color:var(--asm-fg-muted); margin-left:8px; font-weight:400}
.vk .acts{display:flex; gap:8px; flex-wrap:wrap}

/* buttons (Bab 11 STEP 2) */
.vk .btn{background:var(--asm-white); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  padding:.5rem 1rem; min-height:36px; cursor:pointer; white-space:nowrap; box-shadow:none;
  font-family:var(--fd); font-size:var(--asm-fs-base); font-weight:500; color:var(--asm-fg);
  transition:color .15s, background-color .15s, border-color .15s}
.vk .btn em{display:block; font-size:var(--asm-fs-2xs); font-weight:400; color:var(--asm-fg-muted)}
.vk .btn:hover{background:var(--asm-secondary); color:var(--asm-primary); border-color:var(--asm-primary)}
.vk .btn:hover em{color:inherit}
.vk .btn.pri{background:var(--asm-primary); color:var(--asm-primary-fg); border-color:var(--asm-primary)}
.vk .btn.pri em{color:var(--asm-primary-40)}
.vk .btn.pri:hover{background:var(--asm-primary-hover); border-color:var(--asm-primary-hover); color:var(--asm-primary-fg)}
.vk .btn.pri:active{background:var(--asm-primary-active); border-color:var(--asm-primary-active)}
.vk .btn.sm{min-height:30px; padding:.375rem .75rem; font-size:var(--asm-fs-sm)}
.vk .btn.lg{min-height:40px; padding:.5rem 1.5rem; font-weight:700}
.vk .btn:disabled{opacity:.5; pointer-events:none}
.vk .x{background:none; border:0; font-size:var(--asm-fs-xl); line-height:1; cursor:pointer; color:var(--asm-fg-muted); padding:2px 6px; border-radius:var(--asm-radius-sm)}
.vk .x:hover{color:var(--asm-danger); background:var(--asm-danger-soft)}
.vk .x:disabled{opacity:.25; cursor:not-allowed}
.vk button:focus-visible,.vk input:focus-visible,.vk select:focus-visible{outline:none; box-shadow:0 0 0 3px var(--asm-primary-40)}

/* kpi */
.vk .kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:16px}
.vk .kpi{background:var(--asm-card); border:1px solid var(--asm-border); border-left:3px solid var(--asm-primary);
  border-radius:var(--asm-radius-lg); padding:12px 14px; container-type:inline-size}
.vk button.kpi{width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer}
.vk button.kpi:hover{border-color:var(--asm-primary-40); box-shadow:var(--asm-shadow-md)}
.vk button.kpi:focus-visible{outline:2px solid var(--asm-primary); outline-offset:2px}
.vk .kpi.warn{border-left-color:var(--asm-warning)}
.vk .kpi.alert{border-left-color:var(--asm-danger)}
.vk .kl{font-size:var(--asm-fs-sm); font-weight:500; color:var(--asm-fg-muted); display:block; margin-bottom:4px}
.vk .kl em{margin-left:6px; font-size:var(--asm-fs-xs); font-weight:400}
.vk .kv{display:block; font-size:var(--asm-fs-kpi); font-weight:700; line-height:1.2; margin:2px 0 1px;
  font-variant-numeric:tabular-nums; white-space:nowrap; letter-spacing:-.01em}
.vk .ks{font-size:var(--asm-fs-xs); color:var(--asm-fg-muted)}

/* card */
.vk .card{background:var(--asm-card); border:1px solid var(--asm-border); border-radius:var(--asm-radius-lg); margin-bottom:16px}
.vk .card-hd{padding:12px 16px; border-bottom:1px solid var(--asm-border); border-radius:var(--asm-radius-lg) var(--asm-radius-lg) 0 0}
.vk .card-hd h3{font-size:var(--asm-fs-lg); font-weight:700; letter-spacing:-.01em}
.vk .card-hd h3 em{font-size:var(--asm-fs-xs); letter-spacing:0; color:var(--asm-fg-muted); margin-left:7px; font-weight:400}
.vk .note{margin:3px 0 0; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted)}
.vk .card-bd{padding:0}
.vk .card-bd>.scroll{border-radius:0 0 var(--asm-radius-lg) var(--asm-radius-lg)}
.vk .grid2{display:grid; grid-template-columns:1fr 1fr; gap:16px}
@media (max-width:860px){.vk .grid2{grid-template-columns:1fr}}
/* item grid tidak boleh melebar mengikuti tabel di dalamnya (min-width:auto
   bawaan grid) — inilah penyebab halaman ikut scroll ke samping di layar kecil */
.vk .grid2>*,.vk .kpis>*,.vk .card{min-width:0}

/* ---------- layar penjualan: penyaring tanggal, KPI tren, grafik, tabel drill ----------
   Palet layar ini mengikuti panduan terpisah (VLK-UI-2026-001 §7.1): latar
   abu terang, biru & abu-biru pastel untuk bidang, hijau sage untuk penegasan,
   dan SATU warna teks/garis. Pastelnya hanya untuk isian — dipakai sebagai
   warna teks, kontrasnya jatuh di bawah WCAG AA. */
.vk{
  --pl-latar:#F0F0F0; --pl-utama:#E3F2FD; --pl-lembut:#ECEFF1;
  --pl-tegas:#E8F5E9; --pl-tinta:#546E7A;
}

/* chip pilihan (sumbu analisis) */
.vk .chips{display:flex; gap:4px; flex-wrap:wrap; align-items:center}
.vk .chip-b{font:inherit; font-size:var(--asm-fs-sm); font-weight:400; line-height:1; padding:7px 11px;
  background:transparent; color:var(--pl-tinta); border:.5px solid var(--pl-tinta);
  border-radius:var(--asm-radius-lg); cursor:pointer; white-space:nowrap}
.vk .chip-b:hover{background:var(--pl-lembut)}
.vk .chip-b.on{background:var(--pl-utama); border-color:var(--asm-primary); color:var(--asm-primary); font-weight:500}
.vk .jual-filter{align-items:flex-end; gap:12px}
.vk .jual-filter .fld{min-width:170px}

/* KPI dengan pembanding: ukuran huruf mengikuti .kpi biasa (label 12px,
   nilai clamp, keterangan 11px) supaya tab penjualan tidak tampak "lain" */
.vk .delta em{font-style:normal; margin-left:5px; color:var(--asm-fg-muted)}
.vk .delta.naik{color:var(--asm-success)}
.vk .delta.turun{color:var(--asm-danger)}
.vk .delta.datar{color:var(--asm-fg-muted)}
/* empat KPI selalu satu baris: dua baris membuat pembacanya mengira ada dua
   kelompok angka. Baru dilipat jadi 2×2 pada lebar ponsel. */
.vk .jual-kpi{grid-template-columns:repeat(4,1fr)}
@media (max-width:720px){.vk .jual-kpi{grid-template-columns:1fr 1fr}}

/* grafik batang + garis kuantitas, digambar tanpa pustaka grafik */
/* kepala kartu dan jarak tepi mengikuti kartu lain (12px 16px) — kartu ini
   tidak boleh terlihat sebagai jenis kotak yang berbeda */
.vk .graf-card .card-bd{padding:12px 16px}
.vk .graf-plot{position:relative; display:flex; align-items:flex-end}
.vk .graf-kol{position:relative; flex:1; min-width:0; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
  height:100%; background:none; border:0; padding:0; font:inherit; cursor:pointer}
.vk .graf-kol:disabled{cursor:default}
.vk .graf-nilai{font-size:var(--asm-fs-xs); color:var(--asm-fg); font-variant-numeric:tabular-nums; white-space:nowrap}
/* batang bulan berjalan dipekatkan; bulan yang belum tiba tidak digambar sama
   sekali, sedangkan bulan nol tetap memberi label "0" pada sumbu */
.vk .graf-bar{width:58%; background:var(--pl-utama); border:.5px solid var(--asm-primary-40);
  border-radius:3px 3px 0 0; transition:background .12s; display:flex; align-items:center; justify-content:center; overflow:visible}
.vk .graf-kol.sorot .graf-bar{background:var(--asm-primary-20)}
.vk .graf-kol.pilih .graf-bar{background:var(--asm-primary-20); border-color:var(--asm-primary)}
.vk .graf-kol.pilih .graf-x{color:var(--asm-primary); font-weight:500}
.vk .graf-kol.datang .graf-bar{display:none}
.vk .graf-x{height:16px; line-height:16px; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted)}
.vk .graf-kol.datang .graf-x{opacity:.45}
/* kuantitas sewarna garisnya, diletakkan mutlak di atas titik garis (bottom
   dihitung dari tinggi titik yang sama dengan polyline) */
.vk .graf-q{position:absolute; left:50%; transform:translateX(-50%); line-height:1; font-size:var(--asm-fs-xs);
  color:var(--asm-success); font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none}
/* lebar SVG harus eksplisit: elemen pengganti dengan width:auto mengambil
   lebar dari rasio viewBox-nya (100:200), bukan dari left/right, sehingga
   garisnya terjepit di 100px di sisi kiri */
.vk .graf-garis{position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none}
.vk .graf-garis polyline{fill:none; stroke:var(--asm-success); stroke-width:1.5; stroke-linejoin:round}
.vk .graf-tip{position:absolute; bottom:24px; transform:translateX(-50%); z-index:2; pointer-events:none;
  min-width:150px; padding:7px 9px; background:var(--asm-card); border:.5px solid var(--pl-tinta);
  border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-md); font-size:var(--asm-fs-xs)}
.vk .graf-tip b{display:block; margin-bottom:3px; font-weight:500}
.vk .graf-tip span{display:flex; justify-content:space-between; gap:12px; color:var(--asm-fg-muted)}
.vk .graf-tip em{font-style:normal; color:var(--asm-fg); font-variant-numeric:tabular-nums}

/* tabel peringkat: pelanggan > transaksi, semuanya di dalam satu lebar kolom
   yang sama. Pendalaman tidak boleh mengubah tata letak — itulah yang membuat
   matriks kuartal lama pecah begitu satu bulan dibuka. */
.vk .drill-card .card-bd{padding:0}
.vk table.drill{width:100%; border-collapse:collapse; table-layout:auto}
.vk table.drill th{font-size:var(--asm-fs-xs); font-weight:400; color:var(--asm-fg-muted);
  background:var(--pl-lembut); border-bottom:.5px solid var(--pl-tinta); padding:7px 12px; text-align:left}
.vk table.drill th.r{text-align:right}
.vk table.drill td{padding:0; border-bottom:.5px solid var(--asm-border-50); font-size:var(--asm-fs-sm); vertical-align:middle}
.vk table.drill td.r{padding:6px 12px; text-align:right; font-variant-numeric:tabular-nums}
/* kolom angka selebar isinya saja — sisa lebar diberikan ke kolom periode,
   yang isinya paling panjang dan paling sering terpotong */
.vk table.drill th.r,.vk table.drill td.r{width:1%; white-space:nowrap}
.vk table.drill td:first-child{padding:0}
.vk table.drill tr:last-child td{border-bottom:0}
.vk .br-b>td{font-size:var(--asm-fs-md); font-weight:500}
.vk .br-t>td{font-size:var(--asm-fs-sm); font-weight:400; background:var(--pl-latar)}
.vk .br-t.klik{cursor:pointer}
.vk .br-t.klik:hover>td{background:var(--pl-tegas)}
/* kedalaman dibaca dari jarak kiri, bukan dari warna: dua tingkat warna
   abu-abu yang berdekatan tidak terbaca sebagai urutan */
.vk .per{display:block; padding:6px 12px; font:inherit; color:inherit; text-align:left}
.vk .per-b{padding-left:16px}
.vk .per-h{padding-left:34px}
.vk .per .chev{display:inline-block; width:14px; font-size:var(--asm-fs-2xs); color:var(--asm-fg-muted)}
.vk .per-h .namelink{margin-right:8px}
.vk .per-h .mut2{margin-top:1px; font-weight:400}
/* tombol aksi pindah ke dialog rincian; "Hapus" dijauhkan dari tombol lain */
.vk .md-ft .ft-isi{flex:1}

/* sumbu analisis: chip di bawah KPI, bukan di deret penyaring — yang berganti
   bukan angka yang dihitung melainkan cara membacanya */
.vk .chips.sumbu{margin:0 0 12px}
.vk .rank-grup{padding:10px 12px; border-bottom:.5px solid var(--asm-border-50)}

/* tabel peringkat: bentuk baris sama dengan tabel drill, ditambah kolom nomor
   urut dan bilah porsi */
.vk table.drill.rank th.no,.vk table.drill.rank td.no{width:1%; padding:6px 4px 6px 12px;
  text-align:right; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); font-variant-numeric:tabular-nums}
.vk table.drill.rank td:first-child{padding:6px 4px 6px 12px}
.vk table.drill.rank td:nth-child(2){padding:0}
.vk .rank-nama{display:flex; align-items:center; gap:2px; padding-left:4px}
.vk .rank-nama .mut2{margin-left:6px; font-weight:400}
.vk .chevb{background:none; border:0; padding:2px 0; font:inherit; cursor:pointer; line-height:1}
/* bilah porsi digambar di belakang angkanya: satu kolom untuk dua keterangan,
   supaya tabel peringkat tidak melebar */
.vk .porsi-th{min-width:92px}
/* kolom ke-2 di baris peringkat berpadding 0 (sel nama mengatur sendiri);
   sel label total harus mengembalikan padding tfoot yang tertimpa itu */
.vk table.drill.rank tfoot td.rank-total{padding:9px 12px 9px 16px}
.vk table.drill.rank tfoot td.rank-total em{margin-left:8px; font-weight:400}
.vk .porsi{position:relative; display:block; min-width:80px; height:16px}
.vk .porsi-b{position:absolute; left:0; top:2px; height:12px; background:var(--pl-utama);
  border-radius:2px; min-width:1px}
.vk .porsi em{position:relative; font-style:normal; font-size:var(--asm-fs-xs); line-height:16px;
  color:var(--asm-fg-muted); font-variant-numeric:tabular-nums}
.vk .rank-ft{padding:10px 12px; border-top:.5px solid var(--asm-border-50); text-align:center}
.vk .gerak{margin-bottom:16px}
.vk .gerak .mut2{margin-top:1px}

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
.vk .mut-note{text-align:center; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); padding:6px 0 2px}
.vk table{width:100%; border-collapse:collapse; font-size:var(--asm-fs-md)}
.vk thead th{position:sticky; top:0; z-index:2; background:var(--asm-primary-6); color:var(--asm-fg);
  text-align:left; padding:9px 12px; border-bottom:2px solid var(--asm-primary);
  font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500; white-space:nowrap}
.vk thead th em{font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); font-weight:400}
.vk tbody td{height:38px; padding:9px 12px; border-bottom:1px solid var(--asm-border-50); vertical-align:middle}
.vk tbody tr:hover{background:var(--asm-primary-6)}
.vk tbody tr.klik{cursor:pointer}
.vk tbody td .mut2{font-size:var(--asm-fs-sm)}
.vk tfoot td{padding:9px 12px; border-top:2px solid var(--asm-primary)}
.vk tfoot tr.tf-total td{background:var(--asm-primary-10); color:var(--asm-primary); font-weight:700}
.vk tfoot tr.tf-avg td{border-top:0; padding-top:4px; font-size:var(--asm-fs-sm)}
.vk .chip{display:inline-block; font-size:var(--asm-fs-xs); font-weight:500; background:var(--asm-primary-10); color:var(--asm-primary);
  padding:1px 8px; border-radius:var(--asm-radius-sm)}

/* tags & status (Bab 11 .asm-badge) */
.vk .tag,.vk .st,.vk .role{display:inline-block; font-family:var(--fd); font-size:var(--asm-fs-xs); font-weight:700; letter-spacing:.04em;
  padding:2px 8px; border:1px solid transparent; border-radius:var(--asm-radius-sm); line-height:1.4; white-space:nowrap;
  background:var(--asm-neutral-soft); color:var(--asm-neutral); border-color:var(--asm-neutral-border)}
.vk .tag em,.vk .st em,.vk .role em{display:block; font-size:var(--asm-fs-2xs); letter-spacing:0; font-weight:400; opacity:.75}
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
.vk .step span{font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500; color:var(--asm-fg-muted)}
.vk .step span em{display:block; font-size:var(--asm-fs-2xs); color:var(--asm-fg-muted); font-weight:400}
.vk .step b{font-size:var(--asm-fs-xl); font-weight:700; font-variant-numeric:tabular-nums}
.vk .step:hover{border-color:var(--asm-primary-40)}
.vk .step.on{border-bottom-color:var(--asm-primary); background:var(--asm-primary-10)}
.vk .step.on span,.vk .step.on b{color:var(--asm-primary)}
.vk .arrow{align-self:center; color:var(--asm-border); font-size:var(--asm-fs-xl)}

/* filters */
.vk .filters{display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap}
/* kolom tanggal: penuntun bawaan peramban disembunyikan, penuntun sendiri di atasnya */
.vk .tgl{position:relative; display:block; flex:1; min-width:0}
.vk .tgl.kosong input::-webkit-datetime-edit{opacity:0}
.vk .tgl-ph{position:absolute; left:.75rem; top:50%; transform:translateY(-50%);
  pointer-events:none; color:var(--asm-fg-muted); font-size:var(--asm-fs-base)}
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
.vk .lbl{font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500; color:var(--asm-fg); display:block; margin-bottom:6px}
.vk .lbl em{margin-left:6px; font-size:var(--asm-fs-xs); font-weight:400; color:var(--asm-fg-muted)}
.vk .lbl .req{color:var(--asm-danger)}
.vk .lbl.mt{margin-top:16px}
.vk input,.vk select{width:100%; min-height:36px; padding:.375rem .75rem; border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  background:var(--asm-white); font-family:var(--fb); font-size:var(--asm-fs-base); color:var(--asm-fg); box-shadow:none}
.vk input::placeholder{color:var(--asm-fg-muted)}
.vk input:focus,.vk select:focus{outline:none; border-color:var(--asm-primary); box-shadow:0 0 0 3px var(--asm-primary-40)}
.vk input:disabled,.vk select:disabled{background:var(--asm-secondary); opacity:.6}
.vk input.err{border-color:var(--asm-danger); background:var(--asm-danger-soft)}
.vk input.qty{width:7rem; text-align:right}
.vk .awal-aksi{display:flex; justify-content:flex-start; gap:.75rem; margin:.5rem 0}
.vk .hint{display:block; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); margin-top:3px}
.vk .row2{display:grid; grid-template-columns:1fr 1fr; gap:12px}
@media (max-width:560px){.vk .row2{grid-template-columns:1fr}}
@media (max-width:520px){.vk .cust-info, .vk .spec-info{grid-template-columns:1fr 1fr}}

/* dropdown pencarian */
.vk .combo-wrap{position:relative}
.vk .combo-list{position:absolute; top:calc(100% + 2px); left:0; right:0; z-index:30; margin:0; padding:6px;
  list-style:none; background:var(--asm-white); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md);
  max-height:220px; overflow:auto; box-shadow:var(--asm-shadow-md)}
.vk .combo-list li{padding:8px 12px; font-size:var(--asm-fs-base); cursor:pointer; border-radius:var(--asm-radius-sm)}
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
.vk .stokinfo{font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); text-align:right; font-variant-numeric:tabular-nums}
.vk .stokinfo.bad{color:var(--asm-danger); font-weight:700}
.vk .sum{margin-top:16px; border-top:2px solid var(--asm-primary); padding-top:10px; display:grid; gap:5px}
.vk .sum div{display:flex; justify-content:space-between; align-items:baseline}
.vk .sum span{font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500; color:var(--asm-fg-muted)}
.vk .sum span em{margin-left:6px; font-size:var(--asm-fs-xs); font-weight:400}
.vk .sum b{font-size:var(--asm-fs-xl); font-weight:700}
.vk .delta{display:flex; justify-content:space-between; padding:9px 12px; background:var(--asm-primary-6); border:1px solid var(--asm-primary-40);
  border-radius:var(--asm-radius-md); margin-bottom:12px; font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500}
.vk .delta b{font-size:var(--asm-fs-lg); font-weight:700}
.vk .peringatan{margin:12px 0 0; padding:10px 12px; font-size:var(--asm-fs-sm); line-height:1.5; border-radius:var(--asm-radius-md);
  background:var(--asm-warning-soft); border:1px solid var(--asm-warning-border); border-left:3px solid var(--asm-warning); color:var(--asm-warning)}
.vk .peringatan b{font-weight:700}
.vk .peringatan.bad-box{background:var(--asm-danger-soft); border-color:var(--asm-danger-border); border-left-color:var(--asm-danger); color:var(--asm-danger)}

/* alerts list */
.vk .alerts{list-style:none; margin:0; padding:0}
.vk .alerts li{display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:1px solid var(--asm-border-50)}
.vk .alerts .an{flex:1; font-size:var(--asm-fs-md)}
.vk .empty{padding:24px 16px; text-align:center; color:var(--asm-fg-muted); font-size:var(--asm-fs-md)}
.vk .empty em{display:block; font-size:var(--asm-fs-xs); margin-top:2px}

/* grade badge */
.vk .grade{font-family:var(--fd); font-size:var(--asm-fs-lg); font-weight:700; width:28px; height:28px; display:inline-grid; place-items:center;
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
.vk .md-hd h3{font-size:var(--asm-fs-lg); font-weight:700; letter-spacing:-.01em}
.vk .md-hd h3 em{font-size:var(--asm-fs-xs); letter-spacing:0; color:var(--asm-fg-muted); margin-left:7px; font-weight:400}
.vk .md-bd{padding:16px; overflow:auto}
.vk .md-ft{display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid var(--asm-border);
  background:var(--asm-secondary); border-radius:0 0 var(--asm-radius-lg) var(--asm-radius-lg)}

/* footer & toast */
.vk .ft{max-width:1240px; margin:0 auto; padding:16px 20px 28px; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted); text-align:center; border-top:1px solid var(--asm-border)}
.vk .ft em{display:block}
.vk .ft code{background:var(--asm-secondary); padding:1px 5px; border-radius:var(--asm-radius-sm); border:1px solid var(--asm-border)}
.vk .toast{position:fixed; left:50%; bottom:22px; transform:translateX(-50%); background:var(--asm-dark); color:var(--asm-white);
  padding:10px 16px; border-radius:var(--asm-radius-md); font-size:var(--asm-fs-md); z-index:60; border-left:4px solid var(--asm-success);
  box-shadow:var(--asm-shadow-lg); max-width:90%}
.vk .toast.bad{border-left-color:var(--asm-danger)}
@media (prefers-reduced-motion:no-preference){
  .vk .toast{animation:vkup .22s ease-out}
  @keyframes vkup{from{opacity:0; transform:translate(-50%,8px)} to{opacity:1; transform:translate(-50%,0)}}
}

/* login & session */
.vk .login{min-height:100vh; display:grid; place-items:center; padding:20px;
  background:radial-gradient(120% 90% at 50% 0%, var(--asm-primary-6) 0%, var(--asm-bg) 60%)}
.vk .splash{font-family:var(--fd); font-size:var(--asm-fs-sm); font-weight:500; letter-spacing:.06em; color:var(--asm-primary)}
.vk .login-card{width:100%; max-width:380px; background:var(--asm-card); border:1px solid var(--asm-border);
  border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-md); overflow:hidden}
.vk .login-brand{display:flex; gap:12px; align-items:flex-start; padding:22px 20px 16px}
.vk .login-brand .lang{margin-left:auto; margin-top:2px}
.vk .login-id{display:flex; flex-direction:column; gap:7px; min-width:0}
.vk .login-brand h1{font-size:var(--asm-fs-base); font-weight:500; letter-spacing:.2em; text-transform:uppercase; color:var(--asm-fg-muted);
  text-align:center; padding-left:.2em}
.vk .login-brand p{margin:1px 0 0; font-size:var(--asm-fs-xs); color:var(--asm-fg-muted)}
.vk .login-brand p em{display:block; font-size:var(--asm-fs-2xs)}
.vk .login-bd{padding:20px}
.vk .btn.lg{width:auto}
.vk .login .btn.lg{width:100%; margin-top:4px}
.vk .login .conn{width:100%; text-align:center}

/* pemilih bahasa: kendali tersegmen ID / KO */
.vk .lang{display:inline-flex; border:1px solid var(--asm-border); border-radius:var(--asm-radius-md); overflow:hidden; background:var(--asm-card)}
/* bendera, bukan kode huruf: bahasa terbaca sekilas tanpa harus dieja.
   Yang tidak aktif diredam abu-abu — dua bendera berwarna bersebelahan tidak
   menunjukkan mana yang sedang dipakai, dan latar saja terlalu samar. */
.vk .lang-b{background:none; border:0; padding:3px 9px; cursor:pointer; font:inherit; font-size:var(--asm-fs-lg);
  line-height:1.3; filter:grayscale(1); opacity:.5; transition:background .15s, filter .15s, opacity .15s}
.vk .lang-b + .lang-b{border-left:1px solid var(--asm-border)}
.vk .lang-b:hover{background:var(--asm-primary-6); filter:none; opacity:.8}
.vk .lang-b.on{background:var(--asm-primary-10); filter:none; opacity:1}
.vk .lang-b:focus-visible{outline:2px solid var(--asm-primary); outline-offset:-2px}

/* header: menu pengguna (identitas + aksi akun dalam satu tombol) */
.vk .who{display:flex; align-items:center; gap:8px; justify-content:flex-end}
.vk .um{position:relative}
.vk .um-b{display:inline-flex; align-items:center; gap:7px; background:none; cursor:pointer; font:inherit; font-size:var(--asm-fs-md);
  color:var(--asm-fg); border:1px solid var(--asm-border); border-radius:var(--asm-radius-md); padding:3px 8px 3px 4px}
.vk .um-b:hover,.vk .um-b.on{border-color:var(--asm-primary); background:var(--asm-primary-6)}
.vk .um-av{width:22px; height:22px; flex:none; display:grid; place-items:center; border-radius:50%;
  font-family:var(--fd); font-size:var(--asm-fs-xs); font-weight:700; line-height:1}
.vk .um-nm{max-width:12ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.vk .um-ar{flex:none; color:var(--asm-fg-muted); transition:transform .15s}
.vk .um-b.on .um-ar{transform:rotate(180deg)}
.vk .um-pop{position:absolute; top:calc(100% + 6px); right:0; z-index:40; min-width:180px; padding:4px;
  background:var(--asm-card); border:1px solid var(--asm-border); border-radius:var(--asm-radius-lg); box-shadow:var(--asm-shadow-md)}
.vk .um-hd{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 9px 8px;
  border-bottom:1px solid var(--asm-border); margin-bottom:4px}
.vk .um-hd b{font-size:var(--asm-fs-md); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.vk .um-i{display:block; width:100%; text-align:left; background:none; border:0; cursor:pointer; font:inherit; font-size:var(--asm-fs-sm);
  color:var(--asm-fg); padding:7px 9px; border-radius:var(--asm-radius-md)}
.vk .um-i:hover{background:var(--asm-primary-6); color:var(--asm-primary)}
.vk .um-i.keluar:hover{background:var(--asm-danger-soft); color:var(--asm-danger)}

.vk .namelink{background:none; border:0; padding:0; margin:0; font:inherit; font-weight:inherit; color:inherit; cursor:pointer; text-align:left}
.vk .namelink:hover{text-decoration:underline; color:var(--asm-primary)}

.vk .cust-info, .vk .spec-info{display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 18px; margin-bottom:16px}
.vk .cust-info .span3{grid-column:1 / -1}
.vk .cust-info .lbl2, .vk .spec-info .lbl2{display:block; font-size:var(--asm-fs-xs); font-weight:500; color:var(--asm-fg-muted); margin-bottom:3px}
/* role badge */
.vk .role{font-size:var(--asm-fs-2xs); padding:1px 7px}
.vk .role em{font-size:var(--asm-fs-2xs)}
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
  .vk .hd h1{font-size:var(--asm-fs-xl); letter-spacing:.1em}
  .vk .hd-meta{text-align:left; width:100%}
  .vk .who{justify-content:flex-start; flex-wrap:wrap}
  /* justify-content:center memotong tab pertama saat baris ini ikut scroll */
  .vk .tabs{justify-content:flex-start; padding:0 10px; scrollbar-width:thin}
  .vk .tab{padding:10px 12px}
  .vk .wrap{padding:16px 12px}
  .vk .sect{align-items:stretch}
  .vk .sect-l{gap:10px}
  .vk .sect h2{font-size:var(--asm-fs-lg)}
  .vk .acts{width:100%}
  .vk .acts .btn{flex:1 1 auto; text-align:center}
  .vk .filters,.vk .sect-l .flow{width:100%}
  .vk .step{min-width:92px; padding:7px 9px}
  .vk .step b{font-size:var(--asm-fs-lg)}
  .vk .kpis{grid-template-columns:1fr 1fr}
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
  .vk .kpis{grid-template-columns:1fr}
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
