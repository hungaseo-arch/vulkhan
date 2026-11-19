---
name: VULKHAN
description: 재생타이어 재고·판매·미수금 업무 웹앱. 아센도 BI 파랑 한 색과 흰 카드로 만든 한·인니 이중 언어 원장 화면.
colors:
  primary: "#0062C6"
  primary-hover: "#0053A8"
  primary-active: "#00458B"
  primary-on: "#FFFFFF"
  primary-tint-6: "#F0F6FC"
  primary-tint-10: "#E6EFF9"
  primary-tint-15: "#D9E7F6"
  primary-tint-20: "#CCE0F4"
  primary-tint-40: "#99C0E8"
  ink: "#333333"
  ink-muted: "#666666"
  page: "#F5F5F5"
  card: "#FFFFFF"
  wash: "#F3F3F3"
  wash-deep: "#EBEBEB"
  rule: "#D6D6D6"
  rule-soft: "#EBEBEB"
  success: "#1E7B34"
  success-soft: "#E6F4EA"
  success-line: "#A8D5B3"
  warning: "#8A5A00"
  warning-soft: "#FFF6E0"
  warning-line: "#F5D580"
  danger: "#C62828"
  danger-soft: "#FCE9E9"
  danger-line: "#F0A3A3"
  neutral: "#5F5F5F"
  neutral-soft: "#EDEDED"
  neutral-line: "#D6D6D6"
  chart-fill-blue: "#E3F2FD"
  chart-fill-grey: "#ECEFF1"
  chart-fill-sage: "#E8F5E9"
  chart-ink: "#546E7A"
typography:
  headline:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  table:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  kpi:
    fontFamily: "Noto Sans KR Variable, Noto Sans KR, Noto Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
  input-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  kpi-tile:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  table-head:
    backgroundColor: "{colors.primary-tint-6}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "9px 12px"
  badge:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-invoiced:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
  dialog:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    width: "440px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
---

# Design System: VULKHAN

## Overview

**Creative North Star: "The Ledger Desk"**

화면은 장부를 펼친 책상입니다. 흰 장부(카드) 한 장 한 장이 연한 회색 책상(`#F5F5F5`) 위에 놓이고, 파란 줄 하나가 머리글과 합계를 긋습니다. 숫자가 주인공이고 장식은 없습니다. 한국인 경영진과 인도네시아 직원이 같은 장부를 각자의 언어로 읽기 때문에, 모든 라벨은 두 언어가 함께 들어가도 깨지지 않는 자리를 가집니다.

이 시스템은 아센도 BI(ASM 디자인 가이드 v1.0)를 그대로 따릅니다. 브랜드 파랑 `#0062C6`과 본문색 `#333333`은 바꾸지 않는 지정색이고, 강조색은 파랑 하나뿐입니다. 성공·경고·위험 색은 상태를 알릴 때만 씁니다. 밀도는 업무용입니다. 표 행 38px, 본문 14px, 표 13px로 한 화면에 많은 행을 담되 숫자 열은 `tabular-nums`로 자릿수를 맞춥니다.

깊이는 거의 쓰지 않습니다. 카드는 1px 테두리로만 구분하고, 그림자는 화면 위로 떠 있는 층(모달, 드롭다운, 토스트, 눌러서 열리는 KPI 타일의 hover)에만 줍니다.

**Key Characteristics:**
- 파란 강조색 하나, 상태 색은 상태에만
- 흰 카드 + 1px 테두리, 평면 위주
- 숫자는 항상 tabular-nums, 숫자 열은 우측 정렬
- 화면 언어는 한 번에 하나(ID/KO 토글). 모든 문구는 두 언어를 갖추고, 라벨은 선택한 언어로만 그려집니다
- 하나의 글꼴(Noto Sans KR Variable), 굵기로만 위계를 만듦

## Colors

흰 장부와 회색 책상 위에 BI 파랑 한 색이 줄을 긋는 팔레트입니다. 중립색이 면의 대부분을 차지하고, 파랑은 면적의 10% 안쪽으로 씁니다.

### Primary
- **BI 파랑** (`#0062C6`): 주 버튼, 활성 탭 밑줄, 섹션 제목 왼쪽 3px 선, 표 머리글 밑줄(2px), KPI 왼쪽 3px 선, 모달 상단 4px 바, 링크성 강조. 변경 금지.
- **BI 파랑 hover / active** (`#0053A8` / `#00458B`): 주 버튼의 눌림 단계.
- **파랑 틴트 6·10·15·20·40** (`#F0F6FC` … `#99C0E8`): 6은 표 머리글·행 hover, 10은 선택된 단계·합계 행·칩, 40은 포커스 링과 보조 테두리.

### Neutral
- **장부 흰색** (`#FFFFFF`): 카드, 표, 입력칸, 모달 본문.
- **책상 회색** (`#F5F5F5`): 페이지 바탕.
- **먹색** (`#333333`): 본문과 제목. 모달 뒷배경 오버레이와 토스트 바탕도 같은 색.
- **보조 회색** (`#666666`): 보조 정보, 힌트, 비활성 텍스트.
- **옅은 회색** (`#F3F3F3`, `#EBEBEB`): hover 면, 모달 푸터, 비활성 입력.
- **괘선** (`#D6D6D6`, 옅은 `#EBEBEB`): 카드·입력 테두리 / 표 행 구분선.

### Status
- **성공 초록** (`#1E7B34` on `#E6F4EA`): 입고, 완납, 정상.
- **경고 호박색** (`#8A5A00` on `#FFF6E0`): 출고 단계, 조정, 주의 박스.
- **위험 빨강** (`#C62828` on `#FCE9E9`): 출고(재고 감소), 연체, 음수 재고, 입력 오류.
- **정보 파랑**은 BI 파랑과 같은 값을 씁니다(`info`).

### Chart fills
- **판매 화면 차트 면색** (`#E3F2FD`, `#ECEFF1`, `#E8F5E9`, 글자·선 `#546E7A`): 별도 문서(VLK-UI-2026-001 §7.1)를 따르는 판매 화면 전용 파스텔입니다. 면 채움에만 쓰고 텍스트색으로는 쓰지 않습니다(대비가 WCAG AA에 못 미침).

### Named Rules
**The One Blue Rule.** 강조는 BI 파랑 하나입니다. 표에 없는 새 강조색을 만들지 않습니다.
**The Status-Only Color Rule.** 초록·호박·빨강은 상태를 말할 때만 씁니다. 장식이나 구획 구분에 쓰지 않습니다.
**The Pastel-Fill Rule.** 차트 파스텔은 면 채움 전용입니다. 글자색으로 쓰면 읽히지 않습니다.

## Typography

**Display / Body Font:** Noto Sans KR Variable (대체: Noto Sans, Apple SD Gothic Neo, system-ui)
**Mono:** 따로 두지 않습니다. 숫자 정렬은 `font-variant-numeric: tabular-nums`로 처리합니다.

**Character:** 한 가족의 글꼴로 한글·라틴·인니어를 모두 같은 톤으로 보여 줍니다. 위계는 크기보다 굵기(400/500/700)로 만듭니다.

### Hierarchy
- **Headline** (700, 18px, 1.5): 섹션 제목. 왼쪽에 3px 파란 선.
- **Title** (700, 15px): 카드·모달 제목.
- **Body** (400, 14px, 1.5): 기본 본문과 입력.
- **Table** (400, 13px): 표 본문. 머리글은 12px / 500.
- **Label** (500, 12px): 폼 라벨, 표 머리글, KPI 라벨.
- **Caption** (400, 11px): 보조 정보, 힌트, 각주. 480px 이하에서는 10px 단계가 11px이 됩니다.
- **KPI** (700, `clamp(1.15rem, 8cqi, 1.5rem)`): 대시보드 큰 숫자. 컨테이너 너비를 따라갑니다.
- 크기 스케일은 10/11/12/13/14/15/18/20px 여덟 단계뿐입니다. 이 밖의 px 값을 새로 쓰지 않습니다.

### Named Rules
**The Eight-Step Rule.** 글자 크기는 `--asm-fs-*` 토큰으로만 지정합니다. 토큰 블록 밖에서 숫자를 직접 쓰지 않습니다.
**The Paper Exception.** 인쇄 서류 미리보기(`.doc-*`)는 종이 비율에 맞춘 별도 글자 크기(9.5/10/17/20px)와 `#8C8C8C` 뷰어 배경을 씁니다. 화면 UI에는 이 값을 쓰지 않습니다.
**The Tabular Rule.** 숫자가 들어가는 곳은 모두 tabular-nums, 숫자 열은 우측 정렬입니다.
**The Second-Language Rule.** 화면은 한 번에 한 언어로 그립니다. 탭·버튼·KPI·표 머리글에 두 언어를 겹쳐 쓰지 않고, 새 문구는 `src/i18n.jsx`에 ID/KO를 함께 만듭니다. 칸 안의 `em`은 부가 정보(코드, 날짜, 건수)용입니다.

## Layout

콘텐츠는 최대 1240px 가운데 정렬 컨테이너이고 좌우 20px 여백입니다(`.wrap`, 상하 24px). 페이지 흐름은 4px 파란 강조 바 → 헤더 → 탭 → 섹션 → 카드·표 순입니다. 간격은 4·8·12·16·20·24px 가닥으로 움직이고, 카드 사이는 16px입니다.

KPI는 `repeat(auto-fit, minmax(190px, 1fr))` 그리드에 12px 간격, 두 칸 레이아웃은 860px 이하에서 한 칸이 됩니다. 폼 두 칸(`.row2`)은 560px 이하에서 한 칸입니다. 표는 가로로 넘치면 `.scroll` 안에서 가로 스크롤하고, 양끝에 스크롤 그림자가 생깁니다. 그리드 자식은 `min-width: 0`으로 표가 페이지를 밀어내지 않게 합니다. 모바일 대응은 480/520/560/640/720/860/900px 중단점으로 이뤄지고, 터치 대상은 최소 30~36px입니다.

### Named Rules
**The Contain-the-Table Rule.** 넓은 표는 항상 `.scroll` 안에 가둡니다. 페이지가 옆으로 밀리면 안 됩니다.

## Elevation & Depth

평면 시스템입니다. 카드·입력·버튼은 그림자 없이 1px 테두리(`#D6D6D6`)만 가집니다. 면의 위계는 색 면(흰 카드 / 파란 틴트 / 옅은 회색)으로 만듭니다. 그림자는 화면 위에 떠 있는 층에만 있습니다.

### Shadow Vocabulary
- **중간** (`box-shadow: 0 4px 12px rgb(51 51 51 / .12)`): 검색 드롭다운(`combo-list`), 누를 수 있는 KPI 타일 hover, 로그인 카드.
- **깊은** (`box-shadow: 0 12px 32px rgb(51 51 51 / .18)`): 모달, 토스트.
- **포커스 링** (`box-shadow: 0 0 0 3px #99C0E8`): 버튼·입력·선택 상자의 `:focus-visible`.
- 모달 뒷배경은 `rgb(51 51 51 / .5)`.

### Named Rules
**The Flat-At-Rest Rule.** 가만히 있는 면에는 그림자가 없습니다. 그림자는 떠 있는 층(오버레이)이나 hover 반응에만 나타납니다.

## Shapes

모서리는 4/6/8px 세 단계입니다. 배지·칩은 4px, 버튼·입력·드롭다운은 6px, 카드·KPI·모달은 8px입니다. 테두리는 1px이고, 강조할 때는 한쪽만 굵게 줍니다(KPI·주의 박스 왼쪽 3px, 모달 상단 4px, 표 머리글 밑 2px). 사각 요소의 모서리는 8px을 넘지 않습니다(원형은 한 곳, 차트 막대 윗모서리는 3px).

## Components

### Buttons
- **Shape:** 6px 모서리, 최소 높이 36px(작은 30px, 큰 40px), 패딩 8px 16px.
- **Default:** 흰 바탕 + 회색 테두리 + 먹색 글자. hover에서 `#F3F3F3` 바탕, 파란 글자·테두리.
- **Primary:** BI 파랑 바탕 + 흰 글자. hover `#0053A8`, active `#00458B`.
- **Disabled:** 불투명도 .5, 포인터 이벤트 없음.
- **Focus:** 3px `#99C0E8` 링.

### Chips
- **필터 칩** (`chip-b`): 투명 바탕, 0.5px 청회색 테두리, 8px 모서리, 최소 높이 32px. 선택되면 `#E3F2FD` 바탕 + 파란 테두리·글자.
- **정보 칩** (`chip`): `#E6EFF9` 바탕 + 파란 글자, 4px 모서리.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** 흰색, 1px `#D6D6D6` 테두리, 그림자 없음.
- **Header:** 12px 16px 패딩, 아래 1px 괘선, 제목 15px/700.
- **KPI 타일:** 왼쪽 3px 파랑 선. 주의 단계는 호박색, 경고 단계는 빨강. 눌러서 열리는 타일만 hover에 중간 그림자.

### Inputs / Fields
- **Style:** 36px 높이, 6px 모서리, 흰 바탕, 1px 회색 테두리, 패딩 6px 12px.
- **Focus:** 테두리 파랑 + 3px 연파랑 링.
- **Error:** 빨간 테두리 + `#FCE9E9` 바탕. **Disabled:** `#F3F3F3`, 불투명도 .6.
- **Combo(검색 선택):** 드롭다운 목록 6px 패딩, 선택 항목 파랑 글자 700, 키보드 강조 항목은 `#E6EFF9` 바탕 + 2px 파란 윤곽선. 목록에 없는 글자는 빨간 안내.

### Tables
- **머리글:** `#F0F6FC` 바탕, 2px 파란 밑줄, 12px/500, 위쪽 고정(sticky). 정렬 가능한 열은 전체 셀이 버튼.
- **행:** 높이 38px, 1px `#EBEBEB` 구분선, hover `#F0F6FC`.
- **합계:** 위쪽 2px 파란 선, 합계 행은 `#E6EFF9` 바탕 + 파란 700 글자.

### Badges / Status
- 4px 모서리, 11px/700, 자간 .04em, 1px 테두리. 기본은 중립 회색.
- 입고·완납=초록, 출고·위험=빨강, 이동·주문=파랑 연한색, 조정·출고 단계=호박. **청구(tagihan)만 파랑 바탕 + 흰 글자**로 주문과 구분합니다.
- 고객 등급 A/B/C는 같은 배지에 색을 달리하고, 등급 없음은 점선 테두리입니다.

### Navigation
- **탭:** 투명 바탕, 아래 2px 밑줄. 기본은 보조 회색 500, hover는 회색 면, 활성은 파랑 700 + 파란 밑줄. 좁은 화면에서는 가로 스크롤, 양끝 그림자.
- **단계 흐름(`step`):** 견적 → 주문 → 출고 → 청구 → 완납. 카드형, 활성은 `#E6EFF9` 바탕 + 아래 3px 파랑.

### Dialogs
- 8px 모서리, 위 4px 파란 바, 440px(넓은 것은 720px), 화면 폭 -20px 이내, 높이 `100dvh - 20px`. 본문만 스크롤하고 머리·푸터는 고정. 푸터는 `#F3F3F3` 바탕에 오른쪽 정렬 버튼.

### Toast
- 먹색 바탕 + 흰 글자, 왼쪽 4px 상태선(초록/빨강), 아래 중앙, 0.22초 아래에서 올라옴. `prefers-reduced-motion: no-preference`일 때만 움직입니다.

### Loading
- 스켈레톤은 `#D6D6D6` 막대가 1.2초 간격으로 깜빡이며(`prefers-reduced-motion: no-preference`에서만) 카드 모양을 미리 보여 줍니다.

### Signature: 언어 토글
- 같은 데이터를 ID/KO 어느 쪽으로든 읽습니다. 로그인 시 사용자에 맞춰 시작 언어가 정해지고, 헤더의 ID/KO 버튼으로 바꿉니다. 인쇄 서류(faktur·penawaran)만 언제나 인도네시아어입니다.

## Do's and Don'ts

### Do:
- **Do** 강조는 BI 파랑(`#0062C6`)만 쓰고 면적을 작게 유지합니다.
- **Do** 글자 크기는 `--asm-fs-*` 토큰으로, 색은 `--asm-*` 토큰으로 지정합니다.
- **Do** 숫자 열은 우측 정렬 + tabular-nums로 둡니다.
- **Do** 새 문구는 ID/KO 두 언어를 함께 만듭니다.
- **Do** 클릭 대상은 최소 30px(주요 컨트롤은 36px) 이상으로 유지하고 포커스 링을 지우지 않습니다.
- **Do** 넓은 표는 `.scroll`에 가두고 그리드 자식에 `min-width: 0`을 줍니다.
- **Do** 모션은 `prefers-reduced-motion: no-preference` 안에서만 넣습니다.

### Don't:
- **Don't** 표에 없는 새 강조색을 만들거나 BI 파랑·먹색 값을 바꾸지 않습니다.
- **Don't** 초록·호박·빨강을 상태 표시 밖에서 장식으로 쓰지 않습니다.
- **Don't** 차트 파스텔(`#E3F2FD` 등)을 글자색으로 쓰지 않습니다. 대비가 모자랍니다.
- **Don't** 평면 카드·버튼·입력에 그림자를 더하지 않습니다. 그림자는 떠 있는 층에만 씁니다.
- **Don't** 두 언어를 한 줄에 `/`로 이어 붙이지 않습니다.
- **Don't** 10~20px 스케일 밖의 글자 크기를 새로 만들지 않습니다.
- **Don't** 인쇄 서류(faktur·penawaran)의 스타일과 화면 스타일을 섞지 않습니다. 인쇄 문서는 자체 스케일과 인니어 본문을 따로 가집니다.
