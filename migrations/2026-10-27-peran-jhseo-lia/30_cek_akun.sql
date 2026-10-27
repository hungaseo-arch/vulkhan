-- 30: 확인만. 전체 계정 — 로그인 언어 자동 판별(src/i18n.jsx ORANG_KOREA)이
-- 서종환·김재헌·진화석·서정재 계정을 알아보는지 username/nama 를 확인합니다.
SELECT username, nama, peran FROM pengguna ORDER BY peran, username;
