import * as THREE from 'three';
import { LipGeometry } from './LipGeometry';
import { createLipMaterial, type LipUniforms } from './LipShader';
import { PostProcessor } from './PostProcessor';
import type { LandmarkFrame } from './FaceMeshTracker';
import type { LipCombo } from './data/combos';

// ─────────────────────────────────────────────────────────────────────────────
// SceneManager
//
// Renders the final try-on image: the captured photo as a full-frame background
// quad, with the gloss shader composited on top. The photo is BOTH the
// background and the texture the shader samples, so screen-space UVs align
// exactly and the makeup sits precisely on the real lips.
//
// Static image → we render on demand (capture / shade change / export) rather
// than running a wasteful animation loop.
// ─────────────────────────────────────────────────────────────────────────────

// Author swatch colours as literal sRGB hex and render WYSIWYG.
THREE.ColorManagement.enabled = false;

export class SceneManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;

  private readonly lipGeometry: LipGeometry;
  private readonly lipMesh: THREE.Mesh;
  private readonly uniforms: LipUniforms;

  private readonly bgMaterial: THREE.MeshBasicMaterial;
  private readonly bgMesh: THREE.Mesh;
  private photoTexture: THREE.CanvasTexture | null = null;

  private readonly post = new PostProcessor();
  private graded = false; // apply the editorial grade only once a photo exists

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Lets the canvas be read back (toDataURL) for download at any time.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // no re-encode
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();

    // Orthographic camera matching LipGeometry's [-1,1] normalised output.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    // ── Full-frame photo background ──
    const dummy = this.createDummyTexture();
    this.bgMaterial = new THREE.MeshBasicMaterial({
      map: dummy,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMaterial);
    this.bgMesh.renderOrder = -1;
    this.bgMesh.frustumCulled = false;
    this.bgMesh.visible = false;
    this.scene.add(this.bgMesh);

    // ── Lip overlay ──
    const material = createLipMaterial(dummy);
    this.uniforms = material.uniforms as LipUniforms;

    this.lipGeometry = new LipGeometry();
    this.lipMesh = new THREE.Mesh(this.lipGeometry.geometry, material);
    this.lipMesh.renderOrder = 1;
    this.lipMesh.frustumCulled = false; // geometry is rewritten on capture
    this.lipMesh.visible = false;
    this.scene.add(this.lipMesh);

    window.addEventListener('resize', this.render);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Install a freshly captured photo: size the buffer to it, point both the
   * background and the shader's sampler at it.
   */
  setPhoto(canvas: HTMLCanvasElement): void {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    this.photoTexture?.dispose();
    this.photoTexture = tex;

    this.bgMaterial.map = tex;
    this.bgMaterial.needsUpdate = true;
    this.uniforms.uVideo.value = tex;

    this.renderer.setSize(canvas.width, canvas.height, false);
    this.post.setSize(this.renderer);
    this.bgMesh.visible = true;
    this.graded = true;
    this.render();
  }

  /** Map a detected landmark frame onto the lip mesh and reveal it. */
  updateLandmarks(landmarks: LandmarkFrame): void {
    this.lipGeometry.update(landmarks);
    this.lipMesh.visible = true;
    this.render();
  }

  /** Return to an empty stage (e.g. on retake). */
  clear(): void {
    this.lipMesh.visible = false;
    this.bgMesh.visible = false;
    this.graded = false;
    this.render();
  }

  /** Apply a selected combo (gloss colour + subtle liner). */
  applyCombo(combo: LipCombo): void {
    this.uniforms.uColor.value.set(combo.gloss);
    this.uniforms.uLinerColor.value.set(combo.liner);
    this.render();
  }

  /** Render once and return the composited image as a PNG data URL. */
  exportPng(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    window.removeEventListener('resize', this.render);
    this.post.dispose();
    this.renderer.dispose();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private render = (): void => {
    if (this.graded) {
      // Scene (photo + lips) → offscreen target, then the editorial grade → screen.
      this.renderer.setRenderTarget(this.post.sceneTarget);
      this.renderer.render(this.scene, this.camera);
      this.post.render(this.renderer);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private createDummyTexture(): THREE.DataTexture {
    const tex = new THREE.DataTexture(
      new Uint8Array([10, 8, 7, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    tex.needsUpdate = true;
    return tex;
  }
}
