-- 판매 전표번호(penjualan.no) 중복 방지. 10_dry_run.sql 2번이 0행일 때만 실행하십시오.
-- 스키마 제약 추가만 합니다(데이터 변경 없음). 중복이 남아 있으면 이 문장이
-- 오류로 끝나고 아무것도 바뀌지 않습니다.
--
-- 인덱스 이름을 penjualan_no_key 로 맞춘 것은 2026-08-13 적재 스크립트의
-- ON CONFLICT (no) 가 가정한 이름과 같게 하려는 것입니다.
CREATE UNIQUE INDEX IF NOT EXISTS penjualan_no_key ON penjualan (no);

-- 확인: 1행(penjualan_no_key)이 나와야 합니다.
SELECT indexname FROM pg_indexes WHERE tablename = 'penjualan' AND indexname = 'penjualan_no_key';
