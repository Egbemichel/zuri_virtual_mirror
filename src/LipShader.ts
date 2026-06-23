import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// LipShader — photorealistic gloss via luminance-preserving recolouring.
//
// The realism principle (how real beauty-AR achieves it): NEVER repaint the lips
// with a flat colour. Instead, sample the real lip pixel and re-colour it while
// PRESERVING its own luminance — every natural highlight, shadow, crease and
// curve survives, so the pigment looks physically applied. Wetness then comes
// from amplifying the lips' own bright spots into blown-out specular sheen.
//
//   1. Sample the captured photo at this pixel (uVideo).
//   2. Re-colour with an overlay blend (multiply in shadow, screen in highlight)
//      so the lip's light→dark structure drives the result.
//   3. Add wet gloss: push the lips' brightest areas toward white sheen.
//   4. A whisper of liner deepens only the very outer rim — never a hard line.
//   5. Feather the edges so it melts into the surrounding skin.
//
// RawShaderMaterial + glslVersion GLSL3 → Three prepends `#version 300 es`, so we
// must NOT declare it here (a duplicate directive is a compile error).
// ─────────────────────────────────────────────────────────────────────────────

export const lipVertexShader = /* glsl */ `precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec2 uv;

out vec2 vUv;
out vec2 vScreenUv;   // [0,1] device-space, for sampling the photo beneath

void main() {
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenUv = clip.xy / clip.w * 0.5 + 0.5;
  gl_Position = clip;
}
`;

export const lipFragmentShader = /* glsl */ `precision highp float;
precision highp sampler2D;

in vec2 vUv;
in vec2 vScreenUv;

uniform sampler2D uVideo;   // captured photo — the real lips beneath
uniform vec3  uColor;       // gloss pigment (dominant lip colour)
uniform vec3  uLinerColor;  // subtle outer-rim deepening
uniform float uOpacity;     // pigment coverage [0..1]
uniform float uGloss;       // wet-sheen strength

out vec4 pc_fragColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Per-channel overlay blend (multiply darks, screen lights) — the classic
// detail-preserving recolour operator.
vec3 overlay(vec3 base, vec3 blend) {
  vec3 mult = 2.0 * base * blend;
  vec3 scr = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(mult, scr, step(0.5, base));
}

void main() {
  vec3 lip = texture(uVideo, vScreenUv).rgb;
  float L = luma(lip);

  // Gentle exposure lift so the shade still reads on under-lit lips.
  float Lb = pow(clamp(L, 0.0, 1.0), 0.8);

  // A whisper of liner only at the outer boundary (uv.y → 0), feathered in.
  // Capped low so it deepens the edge rather than drawing a hard line.
  float outer = 1.0 - smoothstep(0.0, 0.32, vUv.y);
  vec3 pigment = mix(uColor, uLinerColor, outer * 0.35);

  // ── Luminance-preserving recolour ───────────────────────────────────────
  // Overlay keeps the lip's own form; a colour floor guarantees the shade
  // shows even where the lip is very dark (poor lighting).
  vec3 tinted = overlay(lip, pigment);
  tinted = mix(tinted, pigment * (0.45 + Lb), 0.35);
  tinted = max(tinted, pigment * Lb * 0.7);

  vec3 color = mix(lip, tinted, clamp(uOpacity, 0.0, 1.0));

  // ── Wet gloss ───────────────────────────────────────────────────────────
  // Amplify the lips' own brightest pixels into a blown-out specular sheen,
  // plus a soft moist sheen proportional to brightness so it always looks wet.
  float spec = pow(smoothstep(0.55, 0.95, L), 1.4) * uGloss;
  float sheen = smoothstep(0.30, 0.85, Lb) * uGloss * 0.35;
  color += vec3(spec + sheen);

  // ── Feather into the skin ───────────────────────────────────────────────
  float feather =
    smoothstep(0.0, 0.13, vUv.y) * smoothstep(0.0, 0.13, 1.0 - vUv.y);

  pc_fragColor = vec4(color, feather);
}
`;

export interface LipUniforms {
  uVideo: { value: THREE.Texture | null };
  uColor: { value: THREE.Color };
  uLinerColor: { value: THREE.Color };
  uOpacity: { value: number };
  uGloss: { value: number };
  [key: string]: THREE.IUniform;
}

export function createLipMaterial(
  videoTexture: THREE.Texture
): THREE.RawShaderMaterial {
  const uniforms: LipUniforms = {
    uVideo: { value: videoTexture },
    uColor: { value: new THREE.Color('#f9ad99') },
    uLinerColor: { value: new THREE.Color('#c25b44') },
    uOpacity: { value: 0.8 },
    uGloss: { value: 0.9 },
  };

  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: lipVertexShader,
    fragmentShader: lipFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}
