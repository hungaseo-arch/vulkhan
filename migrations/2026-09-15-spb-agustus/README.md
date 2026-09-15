# 2026-09-15 — SPB 2026년 8월 판매 적재

[2026-08-13-spb-v2](../2026-08-13-spb-v2/README.md) 의 미해결 항목 2번
("판매 데이터 최신화 07-30 → 08-13")을 닫는 작업.

## 원본

`SPB Daily Sales Report Jan - Agustus 2026 14092026.xlsx` 의 `All 2026` 시트
(2026-09-14판, 14MB). 이 시트는 Jan~Aug 477라인이며, 그 중 `PO Date` 가
2026-08 인 **83라인**이 이번에 새로 적재할 분량입니다.
477 − 83 = 394 로, 기존에 적재된 Jan~Jul 394라인과 정확히 맞아떨어집니다.

`spb_sales_2026_08.csv` 가 추출 결과이며, 컬럼 구성은
`2026-08-13-spb-v2/spb_sales_2026_v2.csv` 와 동일합니다.

## 원본 검증 (적재 전 확인 완료)

| 항목 | 결과 |
|---|---|
| 라인 / 전표 | 83라인 / 58전표 (SO 001~058) |
| 기간 | 2026-08-01 ~ 2026-08-31 |
| 수량 / 금액 | 405 EA / IDR 523,816,000 |
| `All Sum 2026` 시트 8월 합계 | 405 EA / IDR 523,816,000 — **일치** |
| 전표별 buyer·일자·Destination·PIC | 전표 내 불일치 0건 |
| `qty × 단가 = 금액` | 83라인 전부 일치 |
| SO Qty vs Aktual Delivery Qty | 83라인 전부 동일 (미출고 잔량 없음) |

## 마스터 보정 (적재 전 20_master.sql 이 처리)

**1. `PT. TRI DOMINITAMA` — 표기 정정**

8월 원본에 `PT. TRIDOMINITAMA`(SO-2608-035, SURABAYA)와
`PT. TRI DOMINITAMA`(SO-2608-052, JAKARTA) 두 표기가 함께 나옵니다.
**같은 회사이며 띄어쓴 쪽이 올바른 표기**임을 확인받았습니다.

- CSV 두 줄 모두 `PT. TRI DOMINITAMA` 로 맞춤
- `20_master.sql` 이 기존 마스터 행의 `nama` 를 같은 표기로 UPDATE
- `id` 는 그대로라 기존 Jan~Jul 전표 연결은 영향 없음
- 거래처는 늘지 않고 **한 곳**으로 유지됩니다

**2. 신규 거래처 4곳** — 8월에 처음 등장. `20_master.sql` 이 생성합니다.

| 거래처 | 전표 | 금액 |
|---|---|---|
| GLX KARGO LOGISTIK | 1 | 2,680,000 |
| PT. BERKAT ACI MULIA | 3 | 8,250,000 |
| PT. HARMONI AWOT NUSANTARA | 2 | 20,335,000 |
| PT. PERKASA JAYA TRANSPORT | 1 | 3,400,000 |

여신한도는 0(미설정)으로 만듭니다 — 기존 52곳과 동일합니다.

**3. 신규 품목 1종 — `G175015AJ101` / GIS 7.50-15 AJ101**

`SO-2608-028`(2026-08-13, PT. SARANA BARU SANTOSO, JAKARTA) 2 EA @ 850,000.
기존 `G175015AJ101`(7.50-15)은 없고 `G175016AJ101`(7.50-16)만 있어 오타 가능성을
확인했으나, **실제 신규 사이즈임을 확인받았습니다.**

엑셀의 `MASTER DATA` 시트에도, `All Sum 2026` 품목 내역에도 이 코드가 없습니다
— 그래서 요약시트의 품목별 합계는 403 EA 로 총계 405 EA 와 2 EA 어긋납니다.
**원본 요약시트 쪽 누락이며 상세 내역이 맞습니다.**

`harga` 는 실제 거래가 850,000, `hpp`(원가)는 미확보라 **0** 으로 생성합니다.
원가를 알게 되면 `20_master.sql` 의 해당 값을 고치거나 나중에 UPDATE 하십시오.

## 적용 규칙

`2026-08-12-may-backfill` / `2026-08-12-destinasi-gudang-fix` 와 동일:

- `penjualan.id` = `'SO-' || upper(substr(md5(no),1,6))`
- `penjualan.no` = `SO-2608-NNN` (엑셀 `SO` 열의 월별 일련번호)
- `status` = `lunas` (과거분 임포트 관례)
- `gudang` = Destination 매핑 — SURABAYA→`SBY`, SEMARANG→`SMG`, JAKARTA→`KRW`
- `stok_mutasi` = `tipe='keluar'`, `qty` 음수, `ref`=so_no,
  `catatan='Pengiriman penjualan (import historis)'`

## 실행 순서

Neon **콘솔**(SQL Editor)에서는 `\copy` 가 동작하지 않습니다 — psql 전용
메타명령이라 콘솔은 그냥 넘어가고, 스테이징이 빈 채로 다음 단계가 돌면
0행이 적재되면서도 에러가 안 납니다. 콘솔이면 0번을 `00_staging_konsol.sql`
(같은 83행을 INSERT 로 넣는 파일)로 바꿔 쓰십시오. `30_insert.sql` 은
스테이징이 83행이 아니면 중단하도록 되어 있습니다.

```bash
cd migrations/2026-09-15-spb-agustus
psql "$DATABASE_URL" -f 00_staging.sql   # 스테이징만. 본 테이블 안 건드림
                                         # (Neon 콘솔이면 00_staging_konsol.sql)
psql "$DATABASE_URL" -f 10_dry_run.sql   # 읽기 전용. 출력 확인 필수
psql "$DATABASE_URL" -f 20_master.sql    # 신규 거래처·품목 생성
psql "$DATABASE_URL" -f 30_insert.sql    # 판매 83라인 적재
psql "$DATABASE_URL" -f 40_verifikasi.sql # 읽기 전용 사후 확인
```

`30_insert.sql` 은 매칭 안 되는 거래처·품목이 남아 있으면 `RAISE EXCEPTION`
으로 중단합니다. inner join 으로 조용히 흘려보내면 매출이 빈 채로 커밋되기
때문입니다. 또 이미 존재하는 `so_no` 는 건너뛰므로 재실행해도 안전합니다.

적재 후 기대값: `penjualan` 290 → **348**, `penjualan_item` 394 → **477**,
8월이 58전표 / 405 EA / IDR 523,816,000.

## 미해결로 남는 항목

- 구매(`pembelian`) 원장 — 여전히 0건. 원본 미확보
  ([2026-08-13-spb-v2](../2026-08-13-spb-v2/README.md) 미해결 1번)
- 9월 판매 — 이 원본은 8월까지만 담고 있습니다
