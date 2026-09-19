# 아키텍처

## 전체 구성

```
브라우저 (React SPA, dist/)
   │  fetch /api/*  (Bearer 세션 토큰)
   ▼
Vercel
   ├─ 정적 파일: dist/
   └─ /api/(.*) → api/index.js → api-server.js (Express, 서버리스 함수 1개)
                                      │  @neondatabase/serverless (HTTP)
                                      ▼
                                 Neon PostgreSQL
```

로컬에서는 같은 Express 앱이 `node api-server.js`로 3001 포트에서 직접 listen하고,
Vite 개발 서버(5173)가 그 주소를 호출합니다. 프로덕션 빌드는 same-origin `/api`를 호출합니다.

## 프런트엔드

### 파일

| 파일 | 역할 |
|---|---|
| [src/main.jsx](src/main.jsx) | `createRoot` + StrictMode |
| [src/App.jsx](src/App.jsx) | 앱 전체. 유틸 → 시드 데이터 → 상수 → `App()` → 탭 컴포넌트 → 폼/모달 → 공용 컴포넌트 → `Style()` 순 |
| [src/i18n.jsx](src/i18n.jsx) | 번역 사전(`KO`), `LangProvider`, `useLang()`. App.jsx 밖으로 뺀 유일한 UI 모듈 |
| [src/api.js](src/api.js) | `fetch` 래퍼 `j()`, 토큰 보관, 응답 정규화 |
| [src/xlsx.js](src/xlsx.js) | ZIP(STORE) + inline string으로 XLSX 생성, 외부 의존성 없음 |
| [src/index.css](src/index.css) | 전역 리셋만. 앱 스타일은 `Style()`의 CSS 문자열 |

### 상태

`App()`은 `<LangProvider>`로 `Aplikasi()`를 감싸기만 하고, 실제 앱 본체는 `Aplikasi()`입니다.
`Aplikasi()`가 모든 데이터를 `useState`로 들고 `ctx` 객체로 탭에 내려줍니다. 전역 상태 라이브러리는 없습니다.

| 상태 | 원천 |
|---|---|
| `produk`, `pelanggan`, `pemasok`, `penjualan`, `pembelian` | `/api/bootstrap` |
| `mutasi` | `/api/bootstrap`의 최근 500건 (표시 전용) |
| `stokServer` | `/api/bootstrap`의 `v_stok` 행. 온라인 재고의 유일한 원천 |
| `GUDANG` | 모듈 스코프 `let`. 서버 응답으로 교체됨 |
| `user` | `localStorage("vk_user")`, 토큰 포함 |
| `conn` | `"loading" → "online" | "offline"`. 마운트 시 `/api/health` 1회 |
| `lang` | `localStorage("vk_lang")`. `Aplikasi()` 밖 `LangProvider`가 소유 |

`stok`은 `useMemo`로 만든 `"gudang|produk" → qty` 맵입니다. `stokServer`가 있으면 그것을 쓰고,
없을 때(오프라인 데모)만 `mutasi`를 합산합니다.

### 온라인 / 오프라인

로그인은 온라인일 때만 가능합니다. 오프라인이면 로그인 화면에서 멈추고, 코드에 남아 있는 `SEED_*` 데이터는
개발 편의용 데모 경로일 뿐 프로덕션 사용자에게는 보이지 않습니다.

모든 쓰기 동작(`do*`, `majuSO`, `majuPO`)은 다음 패턴입니다.

```
online  → api.xxx() → reload()   // 서버가 진실, 응답 후 전체 재로드
offline → 메모리 상태 직접 갱신    // 데모
```

`reload()`는 `/api/bootstrap` 1회 호출입니다. 부분 갱신이나 낙관적 업데이트는 하지 않으며,
데이터 규모(전표 수백 건)에서는 이 단순함이 이점입니다.

### 화면

탭은 `TABS` 배열과 `<main>`의 조건부 렌더로 연결됩니다. 한 번에 한 탭만 마운트됩니다.
모달은 `useDialog()`로 포커스 트랩, ESC 닫기, 배경 스크롤 잠금을 공유합니다.
헤더 우측은 `MenuPengguna` 하나로, 이름·역할 표시와 비밀번호 변경·로그아웃을 드롭다운에 모았습니다.
문서 출력(견적서·인보이스)은 `@media print` 규칙으로 같은 DOM을 인쇄합니다.

### 다국어

gettext 방식입니다. **사전 키가 인도네시아어 원문 그 자체**라 번역이 없으면 키가 그대로 표시됩니다.
별도 키 이름을 만들지 않으므로 새 문자열을 놓쳐도 화면이 깨지지 않고 인도네시아어로 남습니다.

```
App() → <LangProvider> → Aplikasi()
                │
                └ t("Simpan")            → "저장" | "Simpan"
                  t("{n} hari", {n: 30})  → 자리표시자 치환
                  t("Keluar|mutasi")      → "출고"  ("|" 뒤 문맥은 표시되지 않음)
```

- `lang`은 `localStorage["vk_lang"]`에 저장되고 `<html lang>` 속성도 함께 갱신됩니다.
- 동음이의어는 `"키|문맥"`으로 분리합니다: `Masuk`(입고)/`Masuk|login`(로그인),
  `Keluar|mutasi`(출고)/`Keluar`(로그아웃), `Penawaran`(견적)/`Penawaran|dok`(견적서).
- 날짜는 `tglPanjang(tgl, lang)`, `bulanLabel(ym, lang)`이 `lang`에 따라 형식을 바꿉니다.
- **인쇄용 faktur·penawaran 서류 본문은 번역 대상이 아닙니다.** 인도네시아 거래처에 나가는 서류라
  인도네시아어로 고정이고, `lang`을 넘기지 않아 날짜도 인도네시아어 형식으로 남습니다.
- 전환 UI(`LangSwitch`)는 헤더 `.who`와 로그인 카드 `.login-brand` 두 곳에 있습니다.

### 브랜딩

아센도 BI를 따릅니다. 색 토큰은 `Style()` 상단 `--asm-*`(primary `#0062C6`, dark `#333333`)이며
BI 색은 바꾸지 않습니다. 글자 크기도 같은 자리의 `--asm-fs-*` 9단계(2xs 10px ~ 2xl 20px, KPI 값은
`--asm-fs-kpi`)만 씁니다 — 화면 CSS에 px·rem 크기를 직접 적지 않습니다. 인쇄 서류(`.doc-*`)만
자체 크기를 가집니다. 로고 자산은 `public/ascendo-symbol.png`(심볼, 헤더·파비콘)와
`public/ascendo-signature.png`(시그니처, 로그인 화면·`og:image`) 두 개입니다.

인쇄 서류 kop은 아센도 로고를 쓰지 않고 중립 마크(`TreadMark`)를 씁니다. 그 서류의 발행처는
`PENERBIT`에 정의된 CV. Sinar Perkasa Ban / PT. Daimond Fajar Jaya / PT ASCENDO INTERNATIONAL이기 때문입니다.

### 경유 청구와 PPN

부가세 거래는 그룹사(PT ASCENDO INTERNATIONAL)를 거쳐 나갑니다. 고객 마스터의 `pelanggan.via`가
그 경유처이고, `pelanggan.ppn`은 PKP 여부입니다. 판매 문서를 저장할 때 서버(`ruteTagih`)가 이 둘을
읽어 **청구처**(`penjualan.pelanggan`)와 **최종 사용자**(`penjualan.pelanggan_akhir`), 그리고 문서
시점의 세율(`penjualan.ppn`, 퍼센트)을 정합니다. 경로 판단은 서버에만 있습니다 — 화면이 보낸 값으로
마스터와 어긋난 문서가 생기지 않게 하기 위해서입니다. 체인은 한 단계까지만 허용합니다(`tolakRute`).

두 축의 의미가 다릅니다. **미수금·여신한도·연령분석은 청구처**를 따르고(돈을 받는 상대가 그쪽이므로),
**매출·고객 순위·월별 요약은 최종 사용자**를 따릅니다(`pelangganSO`). PPN은 매출·미수금 금액에
포함해 계산합니다(`nilaiSO = subtotalSO + ppnSO`).

### 분할 수금

큰 고객은 한 인보이스를 한 번에 결제하지 않습니다. 그래서 “받았다/못 받았다”만 말할 수 있는 `status`
대신 **수금 원장**(`penjualan_bayar`)을 두고, 잔액은 언제나 `문서 금액 − 수금 합계`로 계산합니다.
재고를 `stok_mutasi` 합계로 정의한 것과 같은 방식이고, “이미 받은 금액” 컬럼은 어디에도 없습니다.

- 미수금·연령분석·여신한도는 모두 **잔액**(`sisaSO`)을 씁니다. 절반 받은 인보이스는 절반만 연체합니다.
- 상태와 원장은 한 트랜잭션 안에서 맞춥니다. 입금 후 잔액이 0이면 `lunas`, 수금을 취소해 잔액이
  다시 생기면 `tagihan`으로 되돌아갑니다(`tandaiLunas` / `bukaLunas` — 조건을 UPDATE의 WHERE로
  다시 검사하므로 동시 요청에도 어긋나지 않습니다).
- “→ Lunas” 버튼은 사라지지 않았습니다. 남은 잔액만큼 `auto` 행 한 줄을 넣어 완납 처리하고,
  상태를 되돌리면 그 `auto` 행만 지웁니다. 사람이 입력한 수금은 건드리지 않습니다.
- 돈이 미아가 되지 않게 막습니다: 초과 입금 불가, 수금이 있는 문서는 출고 취소 불가, 수정으로
  문서 금액을 이미 받은 금액 아래로 줄이는 것도 불가.
- 화면은 판매 상세 다이얼로그 안에서 처리합니다(수금 이력 · 수금액/잔액 · 등록 폼). 다이얼로그를
  겹치지 않는다는 규칙 때문에 별도 모달이 아니라 인라인 폼입니다.

### 폰트

`index.html`에서 `preconnect` + `<link rel="preload" as="style" onload=…>`로 Google Fonts를 비차단 로드합니다.
JS 안에서 `@import`하면 React 렌더 이후에야 폰트 요청이 시작되므로 다시 넣지 않습니다.

패밀리는 Noto Sans KR + Noto Sans 하나뿐이고, `--fd`(제목)·`--fb`(본문)·`--fm`(숫자)이 모두 같은
스택을 가리킵니다. 한국어 UI에 한글 글리프가 필요해서 Noto Sans KR을 다시 넣었습니다.

대가가 있습니다. Noto Sans KR은 `unicode-range` 서브셋이 많아 폰트 CSS가 **393KB(gzip 92KB),
`@font-face` 528개**입니다(이전 IBM Plex Sans 조합은 1.5KB). 실제 폰트 **파일**은 브라우저가 쓰는
서브셋만 받으므로 렌더 비용은 이보다 훨씬 작지만, CSS 자체가 렌더 차단 경로에 있진 않아도
무시할 크기는 아닙니다. 줄이려면 한글 서브셋을 self-host하거나 `lang === "ko"`일 때만
Noto Sans KR을 붙이는 방법이 있습니다.

## 백엔드

### 미들웨어 순서

1. `cors` — `CORS_ORIGIN` 목록. Vercel에서는 same-origin이라 사실상 로컬 개발용
2. `express.json`
3. 인증 게이트 — `/api/login`, `/api/health`를 제외한 모든 경로에 `requireRole("staff")`
4. `ensureReady` — 콜드스타트마다 1회 `pengguna`·`limit_usulan` 테이블 보장 + 기본 계정 시드 + 관리자 복구

### 인증

- 비밀번호: `scrypt` 해시, `salt:hash` 형식
- 세션: `base64url(payload).HMAC-SHA256` 미니 JWT, 12시간 만료. 역할은 검증된 payload에서만 읽습니다
- 역할 서열: `staff(1) < manager(2) < admin(3)`. 삭제와 사용자 관리는 admin,
  나머지 역할은 삭제를 `hapus_usulan`으로 기안
- 프런트의 `can()`은 UI만 제어하고, 서버의 `requireRole()`이 실제 보호입니다

### 라우트

| 메서드 · 경로 | 역할 | 비고 |
|---|---|---|
| GET `/api/health` | 연결 확인 | 인증 불필요 |
| POST `/api/login` | 토큰 발급 | 인증 불필요 |
| GET `/api/bootstrap` | 초기 로드 전체 | 쿼리 11개 `Promise.all`(수금 원장 포함) |
| GET `/api/gudang` `/produk` `/pelanggan` `/pemasok` | 마스터 | 개별 조회용으로 유지 |
| GET `/api/stok`, `/api/stok/total` | `v_stok`, `v_stok_total` | |
| GET `/api/mutasi` | 최근 500건, 오름차순 | 표시 전용 |
| POST `/api/mutasi/transfer` | 창고 이동 | 재고 확인 후 INSERT 2건 트랜잭션 |
| POST `/api/mutasi/penyesuaian` | 실사 조정 | 차이분 1건 INSERT |
| GET/POST `/api/mutasi/saldo-awal` | 기초재고 | 저장은 manager. `ref='AWAL'` 한 줄로 기록, 재저장 시 교체 |
| GET/POST `/api/penjualan`, PATCH `/:id/status`, DELETE `/:id` | 판매 | 생성·삭제는 트랜잭션, 삭제는 admin |
| POST `/api/penjualan/:id/bayar` | 분할 수금 등록 | 출고·청구 상태만. 금액은 잔액 이하, 일자는 문서일 이후. 입금 후 잔액 0이면 같은 트랜잭션에서 `lunas` |
| DELETE `/api/penjualan/:id/bayar/:bayar` | 수금 취소 | 문서 수정 권한(`tolakUbahSO`)과 동일. 잔액이 남으면 `lunas` → `tagihan`으로 되돌림 |
| GET/POST `/api/pembelian`, PATCH `/:id/status`, DELETE `/:id` | 구매 | 동일 |
| POST `/api/pelanggan`, PUT/DELETE `/:id` | 고객 | 수정은 프로필만 — 한도·결제조건 제외. 판매 이력이 있으면 삭제 거부 |
| GET/POST/PUT/DELETE `/api/pengguna` | 사용자 | admin. 본인 삭제·본인 역할 변경·마지막 admin 강등 불가 |
| POST `/api/pengguna/:id/reset-sandi` | 비밀번호 초기화 | admin. `ascendo123`으로. 본인은 제외 |
| POST `/api/ganti-sandi` | 비밀번호 변경 | 토큰의 id로만 |
| GET/POST `/api/limit-usulan` | 여신한도·결제조건 기안 | 기안은 staff 이상. 대기 건 중복이면 409 |
| POST `/api/limit-usulan/:id/putusan` | 여신한도 확정 | admin. 승인 시 한도·결제조건 반영까지 한 트랜잭션 |
| GET/POST `/api/hapus-usulan` | 삭제 기안 | 기안은 staff 이상. 대기 건 중복이면 409 |
| POST `/api/hapus-usulan/:id/putusan` | 삭제 확정 | admin. 승인 시 삭제까지 한 트랜잭션, 대상이 남아 있으면 409 |

### 트랜잭션

Neon HTTP 드라이버는 연결을 유지하지 않으므로 `sql.transaction([q1, q2, …])`로 여러 문장을 한 번의
HTTP 요청에 실어 원자적으로 실행합니다. 비대화형이라 중간 결과로 분기할 수 없어, 재고 부족 검사 같은
조건은 트랜잭션 앞에서 따로 조회합니다.

## 데이터베이스

스키마: [doc/neon-schema.sql](doc/neon-schema.sql)

| 테이블 | 요지 |
|---|---|
| `gudang`, `produk`, `pelanggan`, `pemasok`, `pengguna` | 마스터. id는 텍스트(`G1`, `P12`, `C3`, `U1`) |
| `stok_mutasi` | 재고 원장. `tipe ∈ {masuk, keluar, transfer, penyesuaian}`, `qty` 부호 포함, `ref`에 전표 번호. `ref='AWAL'`은 기초재고(창고·품목당 1행, 재저장 시 교체) |
| `penjualan` + `penjualan_item` | SO 헤더/항목. `tgl_kirim`은 실제 출고일(출고 전·과거 import 행은 NULL). 만기일은 여전히 `tgl` 기준. 문서일보다 이른 출고일은 안정화 기간(`AKHIR_MASA_STABILISASI`, 2026-09-30)까지만 허용 |
| `penjualan_bayar` | 수금 원장. 한 SO에 여러 행(분할 납부). 잔액은 저장하지 않고 `문서 금액 − SUM(jumlah)`로 계산. `auto`는 “→ Lunas” 버튼이 만든 완납 행 표시 — 상태를 되돌릴 때 이 행만 지웁니다. `cara ∈ {transfer, tunai, giro, potongan}` |
| `pembelian` + `pembelian_item` | PO 헤더/항목 |
| `limit_usulan` | 여신한도 기안. 대기 건은 고객당 하나(부분 유니크 인덱스). 기안자/확정자는 FK가 아니라 이름 스냅샷 |

| 뷰 · 트리거 | 역할 |
|---|---|
| `v_stok` | `SUM(qty) GROUP BY gudang, produk` — 재고의 정의 |
| `v_stok_total` | 제품별 합계 |
| `v_penjualan` | SO 헤더 + 합계 금액(항목 합계, PPN 제외) + `dibayar`(수금 합계) |
| `v_piutang` | 고객별 미수금(출고·청구 상태 SO 합, 문서별 PPN 포함, 수금액 차감 후 잔액) |
| `t_penjualan_kirim` | 상태가 `kirim`이 되면 항목별 `keluar` 원장 자동 생성. 원장 일자는 `COALESCE(tgl_kirim, wib_today())` |
| `t_pembelian_terima` | 상태가 `diterima`가 되면 `masuk` 원장 자동 생성 |

인덱스: `stok_mutasi(gudang, produk)`, `stok_mutasi(ref)`.

### 재고 모델

- 재고는 저장하지 않고 원장 합계로 정의합니다. UI와 API 어디에도 재고 UPDATE가 없습니다.
- 전표 삭제는 `ref = 전표번호`인 원장 행을 함께 지웁니다.
- 원장이 500건을 넘어도 재고는 `v_stok`가 전체를 합산하므로 정확합니다. 500건은 화면 목록 한도일 뿐입니다.
- 현재 DB에는 개시재고와 구매 입고가 없어 재고가 음수입니다. 이는 데이터 미적재 상태이며 계산 오류가 아닙니다.
  구매 원장 적재 계획은 없고, 재고 현황은 추후 별도 갱신 예정입니다.

### 상태 흐름

```
SO: penawaran → pesanan → kirim → tagihan → lunas
PO: order → diterima → lunas
```

서버는 한 단계 전진만 허용하고, `kirim` 전에 출고 창고 재고를 검사합니다.
프런트의 `SO_FLOW`/`PO_FLOW`와 서버의 동일 배열을 항상 함께 바꿉니다.

## 배포

- `vercel.json`: `buildCommand: npm run build`, `outputDirectory: dist`, `/api/(.*) → /api` rewrite
- `api/index.js`가 Express 앱을 default export하여 Vercel 서버리스 함수 하나로 동작
- 환경 변수: `DATABASE_URL`(sensitive), `AUTH_SECRET`
- `npm run deploy`는 lint → build → `vercel --prod`

## 성능 특성

| 항목 | 값 | 측정 |
|---|---|---|
| JS 번들 | 322KB, gzip 93KB, 단일 청크 (React 약 60KB gzip 포함) | 2026-09-06, 다국어 적용 후 |
| 폰트 CSS | 393KB, gzip 92KB, `@font-face` 528개 | 2026-09-06, Noto Sans KR 도입 후 |
| 초기 데이터 로드 | 함수 호출 1회 (`/api/bootstrap`) | — |
| Lighthouse 성능 / 접근성 / 모범사례 | 99 / 89 / 100 | 2026-09-06, **다국어·BI 개편 이전** |
| FCP / LCP (모바일 시뮬레이션, 로그인 화면) | 1.4초 / 1.6초 | 2026-09-06, **다국어·BI 개편 이전** |

Lighthouse 수치는 폰트와 색 팔레트가 바뀌기 전 값이라 지금 상태를 대표하지 않습니다. 재측정이 필요합니다.

다음 개선 후보는 [CHANGELOG.md](CHANGELOG.md)의 "남은 과제"에 있습니다.
