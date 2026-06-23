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

const float PI = 3.141592653589793;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 lip = texture(uVideo, vScreenUv).rgb;
  float L = luma(lip);

  // Gentle exposure lift so the shade still reads on under-lit lips.
  float Lb = pow(clamp(L, 0.0, 1.0), 0.8);

  // A whisper of liner only at the outer boundary (uv.y → 0), feathered in.
  // Capped low so it deepens the edge rather than drawing a hard line.
  float outer = 1.0 - smoothstep(0.0, 0.32, vUv.y);
  vec3 pigment = mix(uColor, uLinerColor, outer * 0.35);

  // ── Hue-preserving recolour ─────────────────────────────────────────────
  // Scale the chosen pigment by the lip's OWN relative brightness. This keeps
  // the shade's hue everywhere (it can never screen toward white) while the
  // lip's natural light→dark structure rides along, so texture survives.
  float shade = clamp(Lb * 2.05, 0.28, 1.4);
  vec3 colored = pigment * shade;

  vec3 color = mix(lip, colored, clamp(uOpacity, 0.0, 1.0));

  // ── Dimensional form: the gloss wraps the lip body ──────────────────────
  // Derive a cheap lip-surface model from UV: a central pout bulge (across the
  // lip), and the mouth corners (along the lip). Use it for ambient occlusion
  // in the grooves/corners and to seat the wet highlight on the raised flesh.
  float bulge = sin(vUv.y * PI);                       // 1 mid-lip, 0 at edges
  float corner = smoothstep(0.0, 0.16, vUv.x) *
                 smoothstep(0.0, 0.16, 1.0 - vUv.x);   // 0 at commissures

  // Ambient occlusion — deepen the grooves, the mouth line and the corners so
  // the lip reads as a rounded 3D body rather than a flat decal.
  float ao = mix(0.72, 1.0, bulge) * mix(0.66, 1.0, corner);
  color *= ao;

  // ── Wet gloss, seated on the form ───────────────────────────────────────
  // A restrained specular: a tight hot-spot from the lips' own real highlights
  // plus a small synthetic one on the pout. Kept low so it reads as wet, never
  // a white wash.
  float photoSpec = pow(smoothstep(0.66, 0.97, L), 2.2);
  float formSpec = pow(bulge, 2.6) * smoothstep(0.28, 0.6, Lb);
  float spec = (photoSpec * 0.55 + formSpec * 0.35) * uGloss * corner;
  color += vec3(spec);

  // ── Feather into the skin (tighter, with corner taper) ──────────────────
  float feather =
    smoothstep(0.0, 0.10, vUv.y) * smoothstep(0.0, 0.10, 1.0 - vUv.y) *
    smoothstep(0.0, 0.05, vUv.x) * smoothstep(0.0, 0.05, 1.0 - vUv.x);

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
    uOpacity: { value: 0.82 },
    uGloss: { value: 0.4 },
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
