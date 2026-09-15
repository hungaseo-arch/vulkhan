-- 8월 원장에만 등장하는 신규 마스터를 먼저 만듭니다. 이 단계 없이 30_insert.sql 을
-- 돌리면 매칭 안 되는 거래처/품목의 라인이 조용히 누락됩니다.
-- 10_dry_run.sql 의 2·3·7·8번 출력을 확인한 뒤 실행하십시오.
BEGIN;

-- ── 기존 거래처 이름 정정 ────────────────────────────────────────
-- 8월 원본에 'PT. TRIDOMINITAMA'(SO-2608-035)와 'PT. TRI DOMINITAMA'
-- (SO-2608-052)가 함께 나오는데 같은 회사임을 확인했습니다. 올바른 표기는
-- 띄어쓴 쪽이라 마스터를 정정하고, CSV 도 두 줄 모두 이 표기로 맞췄습니다.
-- id 는 그대로라 기존 전표·수금 연결은 영향받지 않습니다.
UPDATE pelanggan SET nama = 'PT. TRI DOMINITAMA'
WHERE upper(replace(trim(nama),' ','')) = 'PT.TRIDOMINITAMA';

-- ── 거래처 4곳 (8월에 처음 등장) ──────────────────────────────────
-- kode 는 기존 최대값 다음 번호로, id 는 기존 행과 같은 모양으로 채번합니다.
-- 여신한도는 0(미설정)으로 둡니다 — 나머지 52곳과 동일하며, 한도가 필요하면
-- 화면의 여신한도 기안·승인으로 넣으십시오.
WITH baru(nama) AS (
  VALUES ('GLX KARGO LOGISTIK'),
         ('PT. BERKAT ACI MULIA'),
         ('PT. HARMONI AWOT NUSANTARA'),
         ('PT. PERKASA JAYA TRANSPORT')
), mulai AS (
  SELECT COALESCE(max(NULLIF(regexp_replace(kode,'\D','','g'),''))::int, 0) AS n,
         COALESCE(max(NULLIF(regexp_replace(id  ,'\D','','g'),''))::int, 0) AS m
  FROM pelanggan
)
INSERT INTO pelanggan (id, kode, nama, grade, limit_kredit, termin)
SELECT 'C' || lpad((mulai.m + row_number() OVER (ORDER BY b.nama))::text, 4, '0'),
       'PLG-' || lpad((mulai.n + row_number() OVER (ORDER BY b.nama))::text, 3, '0'),
       b.nama, 'B', 0, 30
FROM baru b CROSS JOIN mulai
WHERE NOT EXISTS (
  SELECT 1 FROM pelanggan c WHERE upper(trim(c.nama)) = upper(trim(b.nama))
);

-- ── 신규 품목 1종 ────────────────────────────────────────────────
-- G175015AJ101 / GIS 7.50-15 AJ101 — MASTER DATA 시트에도 없는 새 사이즈입니다.
-- 판매단가 850,000 은 실제 거래가이므로 harga 에 넣고, hpp(원가)는 모르므로 0.
-- 원가를 아시면 아래 0 을 바꿔서 실행하십시오.
INSERT INTO produk (id, kode, nama, ukuran, pola, kategori, satuan, merek, hpp, harga, min_stok)
SELECT 'G175015AJ101', 'G175015AJ101', 'GIS 7.50-15 AJ101',
       '7.50-15', 'AJ101', 'jadi', 'pcs', 'GIS', 0, 850000, 0
WHERE NOT EXISTS (SELECT 1 FROM produk WHERE id = 'G175015AJ101');

-- 확인: 여기서 0 이 나와야 30_insert.sql 이 한 줄도 누락하지 않습니다
SELECT 'buyer 미매칭' AS cek, count(*) AS n FROM (
  SELECT DISTINCT s.buyer FROM stg_spb_2608 s
  LEFT JOIN pelanggan c ON upper(trim(c.nama)) = upper(trim(s.buyer))
  WHERE c.id IS NULL) x
UNION ALL
SELECT 'produk 미매칭', count(*) FROM (
  SELECT DISTINCT s.item_no FROM stg_spb_2608 s
  LEFT JOIN produk pr ON pr.id = s.item_no
  WHERE pr.id IS NULL) y;

COMMIT;
