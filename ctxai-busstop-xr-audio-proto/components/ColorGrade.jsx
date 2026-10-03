"use client";

// 컨셉 이미지 색감 보정 — EffectComposer 안, 톤매핑 뒤에 놓는 후처리 한 장. 값은 lib/colorGrade.js.
//   ① 노출: 3D가 컨셉보다 밝아서(0.63 vs 0.46) 낮춘다
//   ② 그림자는 차갑게·하이라이트는 따뜻하게(장르별 색조) — 컨셉의 "차가운 바닥 위 따뜻한 불빛"
//   ③ 나뭇잎 노랑-초록(60~160°)을 청록 쪽으로 돌린다(공포는 올리브 그대로)
//   ④ 먼 곳을 푸른 대기색으로 — 깊이로 거리를 재서 채도를 빼고 안개색에 섞는다(하늘은 그대로)
// 선명함·윤곽은 건드리지 않는다. WebXR 세션 중엔 컴포저가 꺼져 적용되지 않는다(ReactiveStage 조명이 대신 일부 담당).

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector3 } from "three";
import { blendGrade } from "../lib/colorGrade";

const FRAG = /* glsl */ `
uniform float uExposure;
uniform float uSaturation;
uniform vec3 uShadow;
uniform vec3 uHighlight;
uniform float uGreenShift;
uniform float uGreenDesat;
uniform vec3 uHazeColor;
uniform float uHazeAmount;
uniform float uStrength;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 base = inputColor.rgb;
  vec3 c = pow(max(base, 0.0), vec3(1.0 / 2.2)); // 보정은 보이는 밝기(감마) 공간에서
  float L = dot(c, vec3(0.299, 0.587, 0.114));

  // ④ 먼 곳의 푸른 대기 — 하늘(깊이 1)은 제외
  float viewDist = -getViewZ(depth);
  float far = (depth > 0.9999) ? 0.0 : 1.0 - exp(-0.022 * max(viewDist - 8.0, 0.0));
  float haze = far * uHazeAmount;
  c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), haze * 0.6);
  c = mix(c, uHazeColor * (0.55 + 0.9 * L), haze * 0.55);

  // ① 노출
  c *= uExposure;
  L = dot(c, vec3(0.299, 0.587, 0.114));

  // ③ 나뭇잎(황금빛 노랑·주황 → 초록, 초록 → 청록) — 하늘 노을(주황 25° 이하)과 밝은 불빛(밝기 0.9↑)은 제외
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float inFoliage = smoothstep(0.07, 0.13, hsv.x) * (1.0 - smoothstep(0.42, 0.5, hsv.x))
                  * smoothstep(0.1, 0.3, hsv.y) * (1.0 - smoothstep(0.78, 0.95, hsv.z));
  hsv.x += (0.45 - hsv.x) * uGreenShift * 0.8 * inFoliage;
  hsv.y *= 1.0 - uGreenDesat * inFoliage;
  c = hsv2rgb(hsv);

  // 채도
  c = mix(vec3(L), c, uSaturation);

  // ② 그림자 차갑게 · 하이라이트 따뜻하게
  float shadowMask = 1.0 - smoothstep(0.0, 0.55, L);
  float lightMask = smoothstep(0.4, 0.95, L);
  c += uShadow * shadowMask + uHighlight * lightMask;

  c = pow(max(c, 0.0), vec3(2.2));
  outputColor = vec4(mix(base, c, uStrength), inputColor.a);
}
`;

class ColorGradeEffect extends Effect {
  constructor() {
    super("ColorGradeEffect", FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ["uExposure", new Uniform(1)], ["uSaturation", new Uniform(1)],
        ["uShadow", new Uniform(new Vector3())], ["uHighlight", new Uniform(new Vector3())],
        ["uGreenShift", new Uniform(0)], ["uGreenDesat", new Uniform(0)],
        ["uHazeColor", new Uniform(new Vector3(0.5, 0.6, 0.66))], ["uHazeAmount", new Uniform(0)],
        ["uStrength", new Uniform(1)],
      ]),
    });
  }
}

export default function ColorGrade({ directionRef, strength = 1 }) {
  const effect = useMemo(() => new ColorGradeEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  useFrame(() => {
    const d = directionRef?.current;
    const u = effect.uniforms;
    const g = blendGrade(d?.st?.current, d?.st?.settled);
    u.get("uExposure").value = g.exposure;
    u.get("uSaturation").value = g.saturation;
    u.get("uShadow").value.set(...g.shadow);
    u.get("uHighlight").value.set(...g.highlight);
    u.get("uGreenShift").value = g.greenShift;
    u.get("uGreenDesat").value = g.greenDesat;
    u.get("uHazeColor").value.set(...g.hazeColor);
    u.get("uHazeAmount").value = g.hazeAmount;
    u.get("uStrength").value = strength;
  });
  return <primitive object={effect} dispose={null} />;
}
