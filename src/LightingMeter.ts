// ─────────────────────────────────────────────────────────────────────────────
// LightingMeter
//
// Samples the live preview at a tiny resolution and reports how well-lit the
// frame is, so the app can coach the user toward the soft, even light that
// makes the gloss (and the editorial grade) sing — before they capture.
// ─────────────────────────────────────────────────────────────────────────────

export type LightQuality = 'dark' | 'dim' | 'good' | 'harsh';

export interface LightReading {
  luma: number; // 0..1 average brightness
  quality: LightQuality;
}

export class LightingMeter {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly n = 32;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.n;
    this.canvas.height = this.n;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  sample(video: HTMLVideoElement): LightReading {
    if (!video.videoWidth) return { luma: 0, quality: 'dark' };

    this.ctx.drawImage(video, 0, 0, this.n, this.n);
    const data = this.ctx.getImageData(0, 0, this.n, this.n).data;

    let sum = 0;
    let max = 0;
    let bright = 0;
    const count = this.n * this.n;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += l;
      if (l > max) max = l;
      if (l > 245) bright += 1; // blown-out pixels → harsh light
    }

    const luma = sum / count / 255;
    const blownFraction = bright / count;

    let quality: LightQuality;
    if (blownFraction > 0.12) quality = 'harsh';
    else if (luma < 0.16) quality = 'dark';
    else if (luma < 0.3) quality = 'dim';
    else quality = 'good';

    return { luma, quality };
  }
}
