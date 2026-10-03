// 도달 가능성 기반 트랙 선택 회귀 테스트
import assert from "node:assert/strict";
import { trackReachability, selectTrack } from "../lib/trackSelect.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

test("도달 가능성은 0~1", () => {
  const r = trackReachability({ g: 0.7, L: 0.5, tau: 2, rho: 0.15 });
  for (const g of ["R", "H", "C"]) assert.ok(r[g] >= 0 && r[g] <= 1, `${g} ${r[g]}`);
});

test("이득 낮은 관객은 공포를 안 고른다(도달 불가) — 로맨스/코미디로", () => {
  const sel = selectTrack({ g: 0.25, L: 0.5, tau: 2, rho: 0.2 });
  assert.notEqual(sel.track, "H", `골랐음 ${sel.track}`);
  assert.ok(sel.reach.R >= sel.reach.H, `R ${sel.reach.R} H ${sel.reach.H}`);
});

test("이득 높은 관객은 공포 도달 가능성이 낮은 관객보다 높고, 공포를 고른다", () => {
  const high = selectTrack({ g: 1.3, L: 0.5, tau: 2, rho: 0.05 });
  const low = trackReachability({ g: 0.25, L: 0.5, tau: 2, rho: 0.2 });
  assert.equal(high.track, "H", `골랐음 ${high.track}`);
  assert.ok(high.reach.H > low.H, `high.H ${high.reach.H} low.H ${low.H}`);
});

test("이득 높은 관객은 로맨스 도달 가능성이 떨어진다(낮은 상한을 넘어선다)", () => {
  const r = trackReachability({ g: 1.3, L: 0.5, tau: 2, rho: 0.05 });
  assert.ok(r.H > r.R, `H ${r.H} R ${r.R}`);
});

test("장르 성향을 섞으면 근소한 차이를 뒤집을 수 있다", () => {
  const theta = { g: 0.7, L: 0.5, tau: 2, rho: 0.15 };
  const noPrior = selectTrack(theta);
  const withH = selectTrack(theta, { genrePrior: { R: 0.1, H: 0.8, C: 0.1 }, priorWeight: 0.5 });
  assert.equal(withH.track, "H", `성향 반영 후 ${withH.track} (성향 전 ${noPrior.track})`);
});

test("reason 에 도달가능성 수치가 들어간다", () => {
  const sel = selectTrack({ g: 0.7, L: 0.5, tau: 2, rho: 0.15 });
  assert.ok(/도달가능성/.test(sel.reason), sel.reason);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
