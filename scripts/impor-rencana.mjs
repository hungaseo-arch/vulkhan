// Impor dokumen HTML rencana operasi (mis. 재생사업부_2027년_조직도.html) menjadi
// modul konten yang dilayani /api/rencana-2027.
//
//   node scripts/impor-rencana.mjs <berkas.html> [konten/rencana-2027-organisasi.js]
//
// Dokumen aslinya halaman berdiri sendiri (header, logo base64, skrip ganti
// bahasa, CSS global). Skrip ini hanya mengambil isi .page-body, membuang
// header/logo/pemilih bahasa, memberi awalan "rp27-" pada id agar tidak
// bertabrakan dengan layar lain, dan mengurung semua CSS di bawah `.vk .rp27`
// supaya tidak bocor ke aplikasi. Bahasa kartu SVG ikut LangSwitch aplikasi.
import { readFileSync, writeFileSync } from "fs";

const [, , masuk, keluar = "konten/rencana-2027-organisasi.js"] = process.argv;
if (!masuk) {
  console.error("Pemakaian: node scripts/impor-rencana.mjs <berkas.html> [keluaran.js]");
  process.exit(1);
}
const src = readFileSync(masuk, "utf8");

/* ---------- HTML ---------- */
const awal = src.indexOf('<div class="page-body">');
const akhir = src.lastIndexOf("<script");
if (awal < 0 || akhir < 0) throw new Error("Struktur tak dikenal: .page-body / <script> tidak ditemukan");
let html = src.slice(awal, akhir).trim();
// pemilih bahasa di dalam dokumen → diganti LangSwitch aplikasi
html = html.replace(/\s*<div class="lang-pick">[\s\S]*?<\/div>\s*<\/div>/g, "");
// id & tautan internal diberi awalan
html = html
  .replace(/\bid="([\w-]+)"/g, 'id="rp27-$1"')
  .replace(/href="#([\w-]+)"/g, 'href="#rp27-$1"')
  .replace(/aria-labelledby="([\w-]+)"/g, 'aria-labelledby="rp27-$1"');
if (/<script|\son\w+=/i.test(html)) throw new Error("Dokumen berisi skrip/handler — tidak diimpor");

/* ---------- CSS ---------- */
const css0 = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const BUANG = /(^|[\s,])(body|html|\.accent-bar|\.app-header|\.logo|\.lang-switch|\.lang-pick|\.lang-pick-label|\.btn-status|\.asm-pill)\b/;
const lingkup = (sel) =>
  sel.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !BUANG.test(s))
    .map((s) => (s === ":root" ? ".vk .rp27" : `.vk .rp27 ${s.replace(/#toc\b/g, "#rp27-toc")}`))
    .join(",");

// pengurai blok sederhana: cukup untuk CSS datar + @media satu tingkat
function urai(teks) {
  const out = [];
  let i = 0;
  while (i < teks.length) {
    const buka = teks.indexOf("{", i);
    if (buka < 0) break;
    const kepala = teks.slice(i, buka).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let dalam = 1, j = buka + 1;
    while (j < teks.length && dalam) { if (teks[j] === "{") dalam++; else if (teks[j] === "}") dalam--; j++; }
    out.push([kepala, teks.slice(buka + 1, j - 1)]);
    i = j;
  }
  return out;
}
const aturan = (blok) => urai(blok).map(([sel, isi]) => {
  const s = lingkup(sel);
  return s ? `${s}{${isi.trim()}}` : "";
}).filter(Boolean);

const css = [];
for (const [kepala, isi] of urai(css0)) {
  if (kepala.startsWith("@page")) continue;
  if (kepala.startsWith("@media")) {
    const r = aturan(isi);
    if (r.length) css.push(`${kepala}{${r.join("")}}`);
    continue;
  }
  const s = lingkup(kepala);
  if (s) css.push(`${s}{${isi.trim()}}`);
}
// bahasa kartu ikut atribut data-ui-lang pada pembungkus .rp27
css.push('.vk .rp27[data-ui-lang="ko"] [data-lang]:not([data-lang="ko"]),.vk .rp27[data-ui-lang="id"] [data-lang]:not([data-lang="id"]){display:none!important}');
css.push(".vk .rp27 .page-body{padding:0;max-width:none}");
// pengganti aturan body yang dibuang (latar & margin tetap milik aplikasi)
css.push(".vk .rp27{color:var(--asm-fg);font-family:var(--font-sans);font-size:14px;line-height:1.6}");

const judul = (src.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
const tgl = (src.match(/기준일 (\d{4}-\d{2}-\d{2})/) || [])[1] || null;
const versi = (src.match(/asm-pill">([^<]+)</) || [])[1] || null;

const isi = `// DIBUAT OTOMATIS oleh scripts/impor-rencana.mjs — jangan diubah tangan.
// Sumber: ${masuk.split(/[\\/]/).pop()}
export default ${JSON.stringify({ judul, tgl, versi, html, css: css.join("\n") }, null, 2)};
`;
writeFileSync(keluar, isi);
console.log(`→ ${keluar}  (html ${html.length} B, css ${css.join("").length} B)`);
