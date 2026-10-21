// Penulis XLSX minimal tanpa dependensi.
// Membuat file .xlsx asli (ZIP + CRC32, inline string, styles.xml) yang dibuka
// langsung oleh Excel / LibreOffice / Google Sheets.

/* ---------- CRC32 ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- ZIP (metode STORE, tanpa kompresi) ---------- */
function zipBlob(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const TIME = 0, DATE = 0x21; // 1980-01-01
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, TIME, true);
    lh.setUint16(12, DATE, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, TIME, true);
    cd.setUint16(14, DATE, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + size;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ---------- XLSX ---------- */
const esc = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function colRef(c) {
  let s = "";
  c++;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

/* Gaya sel (indeks cellXfs di styles.xml):
   0 bawaan · 1 kepala (tebal, latar abu) · 2 bilangan bulat #,##0 ·
   3 tanggal yyyy-mm-dd · 4 desimal #,##0.00 */
const S_HEAD = 1, S_INT = 2, S_DATE = 3, S_DEC = 4;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/* "2026-07-08" → nomor seri Excel (hari sejak 1899-12-30), supaya kolom
   tanggal bisa diurutkan/difilter sebagai tanggal, bukan teks. */
const TGL = /^(\d{4})-(\d{2})-(\d{2})$/;
const serialTgl = (v) => {
  const m = TGL.exec(v);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(ms) ? ms / 86400000 + 25569 : null;
};

function sheetXml(aoa) {
  let rows = "";
  const lebar = [];
  aoa.forEach((row, r) => {
    let cells = "";
    row.forEach((val, c) => {
      const ref = colRef(c) + (r + 1);
      const teks = val == null ? "" : String(val);
      lebar[c] = Math.max(lebar[c] || 0, typeof val === "number" ? teks.length + 3 : teks.length);
      if (r === 0) {
        cells += `<c r="${ref}" s="${S_HEAD}" t="inlineStr"><is><t xml:space="preserve">${esc(teks)}</t></is></c>`;
      } else if (typeof val === "number" && isFinite(val)) {
        cells += `<c r="${ref}" s="${Number.isInteger(val) ? S_INT : S_DEC}"><v>${val}</v></c>`;
      } else if (typeof val === "string" && serialTgl(val) != null) {
        cells += `<c r="${ref}" s="${S_DATE}"><v>${serialTgl(val)}</v></c>`;
      } else {
        cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(teks)}</t></is></c>`;
      }
    });
    rows += `<row r="${r + 1}">${cells}</row>`;
  });
  const nKol = Math.max(1, ...aoa.map((r) => r.length));
  const cols = Array.from({ length: nKol }, (_, c) =>
    `<col min="${c + 1}" max="${c + 1}" width="${Math.min(50, Math.max(8, (lebar[c] || 0) + 2))}" customWidth="1"/>`).join("");
  // baris 1 dibekukan + filter otomatis atas seluruh tabel
  const pane = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  const filter = aoa.length > 1 ? `<autoFilter ref="A1:${colRef(nKol - 1)}${aoa.length}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${rows}</sheetData>${filter}</worksheet>`;
}

const safeSheet = (n) => (n || "Sheet1").replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Sheet1";

/**
 * Unduh beberapa sheet sebagai satu file .xlsx.
 * @param {string} filename  nama file (tanpa/ dengan .xlsx)
 * @param {Array<{name: string, rows: Array<Array<string|number>>}>} sheets  baris ke-0 tiap sheet = header
 */
export function downloadXlsxBook(filename, sheets) {
  const enc = new TextEncoder();
  const names = sheets.map((sh) => safeSheet(sh.name));
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  const files = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
          names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${
          sheets.map((sh, i) => sh.rows.length > 1
            ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!$A$1:$${colRef(Math.max(1, ...sh.rows.map((r) => r.length)) - 1)}$${sh.rows.length}</definedName>`
            : "").join("")}</definedNames></workbook>`
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
        }<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      ),
    },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(sh.rows)) })),
  ];
  const blob = zipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".xlsx") ? filename : filename + ".xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Satu sheet — bentuk lama, dipakai layar lain. */
export function downloadXlsx(filename, sheetName, aoa) {
  downloadXlsxBook(filename, [{ name: sheetName, rows: aoa }]);
}
