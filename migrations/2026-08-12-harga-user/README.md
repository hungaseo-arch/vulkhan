# 2026-08-12 — Harga User 컬럼 추가 및 가격 반영

**출처**: `stok_2026-07-23.xlsx` (`Lia` 시트) — 기존 `Stok` 시트에는 7개 품목의
Harga User가 비어 있었는데, `Lia` 시트에서 해당 값이 채워지고 나머지 24개 품목은
동일하게 유지된 최종본. 31개 품목 전체가 production `produk.kode`와 정확히 일치.

## 배경

프론트엔드(`src/App.jsx`)는 이미 `p.hargaUser` 필드를 참조해 "Harga User" 열을
표시하고 있었지만, production `produk` 테이블에는 해당 컬럼이 없어 항상 "—"로
표시되고 있었음.

## 실행 내용 (`10_add_harga_user.sql`)

1. `produk`에 `"hargaUser" numeric(14,2)` 컬럼 추가 (nullable, additive).
   프론트엔드가 카멜케이스 `hargaUser` 키를 그대로 기대하므로 큰따옴표로 대소문자
   보존.
2. `harga_user.csv`(kode, harga_user)를 스테이징 후 `kode` 기준으로 31개 품목
   전부 업데이트. 다른 컬럼/행은 변경 없음.

## 결과

`produk` 31행 전부 `"hargaUser"` 값 채움. 예: `G1100020AJ101` → 1,914,750.
