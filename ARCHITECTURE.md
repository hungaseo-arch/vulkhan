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
| [src/api.js](src/api.js) | `fetch` 래퍼 `j()`, 토큰 보관, 응답 정규화 |
| [src/xlsx.js](src/xlsx.js) | ZIP(STORE) + inline string으로 XLSX 생성, 외부 의존성 없음 |
| [src/index.css](src/index.css) | 전역 리셋만. 앱 스타일은 `Style()`의 CSS 문자열 |

### 상태

`App()`이 모든 데이터를 `useState`로 들고 `ctx` 객체로 탭에 내려줍니다. 전역 상태 라이브러리는 없습니다.

| 상태 | 원천 |
|---|---|
| `produk`, `pelanggan`, `pemasok`, `penjualan`, `pembelian` | `/api/bootstrap` |
| `mutasi` | `/api/bootstrap`의 최근 500건 (표시 전용) |
| `stokServer` | `/api/bootstrap`의 `v_stok` 행. 온라인 재고의 유일한 원천 |
| `GUDANG` | 모듈 스코프 `let`. 서버 응답으로 교체됨 |
| `user` | `localStorage("vk_user")`, 토큰 포함 |
| `conn` | `"loading" → "online" | "offline"`. 마운트 시 `/api/health` 1회 |

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
문서 출력(견적서·인보이스)은 `@media print` 규칙으로 같은 DOM을 인쇄합니다.

### 폰트

`index.html`에서 `preconnect` + `<link rel="preload" as="style" onload=…>`로 Google Fonts를 비차단 로드합니다.
JS 안에서 `@import`하면 React 렌더 이후에야 폰트 요청이 시작되므로 다시 넣지 않습니다.
패밀리는 Archivo Narrow(제목), IBM Plex Sans(본문), IBM Plex Mono(숫자) 세 가지입니다.

## 백엔드

### 미들웨어 순서

1. `cors` — `CORS_ORIGIN` 목록. Vercel에서는 same-origin이라 사실상 로컬 개발용
2. `express.json`
3. 인증 게이트 — `/api/login`, `/api/health`를 제외한 모든 경로에 `requireRole("staff")`
4. `ensureReady` — 콜드스타트마다 1회 `pengguna` 테이블 보장 + 기본 계정 시드 + 관리자 복구

### 인증

- 비밀번호: `scrypt` 해시, `salt:hash` 형식
- 세션: `base64url(payload).HMAC-SHA256` 미니 JWT, 12시간 만료. 역할은 검증된 payload에서만 읽습니다
- 역할 서열: `staff(1) < manager(2) < admin(3)`. 삭제는 manager 이상, 사용자 관리는 admin
- 프런트의 `can()`은 UI만 제어하고, 서버의 `requireRole()`이 실제 보호입니다

### 라우트

| 메서드 · 경로 | 역할 | 비고 |
|---|---|---|
| GET `/api/health` | 연결 확인 | 인증 불필요 |
| POST `/api/login` | 토큰 발급 | 인증 불필요 |
| GET `/api/bootstrap` | 초기 로드 전체 | 쿼리 10개 `Promise.all` |
| GET `/api/gudang` `/produk` `/pelanggan` `/pemasok` | 마스터 | 개별 조회용으로 유지 |
| GET `/api/stok`, `/api/stok/total` | `v_stok`, `v_stok_total` | |
| GET `/api/mutasi` | 최근 500건, 오름차순 | 표시 전용 |
| POST `/api/mutasi/transfer` | 창고 이동 | 재고 확인 후 INSERT 2건 트랜잭션 |
| POST `/api/mutasi/penyesuaian` | 실사 조정 | 차이분 1건 INSERT |
| GET/POST `/api/penjualan`, PATCH `/:id/status`, DELETE `/:id` | 판매 | 생성·삭제는 트랜잭션, 삭제는 manager |
| GET/POST `/api/pembelian`, PATCH `/:id/status`, DELETE `/:id` | 구매 | 동일 |
| POST `/api/pelanggan`, DELETE `/:id` | 고객 | 판매 이력이 있으면 삭제 거부 |
| GET/POST/DELETE `/api/pengguna` | 사용자 | admin. 본인 삭제 불가 |
| POST `/api/ganti-sandi` | 비밀번호 변경 | 토큰의 id로만 |

### 트랜잭션

Neon HTTP 드라이버는 연결을 유지하지 않으므로 `sql.transaction([q1, q2, …])`로 여러 문장을 한 번의
HTTP 요청에 실어 원자적으로 실행합니다. 비대화형이라 중간 결과로 분기할 수 없어, 재고 부족 검사 같은
조건은 트랜잭션 앞에서 따로 조회합니다.

## 데이터베이스

스키마: [doc/neon-schema.sql](doc/neon-schema.sql)

| 테이블 | 요지 |
|---|---|
| `gudang`, `produk`, `pelanggan`, `pemasok`, `pengguna` | 마스터. id는 텍스트(`G1`, `P12`, `C3`, `U1`) |
| `stok_mutasi` | 재고 원장. `tipe ∈ {masuk, keluar, transfer, penyesuaian}`, `qty` 부호 포함, `ref`에 전표 번호 |
| `penjualan` + `penjualan_item` | SO 헤더/항목 |
| `pembelian` + `pembelian_item` | PO 헤더/항목 |

| 뷰 · 트리거 | 역할 |
|---|---|
| `v_stok` | `SUM(qty) GROUP BY gudang, produk` — 재고의 정의 |
| `v_stok_total` | 제품별 합계 |
| `v_penjualan` | SO 헤더 + 합계 금액 |
| `v_piutang` | 고객별 미수금(출고·청구 상태 SO 합) |
| `t_penjualan_kirim` | 상태가 `kirim`이 되면 항목별 `keluar` 원장 자동 생성 |
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

## 성능 특성 (2026-09-06 측정)

| 항목 | 값 |
|---|---|
| JS 번들 | 298KB, gzip 86KB, 단일 청크 (React 약 60KB gzip 포함) |
| 폰트 CSS | 1.5KB (이전 40KB) |
| Lighthouse 성능 / 접근성 / 모범사례 | 99 / 89 / 100 |
| FCP / LCP (모바일 시뮬레이션, 로그인 화면) | 1.4초 / 1.6초 |
| 초기 데이터 로드 | 함수 호출 1회 (`/api/bootstrap`) |

다음 개선 후보는 [CHANGELOG.md](CHANGELOG.md)의 "남은 과제"에 있습니다.
