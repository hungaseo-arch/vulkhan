-- 지점 코드 표기 통일: 스마랑은 SMR 입니다. gudang 행에는 아직 'SMG' 가
-- 남아 있어 SQL 로 직접 들여다볼 때만 어긋나 보입니다(화면은 이미 SMR).
--
-- id 는 바꾸지 않습니다. penjualan.gudang / pembelian.gudang /
-- stok_mutasi.gudang 이 전부 id 를 가리키고 있어, id 를 바꾸려면 세 테이블을
-- 함께 옮겨야 합니다. 코드 표기 하나 맞추자고 치를 값이 아닙니다.
BEGIN;

UPDATE gudang SET kode = 'SMR' WHERE id = 'SMG' AND kode = 'SMG';

-- 확인: KRW / SBY / SMR 세 줄이 나와야 합니다 (SMR 의 id 는 SMG 그대로).
SELECT id, kode, nama, kota FROM gudang ORDER BY kode;

COMMIT;
