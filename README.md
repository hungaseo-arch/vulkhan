# VULKHAN — 재생타이어(Vulkanisir) 재고·판매 관리

3개 창고(Karawang · Semarang · Surabaya)의 재고, 판매(SO), 구매(PO), 미수금(Piutang)을
한 화면에서 관리하는 업무 웹앱입니다. 화면 언어는 인도네시아어(기본)와 한국어를 버튼으로 전환합니다.

| 영역 | 기술 |
|---|---|
| 프런트엔드 | React 19 + Vite 8, 단일 파일 [src/App.jsx](src/App.jsx) |
| 백엔드 | Express 5 ([api-server.js](api-server.js)), Vercel 서버리스로 배포 |
| 데이터베이스 | Neon(PostgreSQL) — 스키마 [doc/neon-schema.sql](doc/neon-schema.sql) |
| 인증 | HMAC 서명 세션 토큰 + 3단계 역할(admin / manager / staff) |
| 다국어 | 인도네시아어 / 한국어, [src/i18n.jsx](src/i18n.jsx) |
| 배포 | Vercel (`vulkhan` 프로젝트), `npm run deploy` |

관련 문서: [ARCHITECTURE.md](ARCHITECTURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md)

## 주요 기능

- **Ringkasan** — 재고 가치, 월별 판매(창고별 수량 포함), 미수금 KPI, 음수 재고 경고
- **Stok Gudang** — 창고·카테고리·검색 필터, 창고 간 이동(transfer), 실사 조정(penyesuaian), 최근 500건 재고 원장
- **Penjualan** — 견적 → 주문 → 출고 → 청구 → 완납 5단계 상태 흐름, 견적서/인보이스 출력, 엑셀 내보내기
- **Pembelian** — 주문 → 입고 → 완납 3단계, 입고 시 재고 자동 반영
- **Pelanggan / Piutang** — 신용한도·결제조건, 연체 일수와 한도 사용률로 위험 등급 산출
- **Pengguna**(admin 전용) — 계정 생성·삭제, 본인 비밀번호 변경
- **언어 전환** — 헤더와 로그인 화면의 `ID / KO` 버튼. 선택은 `localStorage`에 남고 `<html lang>`도 함께 바뀝니다.
  출력용 faktur·penawaran 서류 본문은 인도네시아 거래처에 나가므로 언제나 인도네시아어입니다.

재고는 절대 직접 수정하지 않습니다. 모든 재고는 `stok_mutasi` 원장의 합계(`v_stok` 뷰)입니다.

## 빠른 시작

```bash
npm install

# 1) API 서버 (터미널 1)
DATABASE_URL="postgres://..." AUTH_SECRET="긴-비밀문자열" node api-server.js
#    → http://localhost:3001/api

# 2) 프런트엔드 (터미널 2)
npm run dev
#    → http://localhost:5173
```

개발 모드에서 프런트는 `http://localhost:3001/api`를 호출합니다. 다른 주소를 쓰려면
`VITE_API_URL`을 설정하세요. 프로덕션 빌드는 같은 도메인의 `/api`를 호출합니다.

### 환경 변수

| 변수 | 위치 | 설명 |
|---|---|---|
| `DATABASE_URL` | 서버 | Neon 연결 문자열 (필수) |
| `AUTH_SECRET` | 서버 | 세션 토큰 서명 키. 없으면 재시작마다 토큰이 무효화됨 |
| `CORS_ORIGIN` | 서버 | 허용 origin, 쉼표 구분. 기본값은 Vite 로컬 포트 |
| `PORT` | 서버 | 로컬 포트, 기본 3001 |
| `ADMIN_USER` / `ADMIN_PASS` / `ADMIN_NAMA` | 서버 | 관리자 계정 복구용. 로그인 확인 후 반드시 제거 |
| `VITE_API_URL` | 프런트 | API 베이스 URL 재정의 |

### 첫 로그인

`pengguna` 테이블이 비어 있으면 서버가 `admin / manager / staff` 기본 계정을 시드합니다.
가입 화면은 의도적으로 없습니다. 계정 추가는 admin이 앱의 Pengguna 탭에서 하거나,
아래 스크립트로 직접 만듭니다.

```bash
export DATABASE_URL="postgres://..."
npm run buat-admin -- <username>              # admin 생성 또는 비밀번호 리셋
npm run buat-admin -- <username> --peran staff
node scripts/buat-admin.mjs --list
```

## 스크립트

| 명령 | 동작 |
|---|---|
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |
| `npm run deploy` | lint → build → `vercel --prod` |
| `npm run buat-admin -- <user>` | 계정 생성/리셋 |

## 프로젝트 구조

```
api-server.js        Express 앱 (로컬 실행 + Vercel 핸들러 export)
api/index.js         Vercel 서버리스 진입점, api-server.js를 re-export
src/App.jsx          UI 전체 (탭, 폼, 문서 출력, 스타일)
src/i18n.jsx         번역 사전 + LangProvider / useLang()
src/api.js           fetch 래퍼 + 응답 정규화(NUMERIC 문자열 → number)
src/xlsx.js          의존성 없는 XLSX 작성기
public/              아센도 로고(symbol · signature), 파비콘, 아이콘 스프라이트
scripts/             운영 스크립트
migrations/          날짜별 데이터 마이그레이션 기록 (README + SQL + CSV)
doc/                 스키마 SQL, 작업 이력 (git 미추적)
vercel.json          /api/* → 서버리스 함수 rewrite
```

## 배포

```bash
npm run deploy
```

Vercel에서 `DATABASE_URL`, `AUTH_SECRET`을 프로덕션 환경 변수로 설정해 두어야 합니다.
`DATABASE_URL`은 sensitive로 표시되어 있어 `vercel env pull`로 가져올 수 없습니다.
DB 조회가 필요하면 Neon 콘솔에서 직접 실행하세요.
