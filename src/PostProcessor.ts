import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// PostProcessor — the "master colorist" grade.
//
// Turns a flat, under-lit webcam frame into a soft, warm, editorial image (the
// Pinterest / premium-beauty aesthetic). Pipeline:
//
//   1. Render the composited scene (photo + lips) to an offscreen target.
//   2. Separable Gaussian blur of that target (half-res) → a soft "glow" buffer.
//   3. Composite pass that applies, in order:
//        · Orton soft-glow  — screen the blurred buffer over the base (dreamy
//          haze + gentle skin-softening, the signature of the look).
//        · Exposure lift     — rescue under-exposed shots.
//        · Lifted shadows    — airy, matte-film black point.
//        · Warm split-tone   — warm highlights, cool-teal shadows (cinematic).
//        · Filmic S-contrast  — rich but soft midtones.
//        · Gentle desaturate  — muted, expensive palette.
//        · Vignette + grain   — focus and editorial texture.
//
// Implemented with ShaderMaterial (GLSL ES 1.00) full-screen passes — simplest
// and most portable; runs fine on the WebGL2 context alongside the GLSL3 lips.
// ─────────────────────────────────────────────────────────────────────────────

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;        // texel-scaled blur direction (includes spread)
  uniform float uThreshold; // >0 → bright-pass (bloom only on highlights)

  vec3 bright(vec3 c) {
    if (uThreshold <= 0.0) return c;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float k = max(l - uThreshold, 0.0) / max(1.0 - uThreshold, 0.001);
    return c * smoothstep(0.0, 1.0, k);
  }

  void main() {
    // 9-tap separable Gaussian (with optional bright-pass on the first axis).
    vec3 sum = bright(texture2D(tDiffuse, vUv).rgb) * 0.227027;
    sum += bright(texture2D(tDiffuse, vUv + uDir * 1.3846).rgb) * 0.3162162;
    sum += bright(texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.3162162;
    sum += bright(texture2D(tDiffuse, vUv + uDir * 3.2307).rgb) * 0.0702702;
    sum += bright(texture2D(tDiffuse, vUv - uDir * 3.2307).rgb) * 0.0702702;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tGlow;
  uniform float uBloom;      // highlights-only bloom strength
  uniform float uWarmth;     // warm grade amount
  uniform float uContrast;   // filmic S amount
  uniform float uSaturation; // colour richness
  uniform float uVignette;
  uniform float uGrain;
  uniform float uSeed;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 col = texture2D(tScene, vUv).rgb;
    vec3 glow = texture2D(tGlow, vUv).rgb;

    // 1. Filmic S-curve — add CONTRAST and snap (the opposite of haze).
    vec3 s = col * col * (3.0 - 2.0 * col);
    col = mix(col, s, uContrast);

    // 2. Colour richness — boost saturation toward a clean, expensive palette.
    float l0 = luma(col);
    col = mix(vec3(l0), col, uSaturation);

    // 3. Warm split-tone: warm highlights, gently cool shadows.
    float l = luma(col);
    vec3 warmHi = vec3(1.05, 1.0, 0.93);
    vec3 coolLo = vec3(0.98, 1.0, 1.03);
    vec3 split = mix(coolLo, warmHi, smoothstep(0.2, 0.85, l));
    col *= mix(vec3(1.0), split, uWarmth);

    // 4. Highlights-only bloom — adds sparkle to bright spots, NOT a full haze.
    col += glow * uBloom;

    // 5. Soft vignette to focus the portrait.
    float d = distance(vUv, vec2(0.5));
    col *= 1.0 - uVignette * smoothstep(0.45, 0.95, d);

    // 6. Fine film grain.
    col += (hash(vUv * uSeed) - 0.5) * uGrain;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export class PostProcessor {
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;

  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;

  private readonly rtScene: THREE.WebGLRenderTarget;
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;

  private size = new THREE.Vector2(2, 2);

  constructor() {
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2() },
        uThreshold: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tGlow: { value: null },
        uBloom: { value: 0.35 },
        uWarmth: { value: 0.6 },
        uContrast: { value: 0.4 },
        uSaturation: { value: 1.12 },
        uVignette: { value: 0.28 },
        uGrain: { value: 0.03 },
        uSeed: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** The render target the main scene should be drawn into. */
  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.rtScene;
  }

  setSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.floor(this.size.x));
    const h = Math.max(2, Math.floor(this.size.y));
    this.rtScene.setSize(w, h);
    // Half-res glow buffers — wide, soft, and cheap.
    this.rtA.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.rtB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  /**
   * Blur `rtScene` into the glow buffers, then composite the graded result to
   * the screen. Assumes the caller already rendered the scene into `sceneTarget`.
   */
  render(renderer: THREE.WebGLRenderer): void {
    const hw = this.rtA.width;
    const hh = this.rtA.height;
    const spread = 2.4;

    // Horizontal blur + bright-pass: rtScene → rtA (highlights only).
    this.blit(renderer, this.blurMat, this.rtA, {
      tDiffuse: this.rtScene.texture,
      uDir: new THREE.Vector2(spread / hw, 0),
      uThreshold: 0.72,
    });
    // Vertical blur: rtA → rtB (already bright-passed).
    this.blit(renderer, this.blurMat, this.rtB, {
      tDiffuse: this.rtA.texture,
      uDir: new THREE.Vector2(0, spread / hh),
      uThreshold: 0.0,
    });

    // Composite to the screen.
    this.compositeMat.uniforms.tScene.value = this.rtScene.texture;
    this.compositeMat.uniforms.tGlow.value = this.rtB.texture;
    this.compositeMat.uniforms.uSeed.value = 1.0 + Math.random() * 1000.0;
    this.quad.material = this.compositeMat;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.rtScene.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }

  private blit(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget,
    uniforms: Record<string, unknown>
  ): void {
    for (const [key, value] of Object.entries(uniforms)) {
      if (material.uniforms[key]) material.uniforms[key].value = value;
    }
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCam);
  }
}
