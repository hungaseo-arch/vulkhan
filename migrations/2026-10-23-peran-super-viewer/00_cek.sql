-- 00: 확인만. 제약 이름이 pengguna_peran_check 인지 보세요(다르면 20번의 이름을 바꿔야 합니다).
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'pengguna'::regclass AND contype = 'c';

SELECT peran, COUNT(*) AS n, string_agg(username, ', ' ORDER BY username) AS akun
FROM pengguna GROUP BY peran ORDER BY peran;
