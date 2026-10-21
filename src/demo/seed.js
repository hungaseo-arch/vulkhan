/* Data contoh untuk mode demo — hanya dimuat bila VITE_DEMO=true.

   Dipisah dari App.jsx dan dimuat lewat import() dinamis supaya build produksi
   tidak membawanya sama sekali: sebelumnya angka-angka ini adalah state awal
   aplikasi, dan selama /bootstrap belum selesai layar menampilkannya seolah
   angka perusahaan. Lihat muatDemo() di App.jsx. */

const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();

export const SEED_GUDANG = [
  { id: "G1", kode: "KRW", nama: "Gudang Karawang", kota: "Karawang" },
  { id: "G2", kode: "SMR", nama: "Gudang Semarang", kota: "Semarang" },
  { id: "G3", kode: "SBY", nama: "Gudang Surabaya", kota: "Surabaya" },
];

export const SEED_PRODUK = [
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

export const SEED_PELANGGAN = [
  { id: "C1", kode: "PLG-001", nama: "PT Sumber Karya Logistik", pic: "Bpk. Andi Prasetyo", telp: "0812-8811-4520", kota: "Jakarta Utara", grade: "A", limit: 500000000, termin: 45 },
  { id: "C2", kode: "PLG-002", nama: "CV Anugerah Trans Nusantara", pic: "Ibu Ratna Dewi", telp: "0813-9922-7310", kota: "Bekasi", grade: "B", limit: 200000000, termin: 30 },
  { id: "C3", kode: "PLG-003", nama: "PT Bumi Mineral Sejahtera", pic: "Bpk. Yusuf Hakim", telp: "0811-5540-2288", kota: "Balikpapan", grade: "A", limit: 800000000, termin: 60 },
  { id: "C4", kode: "PLG-004", nama: "PT Jaya Armada Transport", pic: "Bpk. Slamet Riyadi", telp: "0816-3311-9087", kota: "Surabaya", grade: "B", limit: 300000000, termin: 30 },
  { id: "C5", kode: "PLG-005", nama: "UD Mandiri Ban Gresik", pic: "Bpk. Hendra", telp: "0857-2200-1144", kota: "Gresik", grade: "C", limit: 100000000, termin: 14 },
];

export const SEED_PEMASOK = [
  { id: "S1", kode: "PMS-001", nama: "PT Karet Nusantara Indah", pic: "Bpk. Bagus", telp: "021-5501-3300", jenis: "bahan" },
  { id: "S2", kode: "PMS-002", nama: "CV Ban Bekas Jaya Makmur", pic: "Bpk. Rudi", telp: "0812-3344-8899", jenis: "casing" },
  { id: "S3", kode: "PMS-003", nama: "PT Indo Rubber Compound", pic: "Ibu Lia", telp: "031-8820-4411", jenis: "bahan" },
];

/* mutasi awal: stok pembukaan per gudang */
export const SEED_MUTASI = [];
const opening = [
  ["G1", "P1", 48], ["G1", "P2", 36], ["G1", "P4", 62], ["G1", "P5", 28], ["G1", "P8", 90], ["G1", "P10", 1200],
  ["G2", "P1", 22], ["G2", "P3", 18], ["G2", "P4", 30], ["G2", "P7", 44], ["G2", "P9", 26], ["G2", "P11", 180],
  ["G3", "P2", 14], ["G3", "P3", 26], ["G3", "P5", 33], ["G3", "P6", 17], ["G3", "P8", 52],
  ["G3", "P1", 12], ["G3", "P7", 19], ["G3", "P9", 41], ["G3", "P10", 340],
];
opening.forEach(([g, p, q], i) =>
  SEED_MUTASI.push({ id: "M" + i, tgl: "2026-07-01", gudang: g, produk: p, tipe: "masuk", qty: q, ref: "Stok pembukaan Juli", catatan: "" })
);

export const SEED_PENJUALAN = [
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

export const SEED_PEMBELIAN = [
  { id: "PO1", no: "PO-2607-001", tgl: "2026-07-05", pemasok: "S2", gudang: "G1", status: "lunas", items: [{ produk: "P8", qty: 60, harga: 315000 }] },
  { id: "PO2", no: "PO-2607-002", tgl: "2026-07-12", pemasok: "S1", gudang: "G1", status: "diterima", items: [{ produk: "P10", qty: 800, harga: 61500 }] },
  { id: "PO3", no: "PO-2607-003", tgl: "2026-07-20", pemasok: "S3", gudang: "G3", status: "order", items: [{ produk: "P11", qty: 250, harga: 77000 }] },
];
SEED_PEMBELIAN.filter((p) => ["diterima", "lunas"].includes(p.status)).forEach((p) =>
  p.items.forEach((it) =>
    SEED_MUTASI.push({ id: uid("M"), tgl: p.tgl, gudang: p.gudang, produk: it.produk, tipe: "masuk", qty: it.qty, ref: p.no, catatan: "Penerimaan pembelian" })
  )
);
