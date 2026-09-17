# 2026-09-17 — 거래처 결제조건(termin) 일괄 정정

`Termin Customer.xlsx` 18개 거래처의 결제조건을 마스터(`pelanggan.termin`)에
맞춥니다.

| 일수 | 거래처 |
|---|---|
| 14일 | PT. GAYADIA TANGGUH INSANI · PT. ILC LOGISTICS INDONESIA · PT. KUALA DELI TRANS · PT. COTRANS JAYA ABADI · PT. BONA PASOGIT SEMESTA · ZELDA JAYA BAN · GARASI HAJI ULIL |
| 45일 | ARTO MORO ANUGERAH LAUTAN · PT. HARMONI AWOT NUSANTARA · PT. CIPTA SARANA TRANSPORT |
| 60일 | ADI PAMADI · PT. BUNGA DARU · PT. EKA PS · PT. SAMUDERA PERDANA SELARAS · PT. TRI DOMINIC · PT. TRI DOMINITAMA · PT. TRIKUSUMA JAYA PERKASA |
| 90일 | PT. SIBA SURYA |

파일에 없는 나머지 거래처는 **손대지 않습니다**. 대부분 기본값 30일이며,
`10_dry_run.sql` 의 5번이 그 목록을 보여 줍니다.

## 알고 넘어가야 할 것

**만기일은 저장돼 있지 않고 매번 계산됩니다** — `SO 일자 + 거래처 termin`
([src/App.jsx:1083](../../src/App.jsx#L1083)). 그래서 이 작업은 앞으로의
전표뿐 아니라 **이미 발행된 전표의 만기일과 미수금 연령도 함께 옮깁니다.**
14일로 줄어드는 7곳은 연체로 바뀌는 건이 생기고, 60·90일로 늘어나는 곳은
연체가 풀립니다. 그것이 의도한 바입니다 — 애초에 틀려 있던 값이니까요.

**이름 대조는 대소문자·공백·마침표를 무시합니다.** `PT. TRI DOMINIC` 과
`PT TRI DOMINIC` 은 같은 회사로 붙고, `TRI DOMINIC` 과 `TRI DOMINITAMA` 는
그대로 서로 다른 회사로 남습니다.

**여신한도(`limit_kredit`)는 건드리지 않습니다.** 또 이 수정은 화면의
기안·승인(`limit_usulan`)을 거치지 않아 승인 이력에 남지 않습니다. 일괄
정정이라 그렇게 했고, 앞으로 개별 변경은 화면에서 하십시오.

## 실행

Neon SQL Editor 에서 순서대로:

```
10_dry_run.sql  -- 읽기 전용. 1번(마스터 미매칭)·2번(중복 마스터)이 비어야 함
20_termin.sql   -- 실제 UPDATE. 끝의 n_cocok 이 18 이면 COMMIT
```

`10_dry_run.sql` 의 3번(변경 전/후)을 캡처해 두시면 나중에 되돌릴 때 씁니다.
1번에 이름이 남으면 그 거래처는 마스터 표기가 다르다는 뜻이니, 표기를 알려
주시면 목록을 고쳐 드리겠습니다.

반영 후 화면에서는 새로고침 한 번이면 보입니다 — 고객 화면의 `Termin`,
미수금 화면의 만기·연체 일수가 바로 새 값으로 계산됩니다.

## 실행 완료 (2026-09-17)

Neon 콘솔 production 브랜치에서 실행했습니다.

- `10_dry_run.sql` — 1번(미매칭)·2번(중복) 0건. 첫 쿼리 18행이 전부 `3. 변경`,
  즉 18곳 모두 마스터에서 찾았고 18곳 모두 값이 달랐습니다. 전부 `30` 에서
  옮겨졌습니다(예: ADI PAMADI 30→60, ARTO MORO 30→45, GARASI HAJI ULIL 30→14).
- `10_dry_run.sql` 5번 — 파일에 없는 거래처 40곳. 손대지 않았습니다(거래처 총 58곳).
- `20_termin.sql` — `UPDATE 18` 후 COMMIT.
