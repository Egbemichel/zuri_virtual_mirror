/// <reference types="vite/client" />

// ─────────────────────────────────────────────────────────────────────────────
// Ambient declarations for the MediaPipe globals injected by the <script> tags
// in index.html. We deliberately avoid `import { FaceMesh } from '@mediapipe/…'`
// (which drags in CommonJS interop that breaks Vite's ESM bundling) and instead
// read these constructors straight off `window`.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface FaceMeshResults {
  image: HTMLCanvasElement | HTMLVideoElement | ImageBitmap;
  multiFaceLandmarks?: NormalizedLandmark[][];
}

export interface FaceMeshOptions {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  selfieMode?: boolean;
}

export interface FaceMeshConfig {
  locateFile: (file: string) => string;
}

export declare class FaceMesh {
  constructor(config: FaceMeshConfig);
  setOptions(options: FaceMeshOptions): void;
  onResults(callback: (results: FaceMeshResults) => void): void;
  send(inputs: { image: HTMLVideoElement | HTMLCanvasElement }): Promise<void>;
  initialize(): Promise<void>;
  close(): void;
}

export declare class Camera {
  constructor(
    video: HTMLVideoElement,
    options: {
      onFrame: () => Promise<void> | void;
      width?: number;
      height?: number;
      facingMode?: string;
    }
  );
  start(): Promise<void>;
  stop(): void;
}

declare global {
  interface Window {
    FaceMesh: typeof FaceMesh;
    Camera: typeof Camera;
  }
}
