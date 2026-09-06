# 기여 가이드

## 개발 환경

1. Node 20 이상, `npm install`
2. Neon 연결 문자열을 준비하고 [README.md](README.md)의 "빠른 시작"대로 API 서버와 Vite를 띄웁니다.
3. 로컬 DB가 없다면 서버 없이도 프런트는 뜹니다. 로그인은 온라인일 때만 가능하며, 오프라인이면
   `SEED_*` 데모 데이터로 화면만 확인할 수 있습니다.

## 작업 흐름

- `main`에서 직접 작업하지 말고 브랜치를 만듭니다.
- 커밋 전 반드시 실행:
  ```bash
  npm run lint && npm run build && node --check api-server.js
  ```
- 커밋 제목은 영어 명령형 한 줄로 씁니다. 기존 이력 예:
  `Fix warehouse selector defaulting to a nonexistent id in 4 forms`
- 사용자에게 보이는 변경은 [CHANGELOG.md](CHANGELOG.md)의 `[Unreleased]`에 한 줄 추가합니다.
- 배포는 `npm run deploy`. lint와 build가 실패하면 배포되지 않습니다.

## 코드 규칙

**언어.** 식별자, 주석, UI 문자열은 인도네시아어입니다(`pelanggan`, `gudang`, `say()`).
문서(README, CHANGELOG 등)는 한국어입니다. 새 코드도 이 규칙을 따릅니다.

**단일 파일 프런트.** [src/App.jsx](src/App.jsx)는 의도적으로 한 파일입니다. 섹션 구분 주석
(`/* ==== PENJUALAN ==== */`)을 지키고, 새 탭은 `App()`의 `TABS`와 `<main>` 분기에 함께 추가합니다.
스타일은 파일 끝 `Style()` 컴포넌트의 CSS 문자열에 넣고, 선택자는 `.vk` 접두를 붙입니다.

**날짜.** 오늘 날짜는 `today()`로 얻습니다. 날짜 문자열 상수를 하드코딩하지 마세요.
DB의 DATE 컬럼은 서버가 `'YYYY-MM-DD'` 문자열 그대로 돌려줍니다(타임존 이동 방지).

**숫자.** Neon은 NUMERIC을 문자열로 돌려줍니다. 새 숫자 필드는 [src/api.js](src/api.js)의
`norm*` 함수에서 `num()`으로 변환한 뒤 UI에 넘깁니다.

**재고.** `stok_mutasi`에 행을 추가할 뿐, 재고 값을 직접 UPDATE하는 코드는 넣지 않습니다.
온라인일 때 클라이언트 재고는 서버 `v_stok`에서 오며, 화면의 원장 목록(최근 500건)을
합산해서 재고를 만들면 안 됩니다.

**상태 흐름.** SO/PO 상태는 `SO_FLOW` / `PO_FLOW` 순서로 한 단계씩만 전진합니다. 이 배열은
[src/App.jsx](src/App.jsx)와 [api-server.js](api-server.js)에 각각 있으므로 둘을 함께 수정합니다.

**권한.** 프런트의 `can()`은 버튼을 숨길 뿐입니다. 실제 보호는 서버의 `requireRole()`이며,
새 라우트에 삭제·관리 성격이 있으면 서버에서 역할을 다시 검사합니다.

## 엔드포인트 추가 절차

1. [api-server.js](api-server.js)에 `app.<method>("/api/...", wrap(async (req, res) => {...}))` 추가.
   여러 문장을 쓰는 쓰기 작업은 `sql.transaction([...])`로 묶습니다.
2. 초기 로드에 포함될 데이터라면 `/api/bootstrap`의 `Promise.all`에 쿼리를 추가합니다.
3. [src/api.js](src/api.js)의 `api` 객체에 호출 함수를 추가하고 필요하면 `norm*`을 만듭니다.
4. [src/App.jsx](src/App.jsx)에서 `online`이면 API 호출 후 `reload()`, 오프라인이면 메모리 상태만
   갱신하는 기존 `do*` 패턴을 따릅니다.

## 데이터 마이그레이션

스키마나 데이터를 바꾸는 작업은 `migrations/YYYY-MM-DD-<slug>/` 폴더에 기록합니다.

- `README.md` — 목적, 영향 범위, 실행 결과(건수), 미해결 사항
- `00_*.sql` 확인 쿼리 → `10_*.sql` 스테이징 → `20_*.sql` 반영, 번호 순으로 실행
- 원본 CSV를 같은 폴더에 둡니다.
- 실행 전 dry-run 쿼리로 영향 건수를 확인하고 README에 남깁니다.
- 초안 단계의 SQL을 남길 때는 README 상단에 "실행 금지" 표시를 합니다.

`doc/`는 git에 추적되지 않으므로 팀이 봐야 하는 내용은 루트 문서나 `migrations/`에 둡니다.

## 수동 테스트 체크리스트

배포 전 프로덕션 빌드(`npm run preview`)에서 확인합니다.

- [ ] 로그인 → 데이터 로드 1회 요청(`/api/bootstrap`)으로 완료
- [ ] 판매 생성 → 상태 전진 → 출고 시 재고 감소, 재고 부족 시 거부
- [ ] 창고 이동 후 양쪽 창고 재고 반영
- [ ] 삭제(manager 이상)로 전표·항목·원장 행이 함께 제거
- [ ] 신규 전표의 기본 날짜가 오늘, 전표 번호 접두가 이번 달
- [ ] 엑셀 내보내기 파일명에 오늘 날짜

## 비밀 정보

`.env*`, `.vercel/`은 커밋하지 않습니다. 비밀번호는 스크립트 프롬프트로만 입력하고 파일이나
셸 히스토리에 남기지 않습니다. `ADMIN_USER`/`ADMIN_PASS`는 복구 후 즉시 Vercel에서 제거합니다.
