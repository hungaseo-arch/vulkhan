# 2026-10-23 — 역할 추가: 수퍼관리자(super) · 한국인(viewer)

> **사용자가 Neon 콘솔에서 실행합니다.** 앱 배포 **전에** 실행하세요.
> 배포가 먼저 되면 새 역할로 계정을 만들거나 바꿀 때 CHECK 제약에 걸려 실패합니다(기존 계정은 영향 없음).

## 배경

`pengguna.peran` 은 `CHECK (peran IN ('admin','manager','staff'))` 로 묶여 있습니다.
새 역할 두 개를 허용하도록 제약을 바꾸고, 첫 수퍼관리자를 지정합니다.

| 코드 | 화면 이름 | 권한 |
|---|---|---|
| `super` | 수퍼관리자 / Super Admin | 모든 권한 + 관리자·수퍼관리자 계정 관리 |
| `admin` | 관리자 / Admin | 지금과 같음. 단 관리자·수퍼관리자 계정은 만들거나 바꿀 수 없음 |
| `viewer` | 한국인 / Korea | 업무 화면 전부 조회만. 저장·수정·삭제·요청 불가 (본인 비밀번호 변경만 가능) |

## 순서

| 파일 | 내용 | 변경 |
|---|---|---|
| `00_cek.sql` | 현재 제약 이름·정의, 역할별 계정 | 없음 |
| `20_update.sql` | 제약 교체 + 수퍼관리자 지정 (트랜잭션) | **있음** |

`20_update.sql` 의 `'여기에_아이디'` 를 수퍼관리자가 될 username 으로 바꾼 뒤 실행하세요.
UPDATE 결과가 `UPDATE 1` 이 아니면 ROLLBACK 하세요.

## 되돌리기

viewer·super 계정을 모두 다른 역할로 바꾼 뒤 제약을 원래대로 돌립니다.

```sql
UPDATE pengguna SET peran = 'admin' WHERE peran = 'super';
UPDATE pengguna SET peran = 'staff' WHERE peran = 'viewer';
ALTER TABLE pengguna DROP CONSTRAINT pengguna_peran_check;
ALTER TABLE pengguna ADD CONSTRAINT pengguna_peran_check CHECK (peran IN ('admin','manager','staff'));
```

수퍼관리자로 바뀐 계정은 **로그아웃 후 다시 로그인**해야 새 권한이 적용됩니다(로그인 토큰에 역할이 들어 있음).
