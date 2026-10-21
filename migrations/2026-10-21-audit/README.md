# 2026-10-21 전체 점검 — 판매 전표번호 UNIQUE

작업지시서 VK-WEB-2026-1021-01 의 2-6 3항입니다. 삭제 이력에 서로 다른 고객의 `SO-2609-001` 이 2건
있었습니다. 앱은 이제 번호를 서버에서 매기지만(`POST /api/penjualan`, advisory lock), 마지막 방어선으로
DB 제약도 겁니다.

운영 DB 라서 Neon 콘솔 SQL Editor 에서 사용자가 직접 실행합니다.

1. `10_dry_run.sql` — 읽기 전용. 2번 결과가 0행인지 확인
2. `20_unique_no.sql` — 0행일 때만. 마지막 SELECT 에 `penjualan_no_key` 1행이 나오면 완료

`log_status` 테이블(상태 변경·삭제 사유)과 `pengguna.must_change`, `login_gagal` 은 다른 테이블과 같이
서버 시작 시 `ensure*` 함수가 만들기 때문에 여기에는 없습니다.

## 6절 데이터 정비 (D1·D5)

사용자 결정(2026-10-21): 같은 회사 이중 등록은 문제, 지점별 관리는 "회사명 - 지점", 출고일 = 전표일 원칙.

3. `30_d1_dry_run.sql` — 읽기 전용. 4쌍의 지점·담당·거래 건수와, 그 밖의 같은 이름 고객 목록
4. `40_d1_rename_branch.sql` — 지점별 쌍(KARTIKA SEMESTA LOGISTIK, BUNGA DARU) 이름 변경. 트랜잭션 안에서 확인 후 COMMIT
5. `50_d1_merge.sql` — 진짜 중복(AFIF MA'ARUF, TRI DOMINITAMA/DOMINIC 등) 거래 이동. 쌍마다 코드 2개를 바꿔 실행한 뒤 앱에서 삭제 승인
6. `60_d5_tgl_kirim.sql` — 선택. 출고일 없는 옛 전표에 전표일 채우기
