-- D5 (선택) 출고일 없이 들어온 옛 전표에 전표일을 출고일로 채웁니다.
-- 앱은 이미 이 경우 전표일을 "(전표일)" 표시로 보여 주므로 꼭 실행할 필요는 없습니다.

-- 1) 읽기 전용: 대상 건수
SELECT status, count(*) FROM penjualan
WHERE tgl_kirim IS NULL AND status IN ('kirim','tagihan','lunas')
GROUP BY status ORDER BY status;

-- 2) 채우기 — 1번 결과를 보고 결정한 뒤 실행
-- BEGIN;
-- UPDATE penjualan SET tgl_kirim = tgl WHERE tgl_kirim IS NULL AND status IN ('kirim','tagihan','lunas');
-- COMMIT;
