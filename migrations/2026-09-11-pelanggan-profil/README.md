# 2026-09-11 — 고객 상세항목 (`pelanggan` 프로필 열)

## 배경

`pelanggan`에는 이름·담당자·전화·도시만 있어 인보이스에 찍을 항목(대표자, 주소,
세금번호)과 영업 관리 항목(담당 영업, 내부 메모)을 담을 자리가 없었음.
열 6개를 추가해 고객 상세 모달과 인보이스가 같은 원본을 쓰도록 함.

## 실행 내용 (`10_pelanggan_profil.sql`)

| 열 | 용도 |
| --- | --- |
| `pemilik` | 오너·대표자명 (인보이스) |
| `alamat` | 청구 주소 전체 (인보이스) |
| `email` | 이메일 |
| `npwp` | 사업자번호 — 인보이스 인쇄 항목 |
| `sales` | 계정 담당 영업사원 |
| `catatan` | 내부 메모, 인쇄 제외 |

전부 `TEXT NOT NULL DEFAULT ''`. 널 허용으로 두면 화면마다 "빈 값"과 NULL을
따로 다뤄야 하고, 기본값이 있으면 기존 행은 데이터 재작성 없이 `''`로 채워짐.

## 적용 방법

`api-server.js`의 `ensurePelanggan()`이 서버 기동 시 같은 `ALTER ... IF NOT EXISTS`를
실행하므로 배포만 해도 열은 생깁니다. 이 파일은 기록용이며 수동 적용도 가능:

```
psql "$DATABASE_URL" -f migrations/2026-09-11-pelanggan-profil/10_pelanggan_profil.sql
```

되돌리기는 `ALTER TABLE pelanggan DROP COLUMN ...`이지만, 입력된 값이 함께
사라지므로 배포 직후가 아니면 권하지 않습니다.

## 관련 엔드포인트

- `POST /api/pelanggan` — 신규 등록 시 새 열까지 함께 저장
- `PUT  /api/pelanggan/:id` — 프로필 수정. **`limit_kredit`·`termin`은 대상 아님**
  (여신한도/결제조건은 `limit_usulan` 결재로만 변경 — 승인 이력을 우회할 수 없게)
