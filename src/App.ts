import { CameraPreview } from './CameraPreview';
import { FaceMeshDetector } from './FaceMeshTracker';
import { SceneManager } from './SceneManager';
import { LightingMeter, type LightQuality } from './LightingMeter';
import { ComboPicker } from './components/ComboPicker';

// ─────────────────────────────────────────────────────────────────────────────
// App — top-level wiring for the photo capture-and-render flow.
//
//   preview     → live camera for framing + a Capture button
//   processing  → run the face mesh on the frozen still
//   result      → photo + lips composited; switch shades live, retake, download
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'preview' | 'processing' | 'result';

export class App {
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly statusText: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly controls: HTMLElement;

  private readonly scene: SceneManager;
  private readonly preview: CameraPreview;
  private readonly detector: FaceMeshDetector;
  private readonly picker: ComboPicker;
  private readonly meter = new LightingMeter();

  private mode: Mode = 'preview';
  private ready = false;
  private lightingTimer: number | null = null;

  constructor() {
    this.video = mustGet<HTMLVideoElement>('#input_video');
    this.canvas = mustGet<HTMLCanvasElement>('#output_canvas');
    this.statusText = mustGet<HTMLElement>('#status_text');
    this.statusEl = mustGet<HTMLElement>('#status');
    this.stageEl = mustGet<HTMLElement>('#stage');
    this.controls = mustGet<HTMLElement>('#controls');

    this.scene = new SceneManager(this.canvas);
    this.preview = new CameraPreview(this.video);
    this.detector = new FaceMeshDetector();

    this.picker = new ComboPicker(mustGet<HTMLElement>('#panel'), {
      onSelect: (combo) => this.scene.applyCombo(combo),
    });
  }

  async start(): Promise<void> {
    // Seed the initial combo.
    this.scene.applyCombo(this.picker.activeCombo);
    this.setMode('preview');
    this.setStatus('Initialising…');

    try {
      // Camera and model load in parallel for a fast cold start.
      await Promise.all([this.preview.start(), this.detector.init()]);
      this.ready = true;
      this.setMode('preview'); // re-enter preview to enable the lighting coach
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown camera/model error.';
      this.setStatus(`⚠ ${message}`);
      this.statusEl.classList.add('stage__status--error');
      console.error('[Zuri] startup failed:', err);
    }
  }

  // ── Flow ───────────────────────────────────────────────────────────────────

  private async capture(): Promise<void> {
    if (!this.ready || this.mode === 'processing') return;
    this.setMode('processing');
    this.setStatus('Detecting your lips…');

    try {
      const photo = this.preview.capture();
      const landmarks = await this.detector.detect(photo);

      if (!landmarks) {
        this.setStatus('No face found — center yourself and try again.');
        this.setMode('preview');
        return;
      }

      this.scene.setPhoto(photo);
      this.scene.updateLandmarks(landmarks);
      this.scene.applyCombo(this.picker.activeCombo);
      this.setMode('result');
      this.setStatus('Tap any shade to try it · download when you love it.');
    } catch (err) {
      console.error('[Zuri] capture failed:', err);
      this.setStatus('Something went wrong — please retake.');
      this.setMode('preview');
    }
  }

  private retake(): void {
    this.scene.clear();
    this.setMode('preview');
    this.setStatus('Frame your shot, then capture.');
  }

  private download(): void {
    const url = this.scene.exportPng();
    const link = document.createElement('a');
    link.href = url;
    link.download = `zuri-${this.picker.activeCombo.id}.png`;
    link.click();
  }

  // ── View ─────────────────────────────────────────────────────────────────

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.stageEl.dataset.mode = mode;
    this.statusEl.classList.toggle('stage__status--live', mode === 'result');
    this.renderControls();

    // The lighting coach runs only while framing a shot.
    this.stopLightingAdvisor();
    if (mode === 'preview' && this.ready) {
      this.startLightingAdvisor();
    } else {
      delete this.statusEl.dataset.light;
    }
  }

  // ── Real-time lighting coach ───────────────────────────────────────────────

  private startLightingAdvisor(): void {
    const tick = () => {
      const { quality } = this.meter.sample(this.video);
      this.applyLightingAdvice(quality);
    };
    tick();
    this.lightingTimer = window.setInterval(tick, 700);
  }

  private stopLightingAdvisor(): void {
    if (this.lightingTimer !== null) {
      window.clearInterval(this.lightingTimer);
      this.lightingTimer = null;
    }
  }

  private applyLightingAdvice(quality: LightQuality): void {
    const advice: Record<LightQuality, string> = {
      dark: 'Quite dark — face a window or lamp for the signature glow.',
      dim: 'A touch more light will glow beautifully — or capture, we’ll enhance it.',
      harsh: 'Very bright spot — soften it or turn slightly for an even glow.',
      good: 'Beautiful, even light. Capture when you’re ready.',
    };
    this.statusEl.dataset.light = quality;
    this.setStatus(advice[quality]);
  }

  private renderControls(): void {
    this.controls.innerHTML = '';

    if (this.mode === 'result') {
      const retake = makeButton('Retake', 'control control--ghost');
      retake.addEventListener('click', () => this.retake());

      const download = makeButton('Download', 'control control--primary');
      download.addEventListener('click', () => this.download());

      this.controls.append(retake, download);
      return;
    }

    const capture = makeButton(
      this.mode === 'processing' ? 'Generating…' : 'Capture',
      'control control--primary control--capture'
    );
    capture.disabled = this.mode === 'processing' || !this.ready;
    capture.addEventListener('click', () => void this.capture());
    this.controls.append(capture);
  }

  private setStatus(message: string): void {
    this.statusText.textContent = message;
  }
}

function makeButton(label: string, className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  return btn;
}

function mustGet<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el;
}
