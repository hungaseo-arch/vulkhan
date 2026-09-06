# 2026-08-12 — Destination 기준 창고(gudang) 보정

`2026-08-12-gudang-restructure`에서 `UTM`을 `KRW`로 일괄 rename하면서,
실제로는 Surabaya/Semarang으로 나갔어야 할 SO들도 전부 `KRW`로 남아있게
됨. `spb_slim.csv`의 `Destination` 컬럼(SURABAYA/JAKARTA/SEMARANG)을
기준으로 SO 단위로 실제 창고를 다시 매핑.

## 매핑

| Destination | gudang |
|---|---|
| SURABAYA | SBY |
| SEMARANG | SMG |
| JAKARTA  | KRW |

JAKARTA→KRW인 이유: `gudang-restructure`에서 확인된 대로 예전 `UTM`의
실제 위치가 Karawang(자카르타 인근)이었음. **이 매핑은 가정이며, 실행
전에 반드시 확인 필요.**

## 데이터 처리

- 소스: `spb_slim.csv` (Jan~Jul 2026, 394줄 / 288개 SO 문서).
- `so_no`는 `SO-YYMM-NNN` 형식으로 재구성 (PO Date의 연/월 + SO 컬럼),
  `2026-08-12-may-backfill`에서 쓴 것과 동일한 규칙.
- SO 문서 288개 전부 Destination이 문서 내에서 100% 일관됨 (라인별로
  다른 Destination을 갖는 SO 없음) — 확인 완료.
- 288개 전부 SURABAYA/SEMARANG/JAKARTA 중 하나로, 매핑 누락 없음.
- `destinasi_gudang.csv` = `so_no,destination,gudang` 288행.

## 실행 방법

이 세션(Claude Code 샌드박스)에서는 `DATABASE_URL`이 Vercel의
**Sensitive 환경변수**로 등록되어 있어 `vercel env pull`로도 평문 값을
가져올 수 없음 — 즉 여기서 직접 DB에 붙어 실행할 수 없었음. 아래 순서로
직접 실행 필요:

```bash
cd migrations/2026-08-12-destinasi-gudang-fix
psql "$DATABASE_URL" -f 00_staging.sql   # 스테이징 테이블 적재
psql "$DATABASE_URL" -f 10_dry_run.sql   # 읽기 전용 — 변경 전 반드시 결과 확인
psql "$DATABASE_URL" -f 20_update.sql    # 실제 UPDATE (BEGIN/COMMIT)
```

`10_dry_run.sql`의 3번(스테이징에는 있지만 production에 없는 so_no)과
4번(production에는 있지만 스테이징에 없는 so_no) 결과가 비어있는지 꼭
확인. 비어있지 않으면 이 파일 범위 밖의 문서가 있다는 뜻이므로 먼저
확인 후 진행.

## 결과

2026-08-12 실행 완료. `penjualan` 227건, `stok_mutasi` 298건이 실제
Destination에 맞게 재지정됨 (나머지는 원래도 KRW가 맞았던 문서).

| 테이블 | 변경된 행 | 이전 (전부 KRW) | SBY (이후) | SMG (이후) | KRW (이후) |
|---|---|---|---|---|---|
| `penjualan` | 227 | 290 | 117 | 110 | 63 |
| `stok_mutasi` | 298 | 394 | 156 | 142 | 96 |

합계 검증: `penjualan` 117+110+63=290 (일치), `stok_mutasi`
156+142+96=394 (일치) — 데이터 손실이나 중복 없이 재지정만 이루어짐.
