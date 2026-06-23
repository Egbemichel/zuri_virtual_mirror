import type { FaceMeshResults, NormalizedLandmark } from './vite-env';

// ─────────────────────────────────────────────────────────────────────────────
// FaceMeshDetector
//
// A ONE-SHOT face-landmark detector. Unlike a live tracker, it runs the mesh on
// a single captured still and resolves a promise with the lip landmarks. We read
// the `FaceMesh` constructor straight off `window` (loaded by the <script> tags
// in index.html), point `locateFile` at the locally-vendored WASM, and enable
// `refineLandmarks` for the dense 478-point mesh needed for surgical lip edges.
//
// `selfieMode` is FALSE: the captured photo is already mirrored before we hand
// it over, so the returned landmarks line up 1:1 with the photo's pixels.
// ─────────────────────────────────────────────────────────────────────────────

export type LandmarkFrame = NormalizedLandmark[];

export class FaceMeshDetector {
  private faceMesh: InstanceType<typeof window.FaceMesh> | null = null;
  private pending: ((landmarks: LandmarkFrame | null) => void) | null = null;

  async init(): Promise<void> {
    if (typeof window.FaceMesh === 'undefined') {
      throw new Error(
        'MediaPipe FaceMesh global not found. Check the CDN <script> tags in index.html loaded correctly.'
      );
    }

    this.faceMesh = new window.FaceMesh({
      // Serve the WASM/protobuf binaries from our own origin for build stability
      // and deterministic, offline-capable delivery.
      locateFile: (file: string) => `/mediapipe/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // 478-point mesh — tight lip contours
      // Single-image detection is harder than video (no temporal tracking), so
      // we lower the bar; the App retries on fresh frames if a shot still misses.
      minDetectionConfidence: 0.3,
      minTrackingConfidence: 0.3,
      selfieMode: false, // the captured still is already mirrored
    });

    this.faceMesh.onResults((results: FaceMeshResults) => {
      const resolve = this.pending;
      this.pending = null;
      if (!resolve) return;
      const faces = results.multiFaceLandmarks;
      resolve(faces && faces.length > 0 ? faces[0] : null);
    });

    // Warm the WASM up front so the first capture isn't slow.
    await this.faceMesh.initialize();
  }

  /**
   * Detect lip landmarks on a single image. Resolves `null` if no face is found.
   */
  detect(image: HTMLCanvasElement): Promise<LandmarkFrame | null> {
    if (!this.faceMesh) {
      return Promise.reject(new Error('FaceMeshDetector.init() was not called.'));
    }
    return new Promise((resolve) => {
      this.pending = resolve;
      void this.faceMesh!.send({ image });
    });
  }

  dispose(): void {
    this.faceMesh?.close();
    this.faceMesh = null;
  }
}
