# 2026-08-13 — SPB v2 적재 분석 아카이브 (v4, 미해결 항목 종결)

Claude Desktop에서 작성한 "SPB Daily Sales Report 2026 → Neon 적재 분석" 최종본(v4)과
그 작업 과정에서 나온 산출물을 ~/Downloads에서 이 저장소로 옮겨 보관.

## 이 폴더의 파일에 대한 중요한 주의사항 ★

`11_upsert_master.sql` / `12_upsert_penjualan.sql` / `13_stok_mutasi_v2.sql`
세 파일은 **Claude Desktop에서 스키마 확정 전에 작성한 초안**이며, 실제
production 적재에 쓰인 최종 스크립트가 아닙니다 (실제 적재·수정은 이후
별도 VSCode/Claude Code 세션에서 진행됨). 그대로 실행하면 안 됩니다:

- 창고를 `'UTM'` 하나로 하드코딩 — 실제로는 3창고(SBY/SMG/KRW) 구조
  ([2026-08-12-gudang-restructure](../2026-08-12-gudang-restructure/README.md),
  [2026-08-12-destinasi-gudang-fix](../2026-08-12-destinasi-gudang-fix/README.md)에서 이미 정리됨)
- `penjualan(sales, total, mata_uang, keterangan)`,
  `penjualan_item(subtotal)` 등 실제로 존재하지 않는 컬럼을 가정
- `penjualan_item.id` / `stok_mutasi.id`를 텍스트로 직접 채번 — 실제로는
  둘 다 bigint 자동증가
- `stok_mutasi`에 `jenis`/`keterangan` 컬럼을 가정 — 실제 컬럼명은
  `tipe`(masuk/keluar/transfer/penyesuaian 4종 CHECK)/`catatan`

**이 세 파일은 실행하지 말고 과거 초안 기록으로만 보관**합니다. `00_cek_skema.sql`은
읽기 전용 스키마 확인 쿼리라 안전하며, `spb_sales_2026_v2.csv` /
`produk_master.csv` / `stok_snapshot_20260723.csv`는 원본 데이터라 그대로
유효합니다.

## 실제 production 적재 경로 (이미 완료됨)

아래 커밋된 마이그레이션들이 실질적으로 이 분석에서 다루는 데이터를
이미 적재·보정했음:

1. [2026-08-12-may-backfill](../2026-08-12-may-backfill/) — SPB v2 394라인/290전표
   전량 적재 (당시 창고는 `UTM` 단일값).
2. [2026-08-12-gudang-restructure](../2026-08-12-gudang-restructure/) — `UTM` →
   `KRW`/`SMG`/`SBY` 3창고 구조로 재편.
3. [2026-08-12-destinasi-gudang-fix](../2026-08-12-destinasi-gudang-fix/) —
   SPB `Destination`(SURABAYA/SEMARANG/JAKARTA) 기준으로 227건(penjualan)/
   298건(stok_mutasi)의 창고를 실제값으로 재지정.

즉 본 분석 문서(§7) 1~5번 항목은 위 3개 마이그레이션으로 이미 실질
완료된 상태와 일치함. `stok_gudang` 캐시/트리거 생성분(§7 3번)만 이
저장소에 별도 마이그레이션 기록이 없어 확인 필요.

## 원본 분석 요약

- **원천**: SPB Daily Sales Report Jan–Jul 2026 v2 (394라인/290전표,
  2026-01~07, IDR 3,001,976,000 / 2,228 EA) — `All Sum 2026` 요약시트와
  7개월 전부 일치.
- **stok_20260723.xlsx 재고 스냅샷**: 실사 결과 아님 — 31품목 전부
  `재고 = −(구버전 판매 누적)`으로 정확히 일치, "입고 0 + 판매만 차감"된
  계산값(그것도 5월 보완 이전 버전). 품목 마스터 + 가격 출처로만 유효.
- **창고 매핑**: JAKARTA→KRW는 확정이 아닌 추정 — Karawang이 Jakarta권
  납품을 겸한다는 정황 근거. 표본 대사 권장(미실행).

## 남은 미해결 항목 (1건)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 구매(pembelian) 원장 적재 | ⏳ 미해결 — `pembelian` 테이블은 존재하나 0건. 원장 확보 시 `13_stok_mutasi_v2.sql` §4의 `IN` 이동 템플릿(실제 스키마에 맞게 재작성 필요)을 사용해 입고 이동 생성 |
| 2 | 판매 데이터 최신화 (07-30 → 08-13, 약 2주 공백) | ✅ 해결 — [2026-09-15-spb-agustus](../2026-09-15-spb-agustus/README.md) 에서 8월 전량(83라인/58전표) 적재 |

1번은 여전히 **외부 원본 데이터 확보가 선행되어야** 진행 가능. 소스가
정해지면 실제 확정 스키마 기준으로 적재 스크립트를 새로 작성.
