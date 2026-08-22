"use client";

// 절차적 텍스처 — 외부 에셋 없이 재질감을 만든다.
//
// 화이트박스가 "네모"로 보이는 이유의 대부분은 형태가 아니라 **재질**이다.
// 전부 같은 거칠기의 단색 표면이면 빛이 정보를 주지 못한다. 여기서 만드는
// 세 가지가 그 문제를 푼다:
//
//   하늘 그라디언트  → scene.background + PMREM 환경맵 (젖은 노면의 반사원)
//   얼룩 노이즈      → roughnessMap. 젖은 부분과 마른 부분이 갈린다
//   격자             → 카페 온실의 창틀
//
// 캔버스로 만들므로 네트워크도 파일도 필요 없다. 아트의 실제 텍스처가
// 나오면 이 함수들을 그대로 대체하면 된다.

import * as THREE from "three";

/**
 * 하늘 — "비는 멎었지만 하늘에는 아직 두꺼운 구름이 남아 있다.
 * 구름 사이로 빛이 간헐적으로 새어 나오고" (v2.md §1)
 *
 * 지평선 부근을 밝게 남겨 구름 틈의 빛을 만든다. 이 텍스처가 그대로
 * 환경맵이 되어 젖은 노면·유리·금속에 비친다.
 */
export function makeSkyTexture() {
  // 등장방형(equirectangular)으로 360°를 두르므로 가로 해상도가 있어야 한다.
  // 64px 로 두면 구름이 세로 띠로 뭉개진다.
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, "#5c6672"); // 천정 — 두꺼운 구름
  g.addColorStop(0.34, "#7d8794");
  g.addColorStop(0.52, "#a8b0b8");
  g.addColorStop(0.585, "#cfd3d4"); // 지평선 바로 위 — 구름 틈으로 새는 빛
  g.addColorStop(0.62, "#8e959c");
  g.addColorStop(0.70, "#4e545b");
  g.addColorStop(1.00, "#2b2f34"); // 아래 — 지면 반사
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 구름 덩어리 — 가로로 뭉갠 얼룩 몇 개
  ctx.globalAlpha = 0.16;
  let cs = 20260822;
  const crnd = () => ((cs = (cs * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 90; i++) {
    const y = 30 + crnd() * 250;
    const h = 8 + crnd() * 40;
    const w = 60 + crnd() * 190;
    ctx.fillStyle = crnd() > 0.5 ? "#ffffff" : "#3f454c";
    ctx.beginPath();
    ctx.ellipse(crnd() * W, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * 얼룩 노이즈 — roughnessMap 용.
 *
 * 젖은 아스팔트는 균일하게 젖지 않는다. 물이 고인 곳은 거의 거울이고
 * 마른 곳은 거칠다. 이 대비가 "비가 방금 그쳤다"를 만든다.
 *
 * @param wetness 0~1 — 클수록 매끄러운(젖은) 면적이 넓다
 */
export function makeBlotchTexture({ size = 256, blobs = 46, wetness = 0.55, seed = 1 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // 바탕 = 마른 상태(거칠다)
  const base = Math.round(255 * (1 - wetness * 0.25));
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);

  // 결정적 난수 — 새로 고칠 때마다 노면이 달라지면 곤란하다
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  for (let i = 0; i < blobs; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = size * (0.04 + rnd() * 0.16);
    const dark = Math.round(255 * (1 - wetness) * (0.25 + rnd() * 0.5));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${dark},${dark},${dark},0.9)`);
    g.addColorStop(1, `rgba(${dark},${dark},${dark},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** 온실 카페의 창틀 격자 — 검은 금속 프레임 (v2.md §1-2). */
export function makeMullionTexture({ size = 256, cols = 5, rows = 4, bar = 0.055 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#1d2126";
  const bw = size * bar;
  for (let i = 0; i <= cols; i++) ctx.fillRect((i / cols) * size - bw / 2, 0, bw, size);
  for (let j = 0; j <= rows; j++) ctx.fillRect(0, (j / rows) * size - bw / 2, size, bw);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * 하늘 돔 — 색이 실시간으로 바뀌어야 하므로 텍스처가 아니라 셰이더로 만든다.
 *
 * 배합 벡터가 갱신될 때마다 캔버스를 다시 그리고 PMREM 을 다시 돌리면
 * 프레임이 밀린다. 유니폼 3개(천정·지평선·바닥)만 갈아 끼우면 공짜다.
 * 구름은 방향 벡터 기반의 값싼 노이즈로 얹는다 — 균일한 그라디언트만
 * 있으면 하늘이 아니라 배경색으로 보인다.
 */
export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color("#5c6672") },
      uHorizon: { value: new THREE.Color("#cfd3d4") },
      uBottom: { value: new THREE.Color("#2b2f34") },
      uCloud: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform float uCloud;
      varying vec3 vDir;

      // 값싼 해시 노이즈 — 구름 덩어리를 얹기 위한 것이지 정밀할 필요는 없다
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0
          ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
          : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.6));

        // 구름 — 지평선 위쪽에만, 위로 갈수록 옅게
        float band = smoothstep(-0.02, 0.30, h) * (1.0 - smoothstep(0.35, 0.95, h));
        vec2 uv = vec2(atan(vDir.z, vDir.x) * 1.6, h * 3.4);
        float n = fbm(uv * 2.2);
        col = mix(col, col * (0.72 + 0.55 * n), band * uCloud);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * 하늘 돔에서 환경맵을 굽는다. 젖은 노면·유리·강관에 비치는 것이 이 결과다.
 *
 * 돔만 담긴 별도 씬에서 구우므로 본 씬 렌더와 무관하다. 매 프레임 굽지 않고
 * 색이 눈에 띄게 바뀌었을 때만 다시 굽는다 (호출 쪽에서 조절).
 */
export function createSkyEnvBaker(gl, skyMaterial) {
  const pmrem = new THREE.PMREMGenerator(gl);
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), skyMaterial);
  scene.add(dome);
  let current = null;

  return {
    bake() {
      const next = pmrem.fromScene(scene, 0.06).texture;
      const prev = current;
      current = next;
      prev?.dispose();
      return next;
    },
    dispose() {
      current?.dispose();
      dome.geometry.dispose();
      pmrem.dispose();
    },
  };
}
