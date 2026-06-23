import * as THREE from 'three';
import type { LandmarkFrame } from './FaceMeshTracker';

// ─────────────────────────────────────────────────────────────────────────────
// LipGeometry
//
// Builds a watertight ribbon mesh over the lips from MediaPipe's canonical face
// landmarks and rewrites its vertex positions every frame.
//
// The lip "flesh" is the ring between the OUTER boundary (the silhouette of the
// lips, landmarks 61…291) and the INNER boundary (the mouth opening). We author
// four matched 11-point contours so each quad of the ring can be triangulated
// trivially. UVs run u along the contour and v from 0 (outer edge → liner) to
// 1 (inner edge), which the shader uses for liner feathering.
// ─────────────────────────────────────────────────────────────────────────────

// Matched contours, corner-to-corner (left commissure 61 → right commissure 291).
const UPPER_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const UPPER_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const LOWER_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
const LOWER_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];

const RING = UPPER_OUTER.length; // 11

export class LipGeometry {
  readonly geometry: THREE.BufferGeometry;

  // Flat list mapping each buffer vertex → its source MediaPipe landmark index.
  private readonly sourceIndices: number[];
  private readonly positions: Float32Array;
  // Temporally-smoothed positions (adaptive low-pass) to kill landmark jitter.
  private readonly smoothed: Float32Array;
  private primed = false;

  constructor() {
    // Vertex layout: [upperOuter, upperInner, lowerOuter, lowerInner].
    this.sourceIndices = [
      ...UPPER_OUTER,
      ...UPPER_INNER,
      ...LOWER_OUTER,
      ...LOWER_INNER,
    ];

    const vertexCount = this.sourceIndices.length; // 44
    this.positions = new Float32Array(vertexCount * 3);
    this.smoothed = new Float32Array(vertexCount * 3);

    const uvs = new Float32Array(vertexCount * 2);
    const setUv = (offset: number, n: number, v: number) => {
      for (let i = 0; i < n; i++) {
        uvs[(offset + i) * 2 + 0] = i / (n - 1); // u along contour
        uvs[(offset + i) * 2 + 1] = v; // v across lip (0 outer → 1 inner)
      }
    };
    setUv(0, RING, 0.0); // upper outer
    setUv(RING, RING, 1.0); // upper inner
    setUv(RING * 2, RING, 0.0); // lower outer
    setUv(RING * 3, RING, 1.0); // lower inner

    // Buffer-relative base indices for each contour.
    const UO = 0;
    const UI = RING;
    const LO = RING * 2;
    const LI = RING * 3;

    const indices: number[] = [];
    const stripe = (outer: number, inner: number) => {
      for (let i = 0; i < RING - 1; i++) {
        const a = outer + i;
        const b = outer + i + 1;
        const c = inner + i;
        const d = inner + i + 1;
        indices.push(a, c, b); // triangle 1
        indices.push(b, c, d); // triangle 2
      }
    };
    stripe(UO, UI); // upper lip ring
    stripe(LO, LI); // lower lip ring

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
  }

  /**
   * Rewrite vertex positions from a fresh landmark frame.
   *
   * MediaPipe landmarks are normalised: x,y ∈ [0,1] (origin top-left, already
   * selfie-mirrored), z is depth relative to face width (negative ≈ toward the
   * camera). We map into the [-1,1] clip space consumed by the orthographic
   * camera in SceneManager, leaving the lip-bulge to the vertex shader.
   */
  update(landmarks: LandmarkFrame, zScale = 1.6): void {
    const pos = this.positions;
    const sm = this.smoothed;
    for (let i = 0; i < this.sourceIndices.length; i++) {
      const lm = landmarks[this.sourceIndices[i]];
      if (!lm) continue;

      const tx = lm.x * 2 - 1; // [0,1] → [-1,1]
      const ty = (1 - lm.y) * 2 - 1; // flip Y, [0,1] → [-1,1]
      const tz = -lm.z * zScale; // depth toward camera

      const ix = i * 3;
      if (!this.primed) {
        sm[ix] = tx;
        sm[ix + 1] = ty;
        sm[ix + 2] = tz;
      } else {
        // Adaptive exponential smoothing (a cheap One-Euro-style filter):
        // when the lip is nearly still we smooth hard to erase jitter; when it
        // moves fast we follow closely so it never feels like it's lagging.
        const dx = tx - sm[ix];
        const dy = ty - sm[ix + 1];
        const speed = Math.hypot(dx, dy);
        const alpha = Math.min(0.9, 0.22 + speed * 14.0);
        sm[ix] += dx * alpha;
        sm[ix + 1] += dy * alpha;
        sm[ix + 2] += (tz - sm[ix + 2]) * alpha;
      }

      pos[ix] = sm[ix];
      pos[ix + 1] = sm[ix + 1];
      pos[ix + 2] = sm[ix + 2];
    }
    this.primed = true;
    const attr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}
