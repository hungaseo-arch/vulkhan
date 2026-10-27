-- 20: 실제 변경. 'Lia의_아이디' 를 00 결과에서 확인한 Lia 의 username 으로 바꾼 뒤 실행하세요.
-- UPDATE 가 각각 1건이 아니면 COMMIT 대신 ROLLBACK.
BEGIN;

UPDATE pengguna SET peran = 'super' WHERE username = 'jhseo';
UPDATE pengguna SET peran = 'admin' WHERE username = 'Lia의_아이디';

-- 재확인
SELECT username, nama, peran FROM pengguna
WHERE username IN ('jhseo', 'Lia의_아이디');

COMMIT;
