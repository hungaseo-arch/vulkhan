# 2026-10-21 전체 점검 — 판매 전표번호 UNIQUE

작업지시서 VK-WEB-2026-1021-01 의 2-6 3항입니다. 삭제 이력에 서로 다른 고객의 `SO-2609-001` 이 2건
있었습니다. 앱은 이제 번호를 서버에서 매기지만(`POST /api/penjualan`, advisory lock), 마지막 방어선으로
DB 제약도 겁니다.

운영 DB 라서 Neon 콘솔 SQL Editor 에서 사용자가 직접 실행합니다.

1. `10_dry_run.sql` — 읽기 전용. 2번 결과가 0행인지 확인
2. `20_unique_no.sql` — 0행일 때만. 마지막 SELECT 에 `penjualan_no_key` 1행이 나오면 완료

`log_status` 테이블(상태 변경·삭제 사유)과 `pengguna.must_change`, `login_gagal` 은 다른 테이블과 같이
서버 시작 시 `ensure*` 함수가 만들기 때문에 여기에는 없습니다.
