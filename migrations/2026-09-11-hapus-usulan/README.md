# 2026-09-11 — 삭제 결재 (`hapus_usulan`)

## 배경

판매·구매 전표를 지우면 그 전표가 만든 `stok_mutasi`도 함께 사라짐. 즉 삭제 버튼
한 번이 창고 잔고를 움직이는데, 지금까지는 **manager 이상이면 즉시 실행**됐고
되돌릴 방법도 기록도 없었음. 여신한도와 같은 2단계 결재로 바꿈:

- **직접 삭제는 admin만.** `DELETE /api/{penjualan,pembelian,pelanggan}/:id`의
  요구 권한을 `manager` → `admin`으로 올림.
- **나머지 역할은 삭제를 "요청"함.** 로그인한 누구나 기안할 수 있고,
  승인하는 순간 삭제가 실행됨.

## 실행 내용 (`10_hapus_usulan.sql`)

1. `hapus_usulan` 테이블 생성. `jenis`는 `penjualan` / `pembelian` / `pelanggan` 셋 중 하나.
2. `(jenis, sasaran)` 부분 유니크 인덱스 — 한 건에 대기 중인 요청은 하나만.

### 대상 행을 FK로 참조하지 않는 이유

승인 = 그 행의 삭제입니다. `ON DELETE CASCADE`면 **결재 기록 자체가 같이 지워지고**,
일반 FK면 삭제가 실패합니다. 그래서 전표번호(`sasaran_no`), 설명(`sasaran_ket`),
금액(`nilai`)을 **기안 시점에 복사**해 둡니다 — 원본이 사라진 뒤 "무엇을 지웠는가"에
답할 수 있는 건 이 사본뿐입니다. 이 값들은 **서버가 직접 읽어서** 채웁니다.
삭제를 요청한 쪽이 보낸 설명을 그대로 믿을 수는 없기 때문입니다.

`pengusul` / `penentu`가 `pengguna` FK가 아닌 이유는 `limit_usulan`과 같습니다.

## 승인 트랜잭션의 문장 순서

`limit_usulan`과 **반대로**, 삭제를 **먼저** 실행하고 `status='disetujui'` 표시를
**대상 행이 실제로 사라졌는지**에 걸었습니다.

```sql
DELETE FROM stok_mutasi   WHERE ref = $sasaran_no;
DELETE FROM penjualan_item WHERE penjualan = $sasaran;
DELETE FROM penjualan      WHERE id = $sasaran;
UPDATE hapus_usulan SET status='disetujui', … 
 WHERE id = $id AND status = 'menunggu'
   AND NOT EXISTS (SELECT 1 FROM penjualan WHERE id = $sasaran)
RETURNING *;
```

삭제가 막히면 마지막 UPDATE가 아무 행도 잡지 못해 **승인이 기록되지 않고** 요청은
대기 상태로 남습니다 — 실제로 일어나지 않은 일을 "승인됨"으로 적는 것보다 눈에 보이는
실패가 낫습니다. `status='menunggu'` 조건을 UPDATE에서 한 번 더 거는 이유는
관리자 둘이 동시에 눌러도 하나만 성공하게 하기 위함입니다(행 잠금 후 재평가).

고객 삭제는 `NOT EXISTS (SELECT 1 FROM penjualan WHERE pelanggan = …)` 조건을 DELETE에
그대로 붙입니다. 기안할 때도 같은 검사를 하지만, 기안과 승인 **사이에** 판매가 생길 수
있기 때문입니다.

## 적용 방법

`api-server.js`의 `ensureHapus()`가 서버 기동 시 같은 DDL을 실행하므로 배포만 해도
테이블은 생성됨. 이 파일은 기록용이며 수동 적용도 가능:

```
psql "$DATABASE_URL" -f migrations/2026-09-11-hapus-usulan/10_hapus_usulan.sql
```

## 관련 엔드포인트

- `GET  /api/hapus-usulan` — 목록 (대기 건 우선, 최대 200건)
- `POST /api/hapus-usulan` — 기안 (로그인한 누구나). `{jenis, sasaran, alasan}`.
  대상이 없으면 404, 대기 건 중복이면 409, 고객이 판매 이력을 가지면 400
- `POST /api/hapus-usulan/:id/putusan` — 확정 (admin).
  승인 시 한 트랜잭션 안에서 삭제까지 실행

여신한도 결재는 [migrations/2026-09-11-limit-usulan/](../2026-09-11-limit-usulan/) 참고.
