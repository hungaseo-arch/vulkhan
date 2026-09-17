# 2026-09-17 — 지점 코드 표기 통일 (SMG → SMR)

지점 이름과 코드를 한 벌로 정했습니다.

| 코드 | 인니어 | 한국어 |
|---|---|---|
| SBY | Surabaya | 수라바야 |
| JKT | Jakarta | 자카르타 |
| KRW | Karawang | 까라왕 |
| SMR | Semarang | 스마랑 |

화면 표시는 앱이 직접 맞춥니다([src/App.jsx](../../src/App.jsx) 의 `CABANG`) —
`SMG`·`SEMARANG`·`Semarang` 같은 옛 표기를 전부 같은 지점으로 알아보고
`SMR · 스마랑 지점`으로 보여줍니다. 그래서 **이 SQL 은 실행하지 않아도
화면은 이미 맞습니다.** DB 를 직접 조회할 때의 표기만 정리하는 것입니다.

창고 행의 `id` 는 `SMG` 그대로 둡니다. `penjualan`·`pembelian`·`stok_mutasi`
세 테이블이 그 id 를 참조하고 있어서, 표기 하나 때문에 옮길 이유가 없습니다.

## 자카르타(JKT)

창고 마스터에는 자카르타 지점이 **없습니다**. 과거 자료에서 JAKARTA 로
나가던 건은 까라왕(KRW) 창고로 매핑돼 있습니다
([2026-08-12-destinasi-gudang-fix](../2026-08-12-destinasi-gudang-fix/README.md)).
JKT 는 지금은 고객 소재지 표기로만 쓰이고, 화면에서 '자카르타'로 보입니다.
자카르타를 실제 출고 지점으로 세우시려면 창고 행 추가가 따로 필요합니다 —
말씀해 주시면 만들어 드리겠습니다.

## 실행

Neon SQL Editor 에서 `10_kode.sql` 한 번. 되돌리려면 `SMR` 을 `SMG` 로
되돌리는 같은 문장이면 됩니다.
