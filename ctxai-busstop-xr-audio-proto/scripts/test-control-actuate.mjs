// 연속 파라미터 액추에이터 회귀 테스트 — 범위·데드밴드·방향·슬루·관객별 이득·상한·OFF=항등·실제로 움직인 양(B116)
import assert from "node:assert/strict";
import { actuationFor, applyActuation, bgmScale, offsetsFor, actuationEffect, actuationText, AXES, RANGES, ACTUATED_KEYS, ACTUATE_PARAMS } from "../lib/controlActuate.js";
import { deriveParams, ANCHORS } from "../lib/directionMap.js";
import { curveAt } from "../lib/tensionCurve.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const PRIOR = { g: 0.6 };
/** 같은 입력으로 steps 틱 돌린 마지막 결과 */
function run(args, steps = 40, dt = 0.25) {
  let prev = null;
  for (let i = 0; i < steps; i++) prev = actuationFor({ ...args, prev, dt });
  return prev;
}
// 판정 뒤 대표 상태 — 트랙이 우세하고 정착한 연출 벡터
const STATES = {
  H: { R: 0.1, H: 0.8, C: 0.1 },
  R: { R: 0.8, H: 0.1, C: 0.1 },
  C: { R: 0.1, H: 0.1, C: 0.8 },
};

test("데드밴드: 목표 ± 허용폭 안이면 hold, 오프셋 전부 0", () => {
  for (const track of ["H", "R", "C"]) {
    for (const xhat of [0.5, 0.45, 0.55, 0.41, 0.59]) {
      const r = actuationFor({ xhat, target: 0.5, tol: 0.1, ceiling: 0.9, track, theta: PRIOR });
      assert.equal(r.mode, "hold", `${track} x̂ ${xhat}`);
      assert.equal(r.u, 0);
      for (const k of ACTUATED_KEYS) assert.equal(r.offsets[k], 0, `${track} ${k}`);
    }
  }
});

test("데드밴드: 밖에 있다가 안으로 들어오면 오프셋이 0 으로 서서히 돌아간다", () => {
  const out = run({ xhat: 0.1, target: 0.6, tol: 0.1, ceiling: 0.9, track: "H", theta: PRIOR });
  assert.ok(out.u > 0.9, `포화 ${out.u}`);
  let prev = out;
  const us = [];
  for (let i = 0; i < 30; i++) { prev = actuationFor({ xhat: 0.6, target: 0.6, tol: 0.1, ceiling: 0.9, track: "H", theta: PRIOR, prev, dt: 0.25 }); us.push(prev.u); }
  for (let i = 1; i < us.length; i++) assert.ok(us[i] <= us[i - 1] + 1e-9, "단조 감소");
  assert.equal(us[us.length - 1], 0);
});

test("방향(각성): 목표 아래 → 공포는 침묵↑·안개↑·가로등↑·거리↑·시선↓, BGM↑", () => {
  const r = run({ xhat: 0.2, target: 0.7, tol: 0.1, ceiling: 0.92, track: "H", theta: PRIOR });
  assert.equal(r.mode, "arouse");
  const o = r.offsets;
  assert.ok(o.npcSilence > 0 && o.fogDensity > 0 && o.lampOn > 0 && o.npcDistance > 0 && o.npcGaze < 0 && o.bgmGain > 0, JSON.stringify(o));
});

test("방향(각성): 로맨스는 침묵↓·거리↓·시선↑·BGM↑, 가로등은 그대로", () => {
  const r = run({ xhat: 0.1, target: 0.55, tol: 0.12, ceiling: 0.75, track: "R", theta: PRIOR });
  const o = r.offsets;
  assert.ok(o.npcSilence < 0 && o.npcDistance < 0 && o.npcGaze > 0 && o.bgmGain > 0, JSON.stringify(o));
  assert.equal(o.lampOn, 0);
});

test("방향(이완): 목표 위 → 각 트랙 오프셋의 부호가 각성과 정반대", () => {
  for (const track of ["H", "R", "C"]) {
    const up = run({ xhat: 0.1, target: 0.5, tol: 0.1, ceiling: 0.9, track, theta: PRIOR });
    const down = run({ xhat: 0.85, target: 0.5, tol: 0.1, ceiling: 0.9, track, theta: PRIOR });
    assert.equal(down.mode, "relax", track);
    for (const k of ACTUATED_KEYS) {
      if (!AXES[track][k]) continue;
      assert.equal(Math.sign(up.offsets[k]), -Math.sign(down.offsets[k]), `${track} ${k}`);
    }
  }
});

test("방향표는 directionMap 앵커가 중립에서 떨어진 방향과 같은 부호다(연속 파라미터 5종)", () => {
  for (const track of ["H", "R", "C"]) {
    for (const k of ["npcSilence", "lampOn", "fogDensity", "npcDistance", "npcGaze"]) {
      const a = AXES[track][k];
      if (!a) continue;
      const d = ANCHORS[track][k] - ANCHORS.neutral[k];
      assert.equal(Math.sign(a), Math.sign(d), `${track} ${k}: 방향표 ${a} / 앵커 차 ${d.toFixed(3)}`);
    }
  }
});

test("슬루: 한 틱에 u 는 SLEW·dt 이상 바뀌지 않는다", () => {
  let prev = null;
  for (let i = 0; i < 25; i++) {
    const xhat = i % 2 ? 0.0 : 1.0; // 매 틱 극단을 오가는 x̂
    const r = actuationFor({ xhat, target: 0.5, tol: 0.1, ceiling: 0.9, track: "H", theta: PRIOR, prev, dt: 0.25 });
    const u0 = prev ? prev.u : 0;
    assert.ok(Math.abs(r.u - u0) <= ACTUATE_PARAMS.SLEW * 0.25 + 1e-9, `Δu ${Math.abs(r.u - u0)}`);
    prev = r;
  }
});

test("관객별 이득: 같은 오차에서 이득 낮은 관객이 더 세게, 높은 관객이 더 약하게 민다", () => {
  const args = { xhat: 0.5, target: 0.7, tol: 0.1, ceiling: 0.92, track: "H" };
  const low = actuationFor({ ...args, theta: { g: 0.3 } });
  const mid = actuationFor({ ...args, theta: { g: 0.6 } });
  const high = actuationFor({ ...args, theta: { g: 1.6 } });
  assert.ok(low.uTarget > mid.uTarget && mid.uTarget > high.uTarget, `${low.uTarget} ${mid.uTarget} ${high.uTarget}`);
  assert.equal(mid.gScale, 1);
  assert.ok(low.gScale <= ACTUATE_PARAMS.G_SCALE_MAX && high.gScale >= ACTUATE_PARAMS.G_SCALE_MIN);
});

test("상한: x̂ 이 상한을 넘으면 같은 초과폭이라도 이완이 더 세다", () => {
  // 목표 0.5·허용 0.1 → 위쪽 경계 0.6. 상한 0.7 이면 x̂ 0.75 는 상한을 0.05 넘는다.
  const capped = actuationFor({ xhat: 0.75, target: 0.5, tol: 0.1, ceiling: 0.7, track: "C", theta: { g: 2 } });
  const loose = actuationFor({ xhat: 0.75, target: 0.5, tol: 0.1, ceiling: 1.0, track: "C", theta: { g: 2 } });
  assert.ok(capped.uTarget < loose.uTarget, `${capped.uTarget} vs ${loose.uTarget}`);
});

test("범위: 어떤 입력·어떤 상태에서도 적용 결과가 요청서 §2.7 범위 안", () => {
  const tracks = ["H", "R", "C"];
  for (const track of tracks) {
    for (const settled of [0, 0.5, 1]) {
      for (const st of Object.values(STATES)) {
        const base = deriveParams(st, settled);
        for (const xhat of [0, 0.3, 0.6, 1]) {
          for (const g of [0.1, 0.6, 3]) {
            const r = run({ xhat, target: 0.5, tol: 0.1, ceiling: 0.8, track, theta: { g } });
            const p = applyActuation(base, r.offsets);
            for (const k of ACTUATED_KEYS) {
              if (k === "bgmGain") continue;
              const [lo, hi] = RANGES[k];
              const okLo = p[k] >= Math.min(lo, base[k]) - 1e-9, okHi = p[k] <= Math.max(hi, base[k]) + 1e-9;
              assert.ok(okLo && okHi, `${track} ${k}=${p[k]} base ${base[k]}`);
            }
            const s = bgmScale(r.offsets);
            assert.ok(s >= RANGES.bgmGain[0] && s <= RANGES.bgmGain[1]);
          }
        }
      }
    }
  }
});

test("OFF=항등: active=false 면 오프셋이 정확히 0 이고 적용 결과가 원래 값과 같다", () => {
  const warm = run({ xhat: 0.1, target: 0.7, tol: 0.1, ceiling: 0.92, track: "H", theta: PRIOR });
  const off = actuationFor({ xhat: 0.1, target: 0.7, tol: 0.1, ceiling: 0.92, track: "H", theta: PRIOR, prev: warm, active: false });
  assert.equal(off.mode, "off");
  assert.equal(off.u, 0, "비활성이면 슬루 없이 즉시 0");
  const base = deriveParams(STATES.H, 1);
  assert.deepEqual(applyActuation(base, off.offsets), base);
  assert.equal(bgmScale(off.offsets), 1);
});

test("OFF=항등: 트랙이 없거나(판정 전) x̂ 이 없으면 구동하지 않는다", () => {
  assert.equal(actuationFor({ xhat: 0.1, target: 0.7, tol: 0.1, track: null }).mode, "off");
  const r = actuationFor({ xhat: null, target: 0.7, tol: 0.1, track: "H", theta: PRIOR });
  assert.equal(r.mode, "hold");
  assert.equal(r.u, 0);
});

test("applyActuation 은 입력을 바꾸지 않고, 연속 6종 밖의 키(triggers 등)는 그대로 둔다", () => {
  const base = deriveParams(STATES.H, 1);
  const snapshot = JSON.stringify(base);
  const p = applyActuation(base, offsetsFor("H", -1));
  assert.equal(JSON.stringify(base), snapshot);
  assert.equal(p.triggers, base.triggers);
  assert.deepEqual(p.skyTop, base.skyTop);
  assert.ok(p.fogDensity < base.fogDensity && p.lampOn < base.lampOn);
});

test("실제 곡선 위에서: 공포 트랙 90초, 차분한 관객(x̂ 0.2)은 각성, 과민한 관객(x̂ 0.95)은 이완", () => {
  const tgt = curveAt("H", 90);
  const calm = run({ xhat: 0.2, ...tgt, track: "H", theta: { g: 0.35 } });
  const jumpy = run({ xhat: 0.95, ...tgt, track: "H", theta: { g: 1.5 } });
  assert.equal(calm.mode, "arouse");
  assert.equal(jumpy.mode, "relax");
  const base = deriveParams(STATES.H, 1);
  const pc = applyActuation(base, calm.offsets), pj = applyActuation(base, jumpy.offsets);
  assert.ok(pc.fogDensity > pj.fogDensity && pc.npcSilence > pj.npcSilence && pc.npcDistance > pj.npcDistance, "두 관객의 무대가 다르다");
  console.log(`    공포 90s 목표 ${tgt.target.toFixed(2)} — 차분 u=${calm.u} 안개 ${pc.fogDensity.toFixed(3)} 침묵 ${pc.npcSilence.toFixed(2)}s 거리 ${pc.npcDistance.toFixed(2)}m BGM×${bgmScale(calm.offsets).toFixed(2)}`);
  console.log(`                        과민 u=${jumpy.u} 안개 ${pj.fogDensity.toFixed(3)} 침묵 ${pj.npcSilence.toFixed(2)}s 거리 ${pj.npcDistance.toFixed(2)}m BGM×${bgmScale(jumpy.offsets).toFixed(2)} 가로등 ${pj.lampOn.toFixed(2)}`);
});

// B75 — 미세 자극 뒤 멈춤 창. 상황: 각성으로 u 가 올라 있던 관객에게 미세 자극이 울렸고, 그 과도 응답으로
// x̂ 이 상한 위로 치솟았다. 창이 없으면 연속 손이 곧바로 이완으로 맞선다.
const HOLD = ACTUATE_PARAMS.HOLD_AFTER_MICRO;
const SPIKE = { xhat: 0.95, target: 0.4, tol: 0.1, ceiling: 0.7, track: "C", theta: PRIOR };
function warmArouse() { return run({ xhat: 0.1, target: 0.5, tol: 0.1, ceiling: 0.7, track: "C", theta: PRIOR }); }

test("B75 멈춤 창: 미세 자극 뒤 HOLD 초 동안은 u·오프셋이 직전 값 그대로(mode settle) — 과도 응답에 이완으로 맞서지 않는다", () => {
  const warm = warmArouse();
  assert.ok(warm.u > 0.9, `각성 포화 ${warm.u}`);
  let prev = warm;
  const fireAt = 90;
  for (let t = fireAt; t < fireAt + HOLD - 1e-9; t += 0.25) {
    const r = actuationFor({ ...SPIKE, prev, dt: 0.25, tNow: t, lastMicroAt: fireAt });
    assert.equal(r.mode, "settle", `t ${t}`);
    assert.equal(r.u, warm.u, `t ${t} u 불변`);
    assert.deepEqual(r.offsets, warm.offsets);
    assert.ok(r.uTarget < 0 && r.err < 0, "기록용 uTarget·err 은 '창이 없었다면' 이완 쪽");
    assert.ok(Math.abs(r.settleLeft - (fireAt + HOLD - t)) < 1e-9, `남은 창 ${r.settleLeft}`);
    prev = r;
  }
  // 창이 끝나면 그때의 x̂ 으로 다시 판단한다 — 여전히 상한 위면 이제 이완(슬루 제한 그대로)
  const after = actuationFor({ ...SPIKE, prev, dt: 0.25, tNow: fireAt + HOLD, lastMicroAt: fireAt });
  assert.equal(after.mode, "relax");
  assert.ok(after.u < warm.u && warm.u - after.u <= ACTUATE_PARAMS.SLEW * 0.25 + 1e-9, `창 뒤 첫 틱 ${warm.u}→${after.u}`);
});

test("B75 멈춤 창: 창이 없던 때(HOLD 0)와 비교하면 창 안에서만 다르고, lastMicroAt 이 없거나 창 밖이면 종전과 같다", () => {
  const warm = warmArouse();
  const noHold = { ...ACTUATE_PARAMS, HOLD_AFTER_MICRO: 0 };
  const a = actuationFor({ ...SPIKE, prev: warm, dt: 0.25, tNow: 91, lastMicroAt: 90 }, noHold);
  assert.equal(a.mode, "relax", "창이 없으면 곧바로 이완");
  assert.ok(a.u < warm.u);
  const base = actuationFor({ ...SPIKE, prev: warm, dt: 0.25 });
  for (const extra of [{}, { tNow: 91 }, { lastMicroAt: 90 }, { tNow: 90 + HOLD, lastMicroAt: 90 }, { tNow: 200, lastMicroAt: 90 }, { tNow: 89, lastMicroAt: 90 }]) {
    assert.deepEqual(actuationFor({ ...SPIKE, prev: warm, dt: 0.25, ...extra }), base, JSON.stringify(extra));
  }
});

test("B75 멈춤 창: 비활성(OFF·트랙 없음)은 창 안에서도 즉시 0 — 창이 OFF=항등을 깨지 않는다", () => {
  const warm = warmArouse();
  const off = actuationFor({ ...SPIKE, prev: warm, active: false, tNow: 91, lastMicroAt: 90 });
  assert.equal(off.mode, "off"); assert.equal(off.u, 0);
  for (const k of ACTUATED_KEYS) assert.equal(off.offsets[k], 0);
  assert.equal(actuationFor({ ...SPIKE, track: null, prev: warm, tNow: 91, lastMicroAt: 90 }).mode, "off");
});

// B116 — 모니터 "연속 구동" 줄은 오프셋이 아니라 무대가 받은 양을 적는다. 공포 트랙은 판정 뒤 lampEarlyOn 이
// base 가로등을 1.0 으로 켜 두므로 각성 오프셋 +0.6 이 전부 잘린다(bias=H 녹화 2:22 에 "가로등 +0.58" 이 찍혔던 자리).
test("B116 포화 축: 공포 트랙(lampEarlyOn 켜짐)에서 각성하면 가로등은 '포화(1.00)', 나머지 축은 실제 Δ", () => {
  const base = deriveParams(STATES.H, 1);
  assert.equal(base.triggers.lampEarlyOn, true, "대표 H 상태에서 트리거가 켜져 있어야 이 테스트가 뜻이 있다");
  assert.equal(base.lampOn, 1);
  const off = offsetsFor("H", 1);
  const eff = Object.fromEntries(actuationEffect(base, off).map((e) => [e.key, e]));
  assert.equal(eff.lampOn.saturated, true);
  assert.equal(eff.lampOn.delta, 0);
  assert.equal(eff.lampOn.offset, AXES.H.lampOn);
  for (const k of ["npcSilence", "fogDensity", "npcDistance", "npcGaze"]) {
    assert.equal(eff[k].saturated, false, k);
    assert.ok(Math.abs(eff[k].delta - applyActuation(base, off)[k] + base[k]) < 1e-9, `${k} Δ = 적용 − 기준`);
  }
  const text = actuationText(off, base);
  assert.match(text, /가로등 포화\(1\.00\)/);
  assert.doesNotMatch(text, /가로등 \+/, "포화 축에 + 값을 적지 않는다");
  assert.match(text, /BGM ×1\.35/);
  console.log(`    공포 u=+1 → ${text}`);
  console.log(`    (종전 오프셋 표기 → ${actuationText(off)})`);
});

test("B116 비포화 축: 가로등이 아직 덜 켜진 상태(트리거 전)면 같은 오프셋이 실제 Δ 로 적힌다 — 같은 문구가 한쪽에서만 참이던 문제", () => {
  // 무편향 seed 2 처럼 판정은 H 인데 H 가중이 lampEarlyOn 문턱(0.42) 아래인 순간
  const state = { R: 0.35, H: 0.4, C: 0.25 };
  const base = deriveParams(state, 1);
  assert.equal(base.triggers.lampEarlyOn, false);
  assert.ok(base.lampOn < 0.5, `기준 가로등 ${base.lampOn}`);
  const off = offsetsFor("H", 0.5);
  const lamp = actuationEffect(base, off).find((e) => e.key === "lampOn");
  assert.equal(lamp.saturated, false);
  assert.equal(lamp.clipped, false);
  assert.ok(Math.abs(lamp.delta - off.lampOn) < 1e-9);
  assert.match(actuationText(off, base), /가로등 \+0\.30/);
});

test("B116 일부만 움직인 축은 '(한계)' — 범위 끝에 닿으면 Δ 가 오프셋보다 작다", () => {
  const base = { npcSilence: 2.3, npcDistance: 0.9, npcGaze: 0.5, lampOn: 0.2, fogDensity: 0.05 };
  const off = { ...offsetsFor("H", 0), npcSilence: 0.6 };
  const e = actuationEffect(base, off);
  assert.equal(e.length, 1);
  assert.equal(e[0].clipped, true);
  assert.ok(Math.abs(e[0].delta - (RANGES.npcSilence[1] - 2.3)) < 1e-9);
  assert.equal(actuationText(off, base), "침묵 +0.20s(한계)");
  // 이미 범위 밖인 기준값(작가 앵커)은 더 밀지 않는다 → 포화
  assert.equal(actuationText({ ...off, npcSilence: 0.3 }, { ...base, npcSilence: 2.8 }), "침묵 포화(2.80s)");
});

test("B116 표기 규칙: 오프셋 0 이면 '오프셋 0', base 없이 부르면 종전 오프셋 표기, 음수 이완도 실제 Δ", () => {
  const base = deriveParams(STATES.H, 1);
  assert.equal(actuationText(offsetsFor("H", 0), base), "오프셋 0");
  assert.equal(actuationText(null, base), "오프셋 0");
  assert.equal(actuationText(offsetsFor("H", 1)), "침묵 +0.60s · BGM ×1.35 · 가로등 +0.60 · 안개 +0.020 · 거리 +0.20m · 시선 -10%");
  // 이완(u −1): 가로등 1.0 → 0.4 로 실제로 내려간다 — 포화는 각성 쪽에서만
  const relax = actuationText(offsetsFor("H", -1), base);
  assert.match(relax, /가로등 -0\.60/);
  assert.doesNotMatch(relax, /포화/);
  // 로맨스·코미디 트랙은 가로등 축이 없다 — 줄에 가로등이 나오지 않는다
  for (const tr of ["R", "C"]) assert.doesNotMatch(actuationText(offsetsFor(tr, 1), deriveParams(STATES[tr], 1)), /가로등/, tr);
  console.log(`    공포 u=−1 → ${relax}`);
});

// 검토 턴 31 — 포화 판정이 절대값 1e-3 이라 오프셋이 작은 축(안개)은 실제로 다 움직였는데 "포화" 로 찍혔다
// (로맨스 u 0.08 → 안개 −0.0005 → "안개 포화(0.050)", `work/evidence/review31/probe-b116-fog.txt`).
test("B116 상대 기준: 작은 u 에서도 실제로 움직인 축은 '포화' 가 아니다 — 로맨스·공포·코미디 u ±0.02~1", () => {
  for (const tr of ["R", "H", "C"]) {
    const base = deriveParams(STATES[tr], 1);
    for (const u of [0.02, 0.05, 0.08, 0.16, -0.02, -0.08]) {
      const off = offsetsFor(tr, u);
      for (const e of actuationEffect(base, off)) {
        const full = Math.abs(e.delta - e.offset) < 1e-9;
        if (full) assert.equal(e.saturated, false, `${tr} u ${u} ${e.key} 오프셋 ${e.offset} 을 다 받았는데 포화`);
      }
      const text = actuationText(off, base);
      // 공포 트랙 각성의 가로등만 진짜 포화(lampEarlyOn) — 나머지 포화 표기는 없어야 한다
      const sat = text.match(/(\S+) 포화/g) || [];
      const expect = tr === "H" && u > 0 ? ["가로등 포화"] : [];
      assert.deepEqual(sat, expect, `${tr} u ${u} → ${text}`);
    }
  }
  const r = deriveParams(STATES.R, 1);
  const t08 = actuationText(offsetsFor("R", 0.08), r);
  assert.doesNotMatch(t08, /안개 포화/);
  console.log(`    로맨스 u=+0.08 → ${t08}`);
  console.log(`    공포 u=+0.02 → ${actuationText(offsetsFor("H", 0.02), deriveParams(STATES.H, 1))}`);
});

test("B116 표시 자릿수: 오프셋·움직인 양이 표시 자릿수에서 0 이면 줄에서 뺀다(\"안개 +0.000\" 없음)", () => {
  const base = { npcSilence: 1.2, npcDistance: 0.9, npcGaze: 0.5, lampOn: 0.4, fogDensity: 0.05 };
  // 안개 0.0004·시선 0.004(=0.4%) 는 표시하면 0 이다
  const off = { npcSilence: 0.3, bgmGain: 0, lampOn: 0, fogDensity: 0.0004, npcDistance: 0, npcGaze: 0.004 };
  assert.equal(actuationText(off, base), "침묵 +0.30s");
  assert.equal(actuationText(off), "침묵 +0.30s", "base 없는 종전 표기도 같은 규칙");
  // 표시 자릿수 이상인 오프셋이 거의 다 잘려 움직인 양만 0 이 되면 포화로 적는다(상대 5% 미만)
  const nearTop = { ...base, fogDensity: RANGES.fogDensity[1] - 0.00005 };
  assert.match(actuationText({ ...off, fogDensity: 0.004 }, nearTop), /안개 포화/);
  // 오프셋 0.002 가 0.0015 만 움직이면(한계) 여전히 적는다
  const partial = { ...base, fogDensity: RANGES.fogDensity[1] - 0.0015 };
  assert.match(actuationText({ ...off, fogDensity: 0.002 }, partial), /안개 \+0\.002\(한계\)|안개 \+0\.001\(한계\)/);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
