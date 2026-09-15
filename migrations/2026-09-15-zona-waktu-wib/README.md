# 2026-09-15 — 시스템 기준시각을 WIB로 고정

## 확인된 사실

Neon 인스턴스는 **UTC(GMT)** 로 돕니다. production 에서 직접 확인했습니다.

| 항목 | 값 |
|---|---|
| `current_setting('TimeZone')` | `GMT` |
| `now()` | `2026-09-15 09:38:36+00` |
| `CURRENT_DATE` | `2026-09-15` |
| `(now() AT TIME ZONE 'Asia/Jakarta')::date` | `2026-09-15` |

확인 시각이 WIB 16:38 이라 두 날짜가 같게 나왔을 뿐이고, **매일 WIB
00:00~07:00 사이에는 서버 날짜가 하루 뒤쳐집니다.** WIB = UTC+7, 서머타임
없음.

## 그래서 실제로 무엇이 틀어지는가

1. **매달 1일 아침.** 오전 7시 전에 만든 전표는 DB 기준으로 아직 지난달입니다.
   당월 수정/삭제 판정([2026-09-15-penjualan-dibuat-oleh](../2026-09-15-penjualan-dibuat-oleh/README.md))이
   "당월이 아님"으로 거절하는데, 화면에는 수정 버튼이 그대로 보입니다.
2. **아침 출고.** `trg_penjualan_kirim` 이 `stok_mutasi.tgl` 을 어제로 찍습니다.
   재고 일계표가 하루씩 밀립니다.
3. **채권 연령.** 브라우저 기준(서울이면 UTC+9)과 서버 기준(UTC)이 달라
   같은 화면에서 두 개의 "오늘"이 돌아다녔습니다.

시계가 셋이었습니다 — 브라우저 로컬, DB의 UTC, 그리고 실제 업무 기준인 WIB.
**셋 다 WIB 하나로 맞췄습니다.**

## 고친 곳

**DB (이 폴더의 `10_wib.sql`)**

- `wib_today()` 함수 신설 — `(now() AT TIME ZONE 'Asia/Jakarta')::date`
- `penjualan.tgl` / `pembelian.tgl` / `stok_mutasi.tgl` 기본값
  `CURRENT_DATE` → `wib_today()`
- `trg_penjualan_kirim()` / `trg_pembelian_terima()` 본문의 `CURRENT_DATE`
  → `wib_today()`

**애플리케이션**

- `api-server.js` — 당월 판정 2곳(`tolakUbahSO()`, `PUT /api/penjualan/:id` 의
  새 `tgl` 검사)이 `wib_today()` 를 씁니다.
- `api-server.js` — `ensureWaktu()` 가 위 DDL을 **cold start 마다 다시
  적용**합니다. 다른 `ensure*` 와 같은 방식이라, 새 환경을 띄워도 사람이
  기억해서 돌려야 하는 마이그레이션은 없습니다.
- `src/App.jsx` — `today()` 가 브라우저 로컬시각이 아니라 WIB를 돌려줍니다.
  전표 기본 날짜, 조회 기간 기본값, 내보내기 파일명, 채권 연령 계산이 전부
  여기에 걸려 있습니다.

## `Asia/Jakarta` 로 쓴 이유

`+7` 이라는 숫자 대신 지역명을 씁니다. WIB는 서머타임을 가진 적이 없어서
결과는 같지만, 읽는 사람에게 **의도**가 보입니다. 숫자는 왜 7인지 설명하지
않습니다.

## DB 설정을 바꾸지 않은 이유

`ALTER DATABASE ... SET timezone` 한 줄로 끝낼 수도 있습니다. 그러지 않은
이유는, 그렇게 하면 **코드만 봐서는 이 시스템이 어느 시각으로 도는지 알 수
없게** 되기 때문입니다. 콘솔 설정은 복원·복제·이관 때 조용히 사라지고,
사라져도 아무 에러가 나지 않습니다. 날짜가 하루씩 어긋나는 것으로만
드러납니다. 기준시각은 코드에 박아 두는 편이 안전합니다.

## 실행

`10_wib.sql` 은 배포된 코드의 `ensureWaktu()` 가 어차피 자동으로 적용합니다.
콘솔에서 먼저 돌려 두면 배포 전에 결과를 눈으로 확인할 수 있습니다.

```
00_cek.sql        -- 읽기 전용. 현재 상태
10_wib.sql        -- 함수 1개 + 기본값 3개 + 트리거 2개. 데이터는 안 건드림
20_verifikasi.sql -- 읽기 전용 사후 확인
```

`20_verifikasi.sql` 기대값: 기본값 3개가 전부 `wib_today()`, 3번 쿼리는 0행.
`selisih_hari` 는 WIB 00~07시에 실행하면 `1`, 그 밖의 시간이면 `0` 입니다.

## 남는 것

이미 적재된 과거 데이터는 손대지 않았습니다. 1~8월 임포트분은 원본 엑셀의
날짜를 그대로 넣은 것이라 시간대 문제가 없고, 9/11 재고 조정분도 낮 시간에
찍힌 것이라 WIB·UTC 날짜가 같습니다.
