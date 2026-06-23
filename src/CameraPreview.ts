// ─────────────────────────────────────────────────────────────────────────────
// CameraPreview
//
// Owns the live getUserMedia stream used purely for FRAMING. It does no tracking
// — the user composes their shot, then `capture()` freezes a single mirrored
// still that the rest of the pipeline (detect → render) consumes.
// ─────────────────────────────────────────────────────────────────────────────

export class CameraPreview {
  private stream: MediaStream | null = null;
  private readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API unavailable. Use a modern browser over HTTPS.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    // Ensure intrinsic dimensions are known before anyone calls capture().
    if (!this.video.videoWidth) {
      await new Promise<void>((resolve) =>
        this.video.addEventListener('loadedmetadata', () => resolve(), {
          once: true,
        })
      );
    }
  }

  /**
   * Grab the current frame as a mirrored still — matching the looking-glass
   * preview the user framed — and return it as a fresh canvas.
   */
  capture(): HTMLCanvasElement {
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d')!;
    // Mirror horizontally so the still matches the CSS-mirrored live preview.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);

    return canvas;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
