-- D1 진짜 중복 합치기: 없앨 고객(:hapus)의 거래를 남길 고객(:simpan)으로 옮깁니다.
-- 아래 두 값을 쌍마다 바꿔서 한 번씩 실행합니다. 예) AFIF MA'ARUF: 남김 PLG-114, 없앰 PLG-393
-- 이 SQL 은 고객을 지우지 않습니다. 옮긴 뒤 앱에서 없앨 고객의 삭제 요청을 승인하세요
-- (거래가 남아 있으면 앱이 삭제를 막으므로, 옮기기가 끝났는지 확인하는 역할도 합니다).
BEGIN;
WITH k AS (
  SELECT (SELECT id FROM pelanggan WHERE kode = 'PLG-114') AS simpan,   -- ← 남길 고객
         (SELECT id FROM pelanggan WHERE kode = 'PLG-393') AS hapus)    -- ← 없앨 고객
, a AS (UPDATE penjualan SET pelanggan = k.simpan FROM k
        WHERE penjualan.pelanggan = k.hapus AND k.simpan IS NOT NULL RETURNING 1)
, b AS (UPDATE penjualan SET pelanggan_akhir = k.simpan FROM k
        WHERE penjualan.pelanggan_akhir = k.hapus AND k.simpan IS NOT NULL RETURNING 1)
, c AS (UPDATE pelanggan SET via = k.simpan FROM k
        WHERE pelanggan.via = k.hapus AND k.simpan IS NOT NULL RETURNING 1)
SELECT (SELECT count(*) FROM a) AS so_이동, (SELECT count(*) FROM b) AS 최종고객_이동,
       (SELECT count(*) FROM c) AS 청구경로_이동;
-- 숫자가 30_d1_dry_run.sql 1번의 건수와 같으면 COMMIT; , 아니면 ROLLBACK;
