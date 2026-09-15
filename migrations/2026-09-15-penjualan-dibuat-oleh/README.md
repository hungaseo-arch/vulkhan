# 2026-09-15 — 당월 전표 담당자 수정/삭제

"당월 데이터 담당자 수정기능 부여. 전월 데이터 삭제·수정은 현재와 같이
승인 후 진행하나 당월 데이터는 수정 가능토록." 에 대한 작업입니다.

## 규칙

| 대상 | 수정 | 삭제 |
|---|---|---|
| 관리자 | 전부 가능 | 전부 가능 |
| 작성자 본인, **당월** 전표 | 가능 | **승인 없이** 가능 |
| 작성자 본인, 전월 이전 전표 | 불가 | 삭제 기안 → 관리자 승인 |
| 남의 전표 / 작성자 없는 과거 임포트분 | 불가 | 삭제 기안 → 관리자 승인 |

"당월" 은 **Postgres 의 `CURRENT_DATE`** 기준입니다. 서버와 브라우저가
각자 판단하면 말일·1일에 버튼은 보이는데 서버는 거절하는 상황이 생기므로
시계는 하나만 믿습니다. 화면의 버튼 노출은 같은 규칙의 복사본일 뿐이고,
실제로 막는 쪽은 서버(`tolakUbahSO`)입니다.

## 두 가지는 일부러 이렇게 두었습니다 (2026-09-15 확인)

**1. 당월이라도 "작성자 본인" 것만입니다.**

직원 계정이 둘 이상이라도 서로의 전표는 못 고칩니다. 누가 만든 건지에
책임이 붙어 있게 하려는 것입니다. 담당자가 자리를 비운 사이 급하면
관리자가 처리합니다.

**2. 전월 전표에는 "수정 기안" 이 없습니다 — 삭제 기안뿐입니다.**

전월 건을 고치려면 `삭제 기안 → 관리자 승인 → 다시 입력` 입니다.
결과적으로 승인을 거치므로 요건은 충족하지만, 전표번호가 바뀝니다.

수정 내용을 담아 기안하고 승인 시 그대로 반영되는 흐름(전표번호 유지)도
가능합니다 — `hapus_usulan` 과 같은 구조로 API 1개와 화면 2개가 필요합니다.
지금은 만들지 않기로 했습니다.

## 스키마 변경

`penjualan.dibuat_oleh TEXT REFERENCES pengguna(id) ON DELETE SET NULL` — NULL 허용.

`ON DELETE SET NULL` 인 이유: 전표를 만든 적 있다는 이유로 사용자 삭제가
실패해서는 안 됩니다. 사용자를 지우면 전표는 남고 작성자만 비며, 권한은
관리자에게로 돌아갑니다 — 임포트분과 같은 상태가 됩니다.

**수동 실행 불필요**합니다. `api-server.js` 의 `ensurePenjualan()` 이
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` 로 배포 시 알아서 붙입니다
(`ensurePelanggan()` 과 같은 방식). 아래 SQL 은 기록용이며, 콘솔에서
직접 확인하고 싶을 때만 쓰십시오.

```sql
ALTER TABLE penjualan ADD COLUMN IF NOT EXISTS dibuat_oleh TEXT
  REFERENCES pengguna(id) ON DELETE SET NULL;

-- v_penjualan 은 컬럼을 하나씩 나열하므로 ALTER 만으로는 /bootstrap 에
-- 나오지 않습니다. CREATE OR REPLACE VIEW 는 맨 뒤에 컬럼을 '추가' 하는
-- 것만 허용하므로 dibuat_oleh 는 total 뒤에 옵니다.
CREATE OR REPLACE VIEW v_penjualan AS
  SELECT p.id, p.no, p.tgl, p.pelanggan, p.gudang, p.status,
         COALESCE(SUM(i.qty * i.harga),0) AS total,
         p.dibuat_oleh
  FROM penjualan p
  LEFT JOIN penjualan_item i ON i.penjualan = p.id
  GROUP BY p.id;
```

## 기존 348전표는 관리자만

임포트로 들어간 전표에는 작성자가 없습니다(`dibuat_oleh IS NULL`).
따라서 담당자는 손댈 수 없고 관리자만 가능합니다 — 의도한 동작입니다.
앞으로 화면에서 새로 만드는 전표부터 작성자가 기록됩니다.

특정 사용자를 과거 전표의 작성자로 지정하고 싶다면(권장하지 않습니다 —
실제로 그 사람이 만든 게 아니므로) 다음과 같이 할 수 있습니다:

```sql
-- 예시일 뿐입니다. 필요할 때만.
UPDATE penjualan SET dibuat_oleh = 'U3'
WHERE dibuat_oleh IS NULL AND date_trunc('month', tgl) = date_trunc('month', CURRENT_DATE);
```

## 재고 원장

전표를 수정하면 `stok_mutasi` 도 다시 씁니다. 상태 변경이 없으면
`t_penjualan_kirim` 트리거는 울리지 않으므로, 수정된 수량과 맞지 않는
옛 이동 기록이 그대로 남기 때문입니다.

단, **그 전표에 이동 기록이 이미 있을 때만** 다시 씁니다. 원장을 일부러
비운 경우([2026-09-15-reset-stok-pembelian](../2026-09-15-reset-stok-pembelian/README.md))
수정 한 번에 지운 기록이 한 줄씩 되살아나면 안 되기 때문입니다.

수정 시 재고 검사는 **하지 않습니다**. 출고 전환(`kirim`) 때의 검사와 다른
점인데, 수정에서는 이 전표가 이미 잡아 둔 수량을 먼저 되돌려 놓고 비교해야
정확하고, 원장을 관리하지 않는 상태에서는 당월 정정이 필요한 순간마다
전부 거절되기 때문입니다.
