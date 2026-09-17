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

/* [kode, label, nama, bendera] — bendera yang tampil, nama yang dibacakan
   pembaca layar: emoji bendera tidak diucapkan seragam di semua peramban. */
export const LANGS = [
  ["id", "ID", "Bahasa Indonesia", "🇮🇩"],
  ["ko", "KO", "한국어", "🇰🇷"],
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
  "Isi username dan kata sandi.": "아이디·비밀번호 입력 필요",
  "● Neon terhubung": "● Neon 연결됨",
  "○ Server tidak terhubung — jalankan api-server.js": "○ 서버 연결 안 됨 — api-server.js 실행 필요",
  "Server tidak terjangkau. Login membutuhkan koneksi.": "서버 연결 불가 — 로그인하려면 연결 필요",
  "Selamat datang, {nama}.": "{nama}님 환영",
  "Sesi berakhir. Silakan masuk kembali.": "세션 만료 — 재로그인 필요",

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
  "Ganti sandi hanya tersedia saat online.": "비밀번호 변경 — 온라인 상태에서만 가능",
  "Isi kata sandi lama dan baru.": "기존 비밀번호·새 비밀번호 입력 필요",
  "Kata sandi baru minimal 6 karakter.": "새 비밀번호 최소 6자",
  "Konfirmasi kata sandi tidak cocok.": "비밀번호 확인 불일치",
  "Kata sandi berhasil diganti.": "비밀번호 변경 완료",

  /* penuntun kolom tanggal — menggantikan teks bawaan peramban */
  "hh/bb/tttt": "연도. 월. 일.",

  /* ---------- saldo awal (기초재고) ---------- */
  "Saldo Awal": "기초재고",
  "Stok Berjalan": "현재 재고",
  "Angka yang diisi adalah stok PEMBUKAAN. Masuk dan keluar yang sudah tercatat tetap dihitung di atasnya.":
    "입력 숫자는 개시 시점 기초재고. 기록된 입고·출고는 그 위에 가산",
  "Saldo awal {nama}": "{nama} 기초재고",
  "{n} barang akan disimpan": "{n}개 품목 저장 예정",
  "Saldo awal hanya tersedia saat online.": "기초재고 입력 — 온라인 상태에서만 가능",
  "Tidak ada saldo awal yang diubah.": "변경된 기초재고 없음",
  "Saldo awal harus berupa angka.": "기초재고는 숫자만 입력",
  "Jadikan stok berjalan 0": "현재 재고를 0으로 맞추기",
  "Hanya gudang yang dipilih. Periksa kolom Saldo Awal sebelum menyimpan.":
    "선택 창고만 해당 — 저장 전 기초재고 열 확인 필요",
  "Saldo awal {n} barang tersimpan.": "{n}개 품목 기초재고 저장 완료",

  /* ---------- usulan limit kredit ---------- */
  "Usulan Limit Kredit": "여신한도 기안",
  "Usul Limit Kredit": "여신한도 기안",
  "Usul Limit": "한도 기안",
  "Putusan Limit Kredit": "여신한도 확정",
  "Putuskan": "확정",
  "Putusan": "결재",
  "Setujui": "승인",
  "Tolak": "반려",
  "Ajukan": "기안",
  "Menunggu": "대기",
  "Disetujui": "승인됨",
  "Ditolak": "반려됨",
  "Limit Sekarang": "현재 한도",
  "Usulan": "기안액",
  "Alasan": "사유",
  "Pengaju": "기안자",
  "Limit Kredit Baru (Rp)": "신규 여신한도 (Rp)",
  "Limit sekarang: {n}": "현재 한도: {n}",
  "Termin Baru (hari)": "신규 결제조건(일)",
  "Termin sekarang: {n} hari": "현재 결제조건: {n}일",
  "Dibaca admin saat memutuskan.": "관리자 확정 시 참고",
  "Diajukan oleh {u}": "기안자 {u}",
  "Diajukan oleh petugas, disahkan oleh admin. Limit berubah hanya setelah disetujui.":
    "담당자 기안 → 관리자 확정. 승인 후에만 한도 변경",
  "Limit kredit harus angka nol atau lebih.": "여신한도는 0 이상 숫자만 입력",
  "Termin harus bilangan bulat nol hari atau lebih.": "결제조건은 0 이상 정수(일)만 입력",
  "Limit dan termin sama dengan yang berlaku sekarang.": "한도·결제조건 모두 현재와 동일",
  "Usulan limit hanya tersedia saat online.": "여신한도 기안 — 온라인 상태에서만 가능",
  "Putusan usulan hanya tersedia saat online.": "여신한도 확정 — 온라인 상태에서만 가능",
  "Usulan limit dikirim, menunggu persetujuan admin.": "여신한도 기안 접수 — 관리자 확정 대기",
  "Usulan disetujui, limit kredit diperbarui.": "기안 승인 — 여신한도 변경 완료",
  "Usulan ditolak.": "기안 반려 완료",

  /* ---------- usulan penghapusan data ---------- */
  "Permintaan Hapus": "삭제 요청",
  "Usul Hapus": "삭제 기안",
  "Putusan Permintaan Hapus": "삭제 요청 결재",
  "Setujui & Hapus": "승인 및 삭제",
  "Menunggu Putusan": "결재 대기",
  "Data|sasaran usulan hapus": "대상",
  "Diajukan oleh petugas, disahkan oleh admin. Data terhapus tepat saat usulan disetujui.":
    "담당자 기안 → 관리자 확정. 승인하는 순간 데이터 삭제",
  "Data belum terhapus. Penghapusan berjalan saat admin menyetujui usulan ini.":
    "아직 삭제되지 않음 — 관리자가 승인할 때 실행됨",
  "Menyetujui akan menghapus data ini beserta mutasi stoknya. Tidak bisa dibatalkan.":
    "승인하면 이 데이터와 재고 이동 기록이 함께 삭제되며 되돌릴 수 없습니다.",
  "Menyetujui akan menghapus data ini. Tidak bisa dibatalkan.":
    "승인하면 이 데이터가 삭제되며 되돌릴 수 없습니다.",
  "Permintaan hapus sedang menunggu putusan admin.": "삭제 요청 결재 대기 중",
  "Alasan penghapusan wajib diisi.": "삭제 사유는 필수 입력",
  "Usulan hapus hanya tersedia saat online.": "삭제 기안 — 온라인 상태에서만 가능",
  "Putusan hapus hanya tersedia saat online.": "삭제 확정 — 온라인 상태에서만 가능",
  "Usulan hapus dikirim, menunggu persetujuan admin.": "삭제 기안 접수 — 관리자 확정 대기",
  "Usulan disetujui, data dihapus.": "기안 승인 — 데이터 삭제 완료",

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
  "Belum ada pengguna.": "등록된 사용자 없음",
  "{n} akun": "{n}개 계정",
  "admin: akses penuh · manager: + hapus · staff: input & ubah":
    "admin: 전체 권한 · manager: + 삭제 · staff: 입력 및 수정",
  "Staf — input & ubah": "직원 — 입력 및 수정",
  "Manajer — + hapus": "매니저 — + 삭제",
  "Admin — akses penuh": "관리자 — 전체 권한",
  "Tambah pengguna hanya tersedia saat online.": "사용자 추가 — 온라인 상태에서만 가능",
  "Hapus pengguna hanya tersedia saat online.": "사용자 삭제 — 온라인 상태에서만 가능",
  "Lengkapi semua kolom.": "모든 항목 입력 필요",
  "Pengguna {u} ditambahkan.": "사용자 {u} 추가 완료",
  "Pengguna {u} dihapus.": "사용자 {u} 삭제 완료",
  "Hapus pengguna \"{u}\"? Tindakan ini permanen.": "사용자 \"{u}\" 삭제 (복구 불가) — 진행?",
  "Klik baris untuk mengubah nama dan peran.": "행 클릭 시 이름·역할 수정",
  "Ubah Pengguna": "사용자 수정",
  "Ubah": "수정",
  "Username tidak bisa diubah.": "아이디 변경 불가",
  "Peran akun sendiri tidak bisa diubah.": "본인 계정 역할 변경 불가",
  "Ubah pengguna hanya tersedia saat online.": "사용자 수정 — 온라인 상태에서만 가능",
  "Pengguna {u} diperbarui.": "사용자 {u} 정보 수정 완료",
  "Reset Sandi": "비밀번호 초기화",
  "Reset": "초기화",
  "Konfirmasi Reset Kata Sandi": "비밀번호 초기화 확인",
  "Kata sandi awal setelah reset: {s}": "초기화 후 비밀번호: {s}",
  "Reset kata sandi hanya tersedia saat online.": "비밀번호 초기화 — 온라인 상태에서만 가능",
  "Reset kata sandi \"{u}\" menjadi {s}? Pengguna harus menggantinya setelah masuk.":
    "사용자 \"{u}\" 비밀번호를 {s}(으)로 초기화 — 로그인 후 변경 안내 필요. 진행?",
  "Kata sandi {u} direset menjadi {s}.": "{u} 비밀번호 {s}(으)로 초기화 완료",

  /* ---------- dasbor ---------- */
  "Ringkasan Operasi": "운영 요약",
  "Ringkasan Bulanan": "월별 요약",
  "Ringkasan Stok": "재고 요약",
  "Nilai Stok": "재고 가치",
  /* KPI layar stok */
  "Total Stok": "총 재고",
  "Di Bawah Minimum": "최소 재고 미달",
  "Stok Negatif": "음수 재고",
  "stok di bawah batas minimum": "최소 재고보다 적은 품목",
  "semua di atas minimum": "모두 최소 재고 이상",
  "periksa Buku Mutasi Stok": "재고 수불부를 확인하세요",
  "tidak ada stok negatif": "음수 재고 없음",
  "harga pokok": "원가 기준",
  "⚠ stok negatif — periksa Buku Mutasi Stok": "⚠ 재고 음수 — 재고 이동 장부 확인 필요",
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
  /* kolom kuantitas peringkat pelanggan: kategori produk disingkat karena
     "Ban Jadi"/"Ban Jasa" lengkap tidak muat di kepala kolom angka */
  "Jadi|kolom": "완제품",
  "Jasa|kolom": "서비스",
  "Total Qty": "합계 수량",
  "{n} pelanggan": "고객 {n}개소",
  "Nilai": "금액",
  "Total": "합계",
  "Rata-rata / bulan": "월평균",
  "Gudang": "창고",
  "Tidak ada penjualan pada periode ini.": "해당 기간 판매 없음",

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
  "Belum ada barang pada kategori ini.": "이 분류에 품목 없음",
  "Tidak ada barang yang cocok dengan \"{q}\".": "\"{q}\" 일치 품목 없음",
  "Buku Mutasi Stok": "재고 이동 장부",
  "Stok dihitung dari buku ini, bukan diedit langsung.": "재고는 이 장부에서 계산 — 직접 수정 불가",
  "Tanggal": "일자",
  "Barang": "품목",
  "Jenis": "구분",
  "Referensi": "참조",
  "Belum ada mutasi stok.": "재고 이동 내역 없음",
  "Muat {n} lagi": "{n}건 더 보기",
  "{a} dari {b} baris": "전체 {b}건 중 {a}건",
  "Menampilkan {n} mutasi terakhir. Stok di atas tetap dihitung dari seluruh buku mutasi.":
    "최근 {n}건만 표시 — 위 재고는 전체 장부 기준 계산",

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
  "Pilih gudang asal dan tujuan terlebih dahulu.": "출발 창고·도착 창고 선택 필요",
  "Pilih barang terlebih dahulu.": "품목 선택 필요",
  "Gudang asal dan tujuan tidak boleh sama.": "출발 창고와 도착 창고 동일 불가",
  "Masukkan jumlah yang valid.": "올바른 수량 입력 필요",
  "Stok tidak cukup. Tersedia {n}.": "재고 부족 — 가용 {n}",
  "Pilih gudang terlebih dahulu.": "창고 선택 필요",
  "Masukkan hasil hitung fisik.": "실사 수량 입력 필요",
  "Tidak ada selisih — tidak ada yang dicatat.": "차이 없음 — 기록 생략",
  "Transfer tercatat.": "이고 기록 완료",
  "Penyesuaian tercatat.": "조정 기록 완료",

  /* ---------- penjualan ---------- */
  "Dari": "시작일",
  "Sampai": "종료일",
  "Cari nama pelanggan": "고객명 검색",
  "Reset Filter": "필터 초기화",
  "+ Penjualan Baru": "+ 새 판매",
  "Tidak ada transaksi pada filter ini.": "현재 필터에 해당 거래 없음",
  "Belum ada transaksi penjualan.": "판매 거래 없음",
  "Nilai Penjualan": "매출액",
  "Kuantitas": "판매수량",
  "Harga Rata-rata": "평균단가",
  "Jumlah Transaksi": "거래건수",
  "Transaksi|kolom": "건수",
  "vs tahun lalu": "전년 동기 대비",
  "tidak ada data tahun lalu": "전년 데이터 없음",
  "rata-rata {n}/bulan": "월평균 {n}건",
  "Tren Bulanan": "월별 추이",
  "Batang = nilai penjualan · garis = kuantitas": "막대 = 매출액 · 선 = 판매수량",
  "Pelanggan pada {bulan}": "{bulan} 고객별 매출",
  "klik bulan lain pada grafik untuk berganti": "차트에서 다른 달을 클릭하면 바뀝니다",

  /* sumbu analisis penjualan (VLK-UI-2026-001 tahap 4) */
  "Sumbu Analisis": "분석 기준",
  "Per Periode": "기간별",
  "Per Pelanggan": "고객별",
  "Per Produk": "품목별",
  "Peringkat": "순위",
  "Peringkat Pelanggan": "고객 매출 순위",
  "Peringkat Produk": "품목 매출 순위",
  "diurutkan menurut nilai penjualan pada periode terpilih": "선택 기간 매출액 기준 정렬",
  "transaksi dihitung sebagai SO unik, bukan baris item": "거래건수는 품목 행이 아닌 SO 단위로 집계",
  "Rincian transaksi": "거래 내역",
  "Tampilkan Semua ({n})": "전체 보기 ({n}건)",
  "Tampilkan 10 Teratas": "상위 10건만",
  "Kelompok": "묶음 기준",
  "(tidak diisi)": "(미입력)",
  "{n} produk": "{n}개 품목",
  "Pelanggan Hilang": "이탈 고객",
  "transaksi pertamanya jatuh di dalam periode ini": "이 기간에 첫 거래가 발생한 고객",
  "ada penjualan pada periode yang sama tahun lalu, tidak ada sekarang": "전년 동기에는 거래가 있었으나 이번 기간에는 없는 고객",
  "Transaksi Pertama": "첫 거래",
  "Nilai Tahun Lalu": "전년 매출",
  "{n} hari lalu": "{n}일 경과",
  "Belum ada pelanggan baru pada periode ini.": "이 기간에 신규 고객이 없습니다.",
  "Tidak ada pelanggan yang hilang.": "이탈 고객이 없습니다.",
  "Pilih tanggal awal dan akhir untuk membandingkan.": "비교하려면 시작일과 종료일을 모두 선택하세요.",
  "No.": "번호",
  "Rincian": "내역",
  "Status": "상태",
  "selesai": "완료",
  "Kembalikan status satu langkah": "상태를 한 단계 되돌립니다",
  "Cetak dokumen": "문서 인쇄",
  "Cetak": "인쇄",
  "Grade {g}": "등급 {g}",
  "Hapus penjualan {no}? Data & mutasi stoknya ikut terhapus.":
    "판매 {no} 삭제 — 데이터·재고 이동 내역 동시 삭제. 진행?",
  "{no} dibuat sebagai Penawaran.": "{no} 견적 생성 완료",
  "{no} dihapus.": "{no} 삭제 완료",

  /* ---------- dokumen (bilah kendali) ---------- */
  "Penawaran|dok": "견적서",
  "Faktur": "청구서",
  "Penerbit": "발행처",

  /* ---------- pengiriman ---------- */
  "Tanggal Kirim": "출고일",
  "Kirim {no}": "{no} 출고",
  "Kirim": "출고",
  "Tanggal Pengiriman": "출고일",
  "Tanggal dokumen: {tgl}": "문서일: {tgl}",
  "Isi tanggal pengiriman.": "출고일을 입력하세요",
  "Hanya untuk dokumen yang sudah dikirim.": "출고 상태인 문서에만 적용됩니다",
  "Tanggal kirim tidak boleh mendahului tanggal dokumen ({tgl}).": "출고일은 문서일({tgl})보다 이를 수 없습니다",

  /* ---------- formulir penjualan ---------- */
  "Penjualan Baru": "새 판매",
  "Ubah Penjualan {no}": "판매 {no} 수정",
  "Simpan Penawaran": "견적 저장",
  "Simpan Perubahan": "수정 저장",
  "Gudang Pengirim": "출고 창고",
  "Rincian Barang": "품목 내역",
  "Harga": "단가",
  "+ Tambah Baris": "+ 줄 추가",
  "Barang baris {i}": "{i}번째 줄 품목",
  "Jumlah baris {i}": "{i}번째 줄 수량",
  "Harga baris {i}": "{i}번째 줄 단가",
  "Hapus baris {i}": "{i}번째 줄 삭제",
  "Sisa Limit Kredit": "여신 한도 잔액",
  "Limit kredit belum diatur untuk pelanggan ini.": "이 고객은 여신 한도 미설정",
  "Belum diatur": "미설정",
  "Pilih pelanggan terlebih dahulu.": "고객 선택 필요",
  "Pilih gudang pengirim terlebih dahulu.": "출고 창고 선택 필요",
  "Qty harus berupa angka lebih besar dari 0.": "수량은 0보다 큰 숫자만 입력",
  "Tambahkan minimal satu baris barang.": "품목 최소 한 줄 추가 필요",
  "Pilih barang untuk setiap baris.": "각 줄 품목 선택 필요",
  "Harga harus berupa angka.": "단가는 숫자만 입력",
  "Melebihi limit kredit {nama} sebesar {v}.": "{nama} 여신 한도 {v} 초과",
  "Melebihi limit kredit {nama} sebesar {v} — penawaran tidak bisa disimpan.":
    "{nama} 여신 한도 {v} 초과 — 견적 저장 불가",

  /* ---------- pembelian ---------- */
  "+ Pembelian Baru": "+ 새 구매",
  "Pembelian {kategori}": "{kategori} 구매",
  "Utang Berjalan": "미지급금 잔액",
  "sudah diterima, belum dibayar": "입고 완료, 미지급",
  "Pembelian per Bulan": "월별 구매",
  "Belum ada pembelian.": "구매 내역 없음",
  "Pemasok": "공급처",
  "Gudang Tujuan": "입고 창고",
  "Belum ada transaksi pembelian.": "구매 거래 없음",
  "Pembelian Baru": "새 구매",
  "Simpan Pesanan": "발주 저장",
  "Pilih pemasok terlebih dahulu.": "공급처 선택 필요",
  "Pilih gudang tujuan terlebih dahulu.": "입고 창고 선택 필요",
  "Belum ada barang casing/bahan baku di katalog. Tambahkan dulu ke tabel produk.":
    "카탈로그에 케이싱/원자재 품목 없음 — 품목 등록 먼저 필요",
  "Hapus pembelian {no}? Data & mutasi stoknya ikut terhapus.":
    "구매 {no} 삭제 — 데이터·재고 이동 내역 동시 삭제. 진행?",
  "{no} dibuat. Stok bertambah saat status Diterima.":
    "{no} 생성 완료 — '입고' 상태 전환 시 재고 증가",

  /* ---------- pelanggan ---------- */
  "Kode / nama / pemilik / PIC / kota / sales": "코드 / 이름 / 오너 / 담당자 / 도시 / 영업",
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
  "Ubah Pelanggan": "고객 정보 수정",
  "Identitas Faktur": "인보이스 기재사항",
  "Data Penjualan": "영업 항목",
  "Pemilik": "오너",
  "Alamat": "주소",
  "Email": "이메일",
  "NPWP": "사업자번호",
  "Sales": "영업담당",
  "Sisa Limit": "한도 잔여",
  "Transaksi Terakhir": "최근 거래일",
  "Nama pemilik/direktur.": "오너·대표자명",
  "Nomor pajak, dicetak di faktur.": "세금번호 — 인보이스 인쇄 항목",
  "Alamat penagihan lengkap.": "청구 주소 전체",
  "Penanggung jawab di tempat pelanggan.": "고객사 실무 담당자",
  "Petugas penjualan penanggung akun.": "계정 담당 영업사원",
  "Catatan internal, tidak dicetak.": "내부 메모 — 인쇄 제외",
  "Hanya berubah lewat usulan yang disetujui admin.": "관리자 승인 기안으로만 변경 가능",
  "{nama} diperbarui.": "{nama} 수정 완료",
  "{no} diperbarui.": "{no} 수정 완료",
  "Nama pelanggan wajib diisi.": "고객명 필수",
  "Hapus pelanggan {nama}?": "고객 {nama} 삭제 — 진행?",
  "Tidak ada pelanggan yang cocok.": "일치 고객 없음",
  "Belum ada pelanggan.": "등록된 고객 없음",
  "melebihi limit kredit": "여신 한도 초과",
  "Riwayat Transaksi": "거래 내역",
  "Lihat rincian": "상세 내역 보기",
  "Produk": "품목",
  "Subtotal": "금액",
  "Belum ada transaksi.": "거래 내역 없음",
  "{nama} ditambahkan.": "{nama} 추가 완료",
  "{nama} dihapus.": "{nama} 삭제 완료",
  "Tidak bisa dihapus: pelanggan masih punya transaksi penjualan.":
    "삭제 불가 — 이 고객에게 판매 거래 잔존",

  /* ---------- piutang ---------- */
  "acuan: panduan analisis umur piutang": "기준: 미수금 연령분석 지침",
  "{n} invoice belum lunas": "미수 인보이스 {n}건",
  "Pelanggan Berpiutang": "미수 고객",
  "pelanggan dengan tagihan berjalan": "미수 잔액이 있는 고객",
  "Umur Piutang (Aging)": "미수금 연령분석",
  "Umur": "연령",
  "Porsi": "비중",
  "Tidak ada piutang berjalan.": "미수금 잔액 없음",
  "Pelanggan Berisiko": "위험 고객",
  "Nama pelanggan": "고객명",
  "Telat": "연체",
  "Pakai Limit": "한도 사용률",
  "{n} hr": "{n}일",
  "Rincian Invoice": "인보이스 상세",
  "Jatuh Tempo": "만기일",
  "Telat (hari)": "연체(일)",
  "Belum Jatuh Tempo": "미도래",
  "Jatuh Tempo Hari Ini": "만기 도래",
  "Undue": "미도래",
  "Ondue": "도래",
  "Overdue": "만기지남",
  "Lewat (hari)": "경과(일)",
  "Buka": "열기",
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
