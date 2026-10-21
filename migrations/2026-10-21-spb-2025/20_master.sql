-- 2025년 원장에만 나오는 거래처 20곳과 품목 1종을 먼저 만듭니다. 이 단계 없이
-- 30_insert.sql 을 돌리면 거기서 중단됩니다(미매칭 검사).
-- 10_dry_run.sql 의 2·3·6·7번 출력을 확인한 뒤 실행하십시오. 재실행해도 안전합니다.
BEGIN;

-- ── 거래처 20곳 ──────────────────────────────────────────────────
-- 2026년 원장(1~8월)에는 한 번도 나오지 않은 이름들입니다. 이미 같은 이름이
-- 있으면(대소문자·앞뒤 공백 무시) 건너뜁니다.
--
-- 채번: 'C숫자' id 와 'PLG-숫자' kode 의 최대값 다음부터 매깁니다. 화면에서
-- 만든 거래처는 'C-AB12CD' / 'PLG-' + 임의 세 자리라 모양이 달라 계산에서
-- 빠지고, 최대값보다 큰 번호만 쓰므로 그 행들과도 겹치지 않습니다.
-- 자릿수는 최소 3자리이고 넘치면 늘어납니다(lpad 는 긴 값을 잘라 버립니다).
--
-- 여신한도 0(미설정), 등급 B, 결제조건 30일 — 2026-09-15 신규 4곳과 같습니다.
WITH baru(nama) AS (
  VALUES ('AGUNG TRANSPORT'),
         ('BAPAK RAYMOND'),
         ('BAPAK ROBI'),
         ('CV. ASTRA RAHARJA'),
         ('CV. HUTAMA MILENIAL'),
         ('DWI EKA SUTRESNA'),
         ('FADILAH WIDIARSANTI'),
         ('GIARSO'),
         ('INDRA IRAWAN (PAK NDUT)'),
         ('LAS TRANSPORT'),
         ('PAK BAYU'),
         ('POLING LINDAJATI, ST'),
         ('PT. HANA AHN TECHNOLOGY'),
         ('PT. KURNIA MAKMUR ABADI JAYA'),
         ('PT. MARABUNTA'),
         ('SALIM GUNADI PUTRA'),
         ('VIVI TYRE'),
         ('WIDYASTUTI MALIK'),
         ('YAYAN MARYANTO'),
         ('YULIANA SUSANTO')
), perlu AS (
  SELECT b.nama, row_number() OVER (ORDER BY b.nama) AS k
  FROM baru b
  WHERE NOT EXISTS (SELECT 1 FROM pelanggan c WHERE upper(trim(c.nama)) = upper(trim(b.nama)))
), mulai AS (
  SELECT COALESCE(max(NULLIF(substring(id   FROM '^C([0-9]+)$'), '')::int), 0)    AS m,
         COALESCE(max(NULLIF(substring(kode FROM '^PLG-([0-9]+)$'), '')::int), 0) AS n
  FROM pelanggan
)
INSERT INTO pelanggan (id, kode, nama, grade, limit_kredit, termin)
SELECT 'C'    || lpad((mulai.m + p.k)::text, greatest(4, length((mulai.m + p.k)::text)), '0'),
       'PLG-' || lpad((mulai.n + p.k)::text, greatest(3, length((mulai.n + p.k)::text)), '0'),
       p.nama, 'B', 0, 30
FROM perlu p CROSS JOIN mulai;

-- ── 품목 1종 ─────────────────────────────────────────────────────
-- VG182516AJ101 / VULGIS 8.25-16 AJ101 (재생 서비스). 2025-05-28 SO-2505-026,
-- TOKO BAN HARIANJA 6 EA @ 600,000 에만 나옵니다. 엑셀 요약시트 품목 목록에는
-- 있으나 2026년 마스터(produk_master.csv)에는 없습니다.
-- harga 는 실제 거래가 600,000, hpp(원가)는 모르므로 0 입니다.
INSERT INTO produk (id, kode, nama, ukuran, pola, kategori, satuan, merek, hpp, harga, min_stok)
SELECT 'VG182516AJ101', 'VG182516AJ101', 'VULGIS 8.25-16 AJ101',
       '8.25-16', 'AJ101', 'jasa', 'pcs', 'VULGIS', 0, 600000, 0
WHERE NOT EXISTS (SELECT 1 FROM produk WHERE id = 'VG182516AJ101');

-- 확인: 두 줄 모두 0 이어야 30_insert.sql 이 통과합니다
SELECT 'buyer 미매칭' AS cek, count(*) AS n FROM (
  SELECT DISTINCT s.buyer FROM stg_spb_2025 s
  LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
  WHERE c.id IS NULL) x
UNION ALL
SELECT 'produk 미매칭', count(*) FROM (
  SELECT DISTINCT s.item_no FROM stg_spb_2025 s
  LEFT JOIN produk pr ON pr.id = s.item_no
  WHERE pr.id IS NULL) y;

-- 새로 생긴 거래처 (참고)
SELECT id, kode, nama FROM pelanggan
WHERE upper(trim(nama)) IN (
  'AGUNG TRANSPORT','BAPAK RAYMOND','BAPAK ROBI','CV. ASTRA RAHARJA','CV. HUTAMA MILENIAL',
  'DWI EKA SUTRESNA','FADILAH WIDIARSANTI','GIARSO','INDRA IRAWAN (PAK NDUT)','LAS TRANSPORT',
  'PAK BAYU','POLING LINDAJATI, ST','PT. HANA AHN TECHNOLOGY','PT. KURNIA MAKMUR ABADI JAYA',
  'PT. MARABUNTA','SALIM GUNADI PUTRA','VIVI TYRE','WIDYASTUTI MALIK','YAYAN MARYANTO','YULIANA SUSANTO')
ORDER BY kode;

COMMIT;
