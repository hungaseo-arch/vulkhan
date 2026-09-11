# 2026-09-11 — 고객별 여신한도 기안/확정 (`limit_usulan`)

## 배경

`pelanggan.limit_kredit`는 지금까지 고객 수정 화면에서 누구나 바로 고칠 수 있었음.
여신한도는 결재가 필요한 값이라 **담당자 기안 → 관리자 확정** 2단계로 바꿈.
한도 자체(`pelanggan.limit_kredit`)는 승인된 순간에만 변경됨.

## 실행 내용 (`10_limit_usulan.sql`)

1. `limit_usulan` 테이블 생성. 기안 시점의 한도(`limit_lama`)와 기안액(`limit_baru`),
   사유, 기안자/확정자, 확정 시각과 비고를 보관.
2. `status = 'menunggu'` 부분 유니크 인덱스 — 한 고객에 대기 중인 기안은 하나만.
3. 결제조건(TOP) 열 `termin_lama` / `termin_baru`. 한도와 결제조건을 한 기안에 함께
   올립니다. **NULL 허용**: TOP이 기안 항목에 들어가기 전에 만들어진 행은 NULL이며,
   이는 "이 기안은 TOP과 무관"이라는 뜻이지 0일이 아닙니다. 그래서 승인 시
   `termin = COALESCE(u.termin_baru, p.termin)`으로 반영해, 옛 기안을 승인해도
   고객의 현재 결제조건이 지워지지 않습니다. 둘 중 **하나만** 달라도 기안은 성립하고,
   한도·결제조건이 모두 현재와 같으면 400으로 막습니다.

`pengusul` / `penentu`는 `pengguna`를 참조하는 FK가 **아님**. 계정을 삭제해도 기안
이력이 남아야 하고, `*_nama` 스냅샷 덕분에 계정이 사라진 뒤에도 누가 올렸는지 읽힘.

## 적용 방법

`api-server.js`의 `ensureUsulan()`이 서버 기동 시 같은 DDL을 실행하므로, 배포만
해도 테이블은 생성됨. 이 파일은 기록용이며 수동 적용도 가능:

```
psql "$DATABASE_URL" -f migrations/2026-09-11-limit-usulan/10_limit_usulan.sql
```

## 관련 엔드포인트

- `GET  /api/limit-usulan` — 목록 (대기 건 우선, 최대 200건)
- `POST /api/limit-usulan` — 기안 (staff 이상). 대기 건 중복이면 409
- `POST /api/limit-usulan/:id/putusan` — 확정 (admin). 승인 시 한 트랜잭션 안에서
  `pelanggan.limit_kredit`과 `pelanggan.termin`까지 갱신

고객 프로필 열 추가는 [migrations/2026-09-11-pelanggan-profil/](../2026-09-11-pelanggan-profil/) 참고.
