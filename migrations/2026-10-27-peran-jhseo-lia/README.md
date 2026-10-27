# 2026-10-27 — 역할 지정: jhseo = 수퍼관리자, Lia = 관리자

> **사용자가 Neon 콘솔에서 실행합니다.** 스키마 변경은 없고 두 계정의 `peran` 만 바꿉니다.
> `2026-10-23-peran-super-viewer` 가 먼저 적용돼 있어야 합니다(`'super'` 허용).

| 파일 | 내용 | 변경 |
|---|---|---|
| `00_cek.sql` | 두 계정의 현재 역할, 역할 제약 정의 | 없음 |
| `20_update.sql` | jhseo → super, Lia → admin (트랜잭션) | **있음** |

`20_update.sql` 의 `'Lia의_아이디'` 를 00 결과의 username 으로 바꾼 뒤 실행하세요.
역할이 바뀐 계정은 **로그아웃 후 다시 로그인**해야 새 권한이 적용됩니다.

## 실행 결과 (2026-10-27)

- 00: `jhseo`(U1, nama `SEO`) = admin, `lia`(U-W7JG0E, nama `LIA`) = admin
- 20: jhseo → super `UPDATE 1`. Lia 줄은 자리표시자 그대로 실행돼 0건이었지만, 이미 admin 이라 변경 불필요.
- `30_cek_akun.sql` 은 로그인 언어 판별용 확인 쿼리(변경 없음).

## 되돌리기

00 결과에서 본 원래 역할로 되돌립니다.

```sql
UPDATE pengguna SET peran = '<원래 역할>' WHERE username = 'jhseo';
UPDATE pengguna SET peran = '<원래 역할>' WHERE username = '<Lia의 아이디>';
```
