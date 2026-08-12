# 2026-08-12 — 5월 판매 결측분 백필

**출처**: "SPB Daily Sales Report Jan–Juli 2026" 스프레드시트 v2 (394라인/290전표,
2026-01~07). production에는 이미 v1(273전표/370라인, 5월 데이터 누락)이 적재돼 있었음.

## 실행 순서

1. `00_cek_skema.sql` — 실제 Neon 스키마/제약조건 확인 (읽기 전용).
   원본 마이그레이션 초안(11~13번 스크립트)이 가정한 컬럼/ID 생성 방식과
   실제 스키마가 여러 군데 달라 초안은 사용하지 않고 아래 스크립트를 새로 작성함.
   - `penjualan_item`, `stok_mutasi`의 `id`는 자동증가(bigint) — 커스텀 텍스트 id 아님
   - `penjualan`에는 `sales`/`total`/`mata_uang`/`keterangan` 컬럼 없음
   - `stok_mutasi`는 `jenis`가 아니라 `tipe`('keluar'), `keterangan`이 아니라 `catatan`
   - `gudang`/`pelanggan`/`produk`는 `kode` 컬럼이 `id`와 별도로 NOT NULL UNIQUE
2. `10_staging.sql` — `spb_sales_2026_v2.csv`를 스테이징 테이블에 적재.
   합계 검증: 394라인 / 290전표 / 2,228EA / IDR 3,001,976,000 (소스와 일치).
3. production `penjualan.no`와 diff → **누락 17건, 전부 2026-05, 24라인**,
   그 외 증분·변경·삭제 0건 확인.
4. `20_insert_missing_may.sql` — 누락된 17건만 순수 추가(트랜잭션, 먼저 ROLLBACK으로
   드라이런 후 COMMIT). 거래처 52곳/품목 31개 전부 기존 마스터에 이미 존재해
   마스터 upsert는 불필요했음.

## 결과

| 테이블 | 이전 | 이후 |
|---|---|---|
| `penjualan` | 273 | 290 |
| `penjualan_item` | 370 | 394 |
| `stok_mutasi` | 370 | 394 |
| `produk` / `pelanggan` | 31 / 52 | 변경 없음 |

최종 검증: `penjualan_item` 합계 qty=2228, amt=3,001,976,000 — 소스와 완전 일치.
기존 273건은 건드리지 않음 (순수 추가만 수행).
