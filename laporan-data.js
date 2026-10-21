/* Laporan mingguan data yang belum lengkap — dikirim ke sales penanggung akun.

   Isinya hanya daftar yang perlu dilengkapi (cabang tak dikenali, telepon/PIC/
   alamat kosong, grade belum dinilai, dugaan pelanggan kembar, produk tanpa
   ukuran/pola). Tidak ada yang diubah di basis data: laporan ini membaca saja.

   Penerima diatur lewat env, bukan kode, supaya alamat kantor tidak ikut
   tersimpan di repo:
     MAIL_TO   = "Lia:lia@kantor.co.id,Evi:evi@kantor.co.id,Seo:seo@kantor.co.id"
     MAIL_FROM = "VULKHAN <noreply@kantor.co.id>"
     SMTP_HOST, SMTP_PORT (465 = TLS langsung, selain itu STARTTLS), SMTP_USER, SMTP_PASS
   Nama di depan ":" dicocokkan dengan kolom sales pelanggan (tanpa beda huruf
   besar/kecil, cukup kata pertamanya). Pelanggan yang salesnya kosong atau tidak
   cocok dengan siapa pun dikirim ke semua penerima — tidak ada yang tercecer.
   Saat ini kolom sales berisi nama sales lapangan (mis. YONO), bukan penerima
   laporan, jadi praktisnya ketiga penerima mendapat daftar lengkap, urut per sales. */

// Sama dengan CABANG di src/App.jsx — ubah keduanya bersamaan.
const ALIAS_CABANG = ["SBY", "SURABAYA", "JKT", "JAKARTA", "KRW", "KARAWANG", "SMG", "SMR", "SEMARANG"];

// Sama dengan normNama/namaInduk/normTelp di src/App.jsx.
const BENTUK_USAHA = /^(PT|CV|UD|TB|TOKO|PO)\.?\s+/;
const normNama = (s) => String(s || "").toUpperCase().trim().replace(BENTUK_USAHA, "")
  .replace(/['’`]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const namaInduk = (s) => normNama(String(s || "").split(/\s+-\s+/)[0]);
const normTelp = (s) => String(s || "").replace(/\D/g, "").slice(-9);
const kosong = (v) => !String(v ?? "").trim();

export function penerimaDariEnv(env = process.env) {
  return String(env.MAIL_TO || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(":");
    return i < 0 ? { nama: x, email: x } : { nama: x.slice(0, i).trim(), email: x.slice(i + 1).trim() };
  }).filter((p) => p.email.includes("@"));
}

export function smtpSiap(env = process.env) {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM && penerimaDariEnv(env).length);
}

/* pelanggan: baris tabel pelanggan; produk: baris tabel produk;
   akanDihapus: Set id pelanggan yang menunggu persetujuan hapus (dilewati). */
export function susunLaporan({ pelanggan, produk, akanDihapus = new Set() }) {
  const aktif = pelanggan.filter((c) => !akanDihapus.has(c.id));
  const kurang = [];
  for (const c of aktif) {
    const isi = [];
    if (!ALIAS_CABANG.includes(String(c.kota || "").trim().toUpperCase()))
      isi.push(kosong(c.kota) ? "Cabang kosong" : `Cabang "${c.kota}" tidak dikenali`);
    if (kosong(c.telp)) isi.push("Telepon kosong");
    if (kosong(c.pic)) isi.push("PIC kosong");
    if (kosong(c.alamat)) isi.push("Alamat penagihan kosong");
    if (c.ppn && kosong(c.npwp)) isi.push("PKP tanpa NPWP");
    if (kosong(c.sales)) isi.push("Sales belum ditentukan");
    if (!c.grade_tgl) isi.push("Grade belum dinilai");
    if (isi.length) kurang.push({ c, isi });
  }
  // dikelompokkan per sales di surat, supaya mudah diteruskan ke orangnya
  kurang.sort((x, y) => String(x.c.sales || "~").localeCompare(String(y.c.sales || "~")) || String(x.c.kode).localeCompare(String(y.c.kode)));

  // dugaan kembar: dibandingkan berpasangan, tiap pasangan sekali
  const kembar = [];
  for (let i = 0; i < aktif.length; i++) {
    for (let j = i + 1; j < aktif.length; j++) {
      const a = aktif[i], b = aktif[j];
      const cabangA = /\s-\s/.test(a.nama), cabangB = /\s-\s/.test(b.nama);
      let alasan = null;
      if (normNama(a.nama) === normNama(b.nama)) alasan = "Nama sama";
      else if (namaInduk(a.nama) === namaInduk(b.nama) && !(cabangA && cabangB))
        alasan = 'Nama induk sama — bila beda cabang, ubah jadi "Nama - Cabang"';
      else if (normTelp(a.telp).length >= 8 && normTelp(a.telp) === normTelp(b.telp)) alasan = "Telepon sama";
      if (alasan) kembar.push({ a, b, alasan });
    }
  }

  const produkKurang = produk
    .filter((p) => p.kategori === "jadi" && (kosong(p.ukuran) || kosong(p.pola)))
    .map((p) => ({ p, isi: [kosong(p.ukuran) && "Ukuran kosong", kosong(p.pola) && "Pola kosong"].filter(Boolean) }));

  return { kurang, kembar, produkKurang };
}

const cocokSales = (sales, nama) => {
  const s = String(sales || "").trim().toLowerCase(), n = String(nama || "").trim().toLowerCase();
  return !!s && !!n && (s === n || s.split(/\s+/)[0] === n.split(/\s+/)[0]);
};

/* Satu surat per penerima: pelanggan miliknya + yang tak bertuan + bagian bersama
   (kembar dan produk), karena itu tidak punya pemilik tunggal. */
export function bagiPerPenerima(laporan, penerima) {
  const bertuan = (c) => penerima.some((p) => cocokSales(c.sales, p.nama));
  const milik = (c, p) => cocokSales(c.sales, p.nama) || !bertuan(c);
  return penerima.map((p) => ({
    ...p,
    kurang: laporan.kurang.filter(({ c }) => milik(c, p)),
    kembar: laporan.kembar.filter(({ a, b }) => milik(a, p) || milik(b, p)),
    produkKurang: laporan.produkKurang,
  }));
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const plg = (c) => `${c.kode} — ${c.nama}`;

export function suratHtml(bagian, { tanggal, url }) {
  const jumlah = bagian.kurang.length + bagian.kembar.length + bagian.produkKurang.length;
  const tabel = (judul, kepala, baris) => !baris.length ? "" : `
    <h3 style="margin:20px 0 6px;font-size:15px">${esc(judul)} (${baris.length})</h3>
    <table cellpadding="6" style="border-collapse:collapse;font-size:13px;width:100%">
      <tr style="background:#f1f5f9;text-align:left">${kepala.map((k) => `<th>${esc(k)}</th>`).join("")}</tr>
      ${baris.map((r) => `<tr style="border-top:1px solid #e2e8f0">${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
    </table>`;
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px">
    <p>Halo ${esc(bagian.nama)},</p>
    <p>Berikut data VULKHAN per ${esc(tanggal)} yang masih perlu dilengkapi (${jumlah} butir).
       Mohon diperbarui di menu Pelanggan / Produk.</p>
    ${tabel("Data pelanggan belum lengkap", ["Pelanggan", "Sales", "Yang kurang"],
      bagian.kurang.map(({ c, isi }) => [plg(c), c.sales || "—", isi.join(", ")]))}
    ${tabel("Dugaan pelanggan terdaftar dua kali", ["Pelanggan 1", "Pelanggan 2", "Alasan"],
      bagian.kembar.map(({ a, b, alasan }) => [plg(a), plg(b), alasan]))}
    ${tabel("Produk tanpa ukuran/pola", ["Produk", "Yang kurang"],
      bagian.produkKurang.map(({ p, isi }) => [`${p.kode} — ${p.nama}`, isi.join(", ")]))}
    ${url ? `<p style="margin-top:20px"><a href="${esc(url)}">Buka VULKHAN</a></p>` : ""}
    <p style="color:#64748b;font-size:12px;margin-top:24px">Surat otomatis mingguan — tidak perlu dibalas.</p>
  </div>`;
}

export async function kirimLaporan(bagianList, { tanggal, url }, env = process.env) {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(env.SMTP_PORT) || 587;
  const kurir = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const hasil = [];
  for (const b of bagianList) {
    const jumlah = b.kurang.length + b.kembar.length + b.produkKurang.length;
    // tidak ada yang perlu dilengkapi → tidak usah mengirim surat kosong
    if (!jumlah) { hasil.push({ nama: b.nama, dikirim: false, jumlah }); continue; }
    await kurir.sendMail({
      from: env.MAIL_FROM, to: b.email,
      subject: `[VULKHAN] ${jumlah} data perlu dilengkapi — ${tanggal}`,
      html: suratHtml(b, { tanggal, url }),
    });
    hasil.push({ nama: b.nama, dikirim: true, jumlah });
  }
  return hasil;
}
