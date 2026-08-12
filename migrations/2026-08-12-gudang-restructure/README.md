# 2026-08-12 — 창고 구조 정리 (UTM → Karawang)

Production에는 창고가 `UTM`("Gudang Utama") 하나뿐이었는데, 실제로는 잘못
등록된 이름이고 실제 위치는 Karawang이었음. Semarang/Surabaya도 실제 운영 중인
창고로 확인되어 함께 등록.

## 실행 내용 (`10_gudang_restructure.sql`)

1. `gudang`에 `KRW`(Gudang Karawang)/`SMG`(Gudang Semarang)/`SBY`(Gudang
   Surabaya) 추가.
2. 기존 `UTM`을 참조하던 `penjualan`(290건) / `pembelian`(0건) /
   `stok_mutasi`(394건)를 전부 `KRW`로 재지정 — 데이터 손실 없는 순수 이름
   변경.
3. 더 이상 참조되지 않는 `UTM` 행 삭제.

## 결과

| 테이블 | UTM 참조 (이전) | UTM 참조 (이후) | KRW 참조 (이후) |
|---|---|---|---|
| `penjualan` | 290 | 0 | 290 |
| `stok_mutasi` | 394 | 0 | 394 |

`gudang` 최종 상태: `KRW` / `SBY` / `SMG` (UTM 없음).
