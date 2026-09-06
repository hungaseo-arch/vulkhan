import React, { createContext, useContext, useEffect, useState } from "react";

/* ============================================================
   Dwibahasa: Bahasa Indonesia (id) & Korea (ko).

   Kunci kamus = teks sumber bahasa Indonesia, jadi `id` cukup
   memakai kuncinya sendiri dan terjemahan yang belum ada tidak
   pernah menghasilkan layar kosong — jatuh kembali ke Indonesia.

   Kunci boleh diberi konteks dengan "|" bila satu kata Indonesia
   punya dua arti berbeda (mis. "Masuk|login" vs "Masuk" mutasi).
   Bagian setelah "|" tidak pernah ditampilkan.
   ============================================================ */

export const LANGS = [
  ["id", "ID", "Bahasa Indonesia"],
  ["ko", "KO", "한국어"],
];

const KO = {
  /* ---------- navigasi & header ---------- */
  "Ringkasan": "요약",
  "Stok Gudang": "창고 재고",
  "Penjualan": "판매",
  "Pembelian": "구매",
  "Pelanggan": "고객",
  "Piutang": "미수금",
  "Pengguna": "사용자",
  "Beranda": "홈",
  "Ganti kata sandi": "비밀번호 변경",
  "Keluar": "로그아웃",
  "Menyambung…": "연결 중…",
  "Bahasa": "언어",

  /* ---------- login ---------- */
  "Username": "아이디",
  "Kata Sandi": "비밀번호",
  "Masuk|login": "로그인",
  "Memproses…": "처리 중…",
  "Isi username dan kata sandi.": "아이디와 비밀번호를 입력하세요.",
  "● Neon terhubung": "● Neon 연결됨",
  "○ Server tidak terhubung — jalankan api-server.js": "○ 서버 연결 안 됨 — api-server.js를 실행하세요",
  "Server tidak terjangkau. Login membutuhkan koneksi.": "서버에 연결할 수 없습니다. 로그인하려면 연결이 필요합니다.",
  "Selamat datang, {nama}.": "{nama}님, 환영합니다.",
  "Sesi berakhir. Silakan masuk kembali.": "세션이 만료되었습니다. 다시 로그인하세요.",

  /* ---------- peran ---------- */
  "Admin": "관리자",
  "Manajer": "매니저",
  "Staf": "직원",
  "Akses penuh": "전체 권한",
  "+ Hapus": "+ 삭제",
  "Input & ubah": "입력 및 수정",

  /* ---------- status & kategori ---------- */
  "Penawaran": "견적",
  "Pesanan": "주문",
  "Dikirim": "출고",
  "Ditagih": "청구",
  "Lunas": "완납",
  "Dipesan": "발주",
  "Diterima": "입고",
  "Ban Jadi": "완제품 타이어",
  "Ban Jasa": "서비스 타이어",
  "Casing": "케이싱",
  "Bahan Baku": "원자재",
  "Masuk": "입고",
  "Keluar|mutasi": "출고",
  "Transfer": "이고",
  "Penyesuaian": "조정",

  /* ---------- dialog umum ---------- */
  "Konfirmasi Hapus": "삭제 확인",
  "Tutup dialog": "대화상자 닫기",
  "Tutup dokumen": "문서 닫기",
  "Batal": "취소",
  "Hapus": "삭제",
  "Simpan": "저장",
  "Tutup": "닫기",
  "Tidak ditemukan": "검색 결과 없음",
  "Memuat…": "불러오는 중…",

  /* ---------- ganti kata sandi ---------- */
  "Ganti Kata Sandi": "비밀번호 변경",
  "Kata Sandi Lama": "기존 비밀번호",
  "Kata Sandi Baru": "새 비밀번호",
  "Ulangi Kata Sandi Baru": "새 비밀번호 확인",
  "Minimal 6 karakter": "최소 6자",
  "Ganti sandi hanya tersedia saat online.": "비밀번호 변경은 온라인 상태에서만 가능합니다.",
  "Isi kata sandi lama dan baru.": "기존 비밀번호와 새 비밀번호를 입력하세요.",
  "Kata sandi baru minimal 6 karakter.": "새 비밀번호는 최소 6자여야 합니다.",
  "Konfirmasi kata sandi tidak cocok.": "비밀번호 확인이 일치하지 않습니다.",
  "Kata sandi berhasil diganti.": "비밀번호가 변경되었습니다.",

  /* ---------- pengguna (admin) ---------- */
  "Pengguna & Hak Akses": "사용자 및 권한",
  "+ Pengguna Baru": "+ 새 사용자",
  "Daftar Pengguna": "사용자 목록",
  "Pengguna Baru": "새 사용자",
  "Nama Lengkap": "이름",
  "Nama": "이름",
  "Peran": "역할",
  "Aksi": "작업",
  "Akun Anda": "내 계정",
  "Belum ada pengguna.": "등록된 사용자가 없습니다.",
  "{n} akun": "{n}개 계정",
  "admin: akses penuh · manager: + hapus · staff: input & ubah":
    "admin: 전체 권한 · manager: + 삭제 · staff: 입력 및 수정",
  "Staf — input & ubah": "직원 — 입력 및 수정",
  "Manajer — + hapus": "매니저 — + 삭제",
  "Admin — akses penuh": "관리자 — 전체 권한",
  "Tambah pengguna hanya tersedia saat online.": "사용자 추가는 온라인 상태에서만 가능합니다.",
  "Hapus pengguna hanya tersedia saat online.": "사용자 삭제는 온라인 상태에서만 가능합니다.",
  "Lengkapi semua kolom.": "모든 항목을 입력하세요.",
  "Pengguna {u} ditambahkan.": "사용자 {u} 추가되었습니다.",
  "Pengguna {u} dihapus.": "사용자 {u} 삭제되었습니다.",
  "Hapus pengguna \"{u}\"? Tindakan ini permanen.": "사용자 \"{u}\"을(를) 삭제할까요? 되돌릴 수 없습니다.",

  /* ---------- dasbor ---------- */
  "Ringkasan Operasi": "운영 요약",
  "Ringkasan Bulanan": "월별 요약",
  "Ringkasan Stok": "재고 요약",
  "Nilai Stok": "재고 가치",
  "harga pokok": "원가 기준",
  "⚠ stok negatif — periksa Buku Mutasi Stok": "⚠ 재고 음수 — 재고 이동 장부를 확인하세요",
  "Piutang Berjalan": "미수금 잔액",
  "belum lunas": "미수",
  "Piutang > 90 Hari": "90일 초과 미수금",
  "{p}% dari piutang berjalan": "미수금 잔액의 {p}%",
  "{n} transaksi": "{n}건",
  "Penjualan per Bulan": "월별 판매",
  "tidak termasuk penawaran": "견적 제외",
  "Stok per Gudang": "창고별 재고",
  "Bulan": "월",
  "Transaksi": "거래",
  "Qty": "수량",
  "Nilai": "금액",
  "Total": "합계",
  "Rata-rata / bulan": "월평균",
  "Gudang": "창고",
  "Tidak ada penjualan pada periode ini.": "해당 기간의 판매가 없습니다.",

  /* ---------- stok ---------- */
  "Kode": "코드",
  "Nama Barang": "품명",
  "Kategori": "분류",
  "Ukuran": "규격",
  "Pola": "패턴",
  "Grade": "등급",
  "Merek": "브랜드",
  "Satuan": "단위",
  "Min": "최소",
  "Harga Beli": "매입가",
  "Harga Agen": "대리점가",
  "Harga User": "소비자가",
  "harga jual agen": "대리점 판매가",
  "harga jual pengguna akhir": "최종 소비자가",
  "Semua Gudang": "전체 창고",
  "Semua": "전체",
  "Cari": "검색",
  "Kode / nama / ukuran": "코드 / 품명 / 규격",
  "Transfer Antar Gudang": "창고 간 이고",
  "Penyesuaian Stok": "재고 조정",
  "Belum ada barang pada kategori ini.": "이 분류에 품목이 없습니다.",
  "Tidak ada barang yang cocok dengan \"{q}\".": "\"{q}\"와(과) 일치하는 품목이 없습니다.",
  "Buku Mutasi Stok": "재고 이동 장부",
  "Stok dihitung dari buku ini, bukan diedit langsung.": "재고는 이 장부에서 계산되며 직접 수정하지 않습니다.",
  "Tanggal": "일자",
  "Barang": "품목",
  "Jenis": "구분",
  "Referensi": "참조",
  "Belum ada mutasi stok.": "재고 이동 내역이 없습니다.",
  "Muat {n} lagi": "{n}건 더 보기",
  "{a} dari {b} baris": "전체 {b}건 중 {a}건",
  "Menampilkan {n} mutasi terakhir. Stok di atas tetap dihitung dari seluruh buku mutasi.":
    "최근 {n}건의 이동만 표시합니다. 위 재고는 전체 장부를 기준으로 계산됩니다.",

  /* ---------- transfer & penyesuaian ---------- */
  "Dari Gudang": "출발 창고",
  "Ke Gudang": "도착 창고",
  "-- Pilih Gudang --": "-- 창고 선택 --",
  "-- Pilih Barang --": "-- 품목 선택 --",
  "-- Pilih Pelanggan --": "-- 고객 선택 --",
  "-- Pilih Pemasok --": "-- 공급처 선택 --",
  "Jumlah": "수량",
  "Tersedia di gudang asal: {n}": "출발 창고 가용: {n}",
  "Hitung Fisik": "실사 수량",
  "Stok sistem: {n}": "시스템 재고: {n}",
  "Selisih": "차이",
  "Catatan": "비고",
  "Pilih gudang asal dan tujuan terlebih dahulu.": "출발 창고와 도착 창고를 먼저 선택하세요.",
  "Pilih barang terlebih dahulu.": "품목을 먼저 선택하세요.",
  "Gudang asal dan tujuan tidak boleh sama.": "출발 창고와 도착 창고는 같을 수 없습니다.",
  "Masukkan jumlah yang valid.": "올바른 수량을 입력하세요.",
  "Stok tidak cukup. Tersedia {n}.": "재고가 부족합니다. 가용 {n}.",
  "Pilih gudang terlebih dahulu.": "창고를 먼저 선택하세요.",
  "Masukkan hasil hitung fisik.": "실사 수량을 입력하세요.",
  "Tidak ada selisih — tidak ada yang dicatat.": "차이가 없어 기록하지 않습니다.",
  "Transfer tercatat.": "이고가 기록되었습니다.",
  "Penyesuaian tercatat.": "조정이 기록되었습니다.",
  "Stok {kode} di {gudang} tidak cukup (tersedia {n}).":
    "{gudang}의 {kode} 재고가 부족합니다 (가용 {n}).",

  /* ---------- penjualan ---------- */
  "Dari": "시작일",
  "Sampai": "종료일",
  "Cari nama pelanggan": "고객명 검색",
  "Reset Filter": "필터 초기화",
  "+ Penjualan Baru": "+ 새 판매",
  "pada filter ini": "현재 필터 기준",
  "Jumlah Qty": "총 수량",
  "total kuantitas terfilter": "필터된 총 수량",
  "Total Nilai": "총 금액",
  "total penjualan terfilter": "필터된 총 판매액",
  "Tidak ada transaksi pada filter ini.": "현재 필터에 해당하는 거래가 없습니다.",
  "Belum ada transaksi penjualan.": "판매 거래가 없습니다.",
  "{n} transaksi · {q} pcs · {v}": "{n}건 · {q} pcs · {v}",
  "No.": "번호",
  "Rincian": "내역",
  "Status": "상태",
  "selesai": "완료",
  "Cetak dokumen": "문서 인쇄",
  "Cetak": "인쇄",
  "Grade {g}": "등급 {g}",
  "Hapus penjualan {no}? Data & mutasi stoknya ikut terhapus.":
    "판매 {no}을(를) 삭제할까요? 데이터와 재고 이동 내역도 함께 삭제됩니다.",
  "{no} dibuat sebagai Penawaran.": "{no} 견적으로 생성되었습니다.",
  "{no} dihapus.": "{no} 삭제되었습니다.",

  /* ---------- dokumen (bilah kendali) ---------- */
  "Penawaran|dok": "견적서",
  "Faktur": "청구서",
  "Penerbit": "발행처",

  /* ---------- formulir penjualan ---------- */
  "Penjualan Baru": "새 판매",
  "Simpan Penawaran": "견적 저장",
  "Gudang Pengirim": "출고 창고",
  "Rincian Barang": "품목 내역",
  "Harga": "단가",
  "stok {n}": "재고 {n}",
  "+ Tambah Baris": "+ 줄 추가",
  "Barang baris {i}": "{i}번째 줄 품목",
  "Jumlah baris {i}": "{i}번째 줄 수량",
  "Harga baris {i}": "{i}번째 줄 단가",
  "Hapus baris {i}": "{i}번째 줄 삭제",
  "Sisa Limit Kredit": "여신 한도 잔액",
  "Pilih pelanggan terlebih dahulu.": "고객을 먼저 선택하세요.",
  "Pilih gudang pengirim terlebih dahulu.": "출고 창고를 먼저 선택하세요.",
  "Qty harus berupa angka lebih besar dari 0.": "수량은 0보다 큰 숫자여야 합니다.",
  "Tambahkan minimal satu baris barang.": "품목을 최소 한 줄 추가하세요.",
  "Pilih barang untuk setiap baris.": "각 줄의 품목을 선택하세요.",
  "Harga harus berupa angka.": "단가는 숫자여야 합니다.",
  "Melebihi limit kredit {nama} sebesar {v}.": "{nama}의 여신 한도를 {v} 초과합니다.",
  "Melebihi limit kredit {nama} sebesar {v} — penawaran tidak bisa disimpan.":
    "{nama}의 여신 한도를 {v} 초과하여 견적을 저장할 수 없습니다.",
  "{n} baris melebihi stok di {g}. Masih bisa disimpan sebagai penawaran, tetapi status {s} akan ditolak sampai stok mencukupi.":
    "{n}개 줄이 {g}의 재고를 초과합니다. 견적으로는 저장할 수 있으나, 재고가 확보될 때까지 '{s}' 상태로는 진행할 수 없습니다.",

  /* ---------- pembelian ---------- */
  "+ Pembelian Baru": "+ 새 구매",
  "Pembelian {kategori}": "{kategori} 구매",
  "Utang Berjalan": "미지급금 잔액",
  "sudah diterima, belum dibayar": "입고 완료, 미지급",
  "Pembelian per Bulan": "월별 구매",
  "Belum ada pembelian.": "구매 내역이 없습니다.",
  "Pemasok": "공급처",
  "Gudang Tujuan": "입고 창고",
  "Belum ada transaksi pembelian.": "구매 거래가 없습니다.",
  "Pembelian Baru": "새 구매",
  "Simpan Pesanan": "발주 저장",
  "Pilih pemasok terlebih dahulu.": "공급처를 먼저 선택하세요.",
  "Pilih gudang tujuan terlebih dahulu.": "입고 창고를 먼저 선택하세요.",
  "Belum ada barang casing/bahan baku di katalog. Tambahkan dulu ke tabel produk.":
    "카탈로그에 케이싱/원자재 품목이 없습니다. 먼저 품목을 등록하세요.",
  "Hapus pembelian {no}? Data & mutasi stoknya ikut terhapus.":
    "구매 {no}을(를) 삭제할까요? 데이터와 재고 이동 내역도 함께 삭제됩니다.",
  "{no} dibuat. Stok bertambah saat status Diterima.":
    "{no} 생성됨. 상태가 '입고'가 되면 재고가 증가합니다.",

  /* ---------- pelanggan ---------- */
  "Kode / nama / PIC / kota": "코드 / 이름 / 담당자 / 도시",
  "+ Pelanggan Baru": "+ 새 고객",
  "Kota": "도시",
  "Termin": "결제조건",
  "Limit Kredit": "여신 한도",
  "Omzet": "매출",
  "PIC": "담당자",
  "Telepon": "전화",
  "{n} hari": "{n}일",
  "Termin (hari)": "결제조건(일)",
  "Limit Kredit (Rp)": "여신 한도 (Rp)",
  "Nama Perusahaan": "회사명",
  "Pelanggan Baru": "새 고객",
  "Nama pelanggan wajib diisi.": "고객명은 필수입니다.",
  "Hapus pelanggan {nama}?": "고객 {nama}을(를) 삭제할까요?",
  "Tidak ada pelanggan yang cocok.": "일치하는 고객이 없습니다.",
  "Belum ada pelanggan.": "등록된 고객이 없습니다.",
  "melebihi limit kredit": "여신 한도 초과",
  "Riwayat Transaksi": "거래 내역",
  "Belum ada transaksi.": "거래 내역이 없습니다.",
  "{nama} ditambahkan.": "{nama} 추가되었습니다.",
  "{nama} dihapus.": "{nama} 삭제되었습니다.",
  "Tidak bisa dihapus: pelanggan masih punya transaksi penjualan.":
    "삭제할 수 없습니다: 이 고객에게 판매 거래가 남아 있습니다.",

  /* ---------- piutang ---------- */
  "acuan: panduan analisis umur piutang": "기준: 미수금 연령분석 지침",
  "{n} invoice belum lunas": "미수 인보이스 {n}건",
  "Pelanggan Berpiutang": "미수 고객",
  "pelanggan dengan tagihan berjalan": "미수 잔액이 있는 고객",
  "Umur Piutang (Aging)": "미수금 연령분석",
  "Umur": "연령",
  "Invoice": "인보이스",
  "Porsi": "비중",
  "Tidak ada piutang berjalan.": "미수금 잔액이 없습니다.",
  "Pelanggan Berisiko": "위험 고객",
  "Nama pelanggan": "고객명",
  "Telat": "연체",
  "Pakai Limit": "한도 사용률",
  "{n} hr": "{n}일",
  "Rincian Invoice": "인보이스 상세",
  "Jatuh Tempo": "만기일",
  "Telat (hari)": "연체(일)",
  "Belum Jatuh Tempo": "미도래",
  "1–30 Hari": "1–30일",
  "31–60 Hari": "31–60일",
  "61–90 Hari": "61–90일",
  "91–180 Hari": "91–180일",
  "> 180 Hari": "180일 초과",
  "Kritis": "위험",
  "Tinggi": "높음",
  "Sedang": "보통",
  "Rendah": "낮음",
};

const KAMUS = { id: {}, ko: KO };

/* buang konteks setelah "|" — hanya penanda kunci, tak pernah tampil */
const polos = (s) => {
  const i = s.indexOf("|");
  return i < 0 ? s : s.slice(0, i);
};
/* isi placeholder {nama} dengan nilai dari `p` */
const isi = (s, p) =>
  p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s;

const Ctx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const v = localStorage.getItem("vk_lang");
      return v === "ko" || v === "id" ? v : "id";
    } catch { return "id"; }
  });

  useEffect(() => {
    try { localStorage.setItem("vk_lang", lang); } catch { /* noop */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (s, p) => isi(KAMUS[lang]?.[s] ?? polos(s), p);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang dipakai di luar <LangProvider>.");
  return v;
}
