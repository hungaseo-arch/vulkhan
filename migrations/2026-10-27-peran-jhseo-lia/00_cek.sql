-- 00: 확인만. jhseo 와 Lia 계정의 현재 역할, 그리고 super 역할이 허용되는지.
SELECT id, username, nama, peran FROM pengguna
WHERE username = 'jhseo' OR nama ILIKE '%lia%' OR username ILIKE '%lia%'
ORDER BY username;

-- 'super' 가 목록에 없으면 2026-10-23-peran-super-viewer 를 먼저 실행하세요.
SELECT pg_get_constraintdef(oid) AS definisi
FROM pg_constraint WHERE conname = 'pengguna_peran_check';
