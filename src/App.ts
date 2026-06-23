import { CameraPreview } from './CameraPreview';
import { FaceMeshDetector } from './FaceMeshTracker';
import { SceneManager } from './SceneManager';
import { LightingMeter, type LightQuality } from './LightingMeter';
import { ComboPicker } from './components/ComboPicker';
import { gsap, revealUp, tapPulse, crossFadeIn, drawPaths } from './animations';

// ─────────────────────────────────────────────────────────────────────────────
// App — full-screen camera try-on.
//   loading → preview → processing → result
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'loading' | 'preview' | 'processing' | 'result';

const CAPTURE_ATTEMPTS = 4; // re-grab fresh frames so a blink/blur doesn't fail

export class App {
  private readonly video = mustGet<HTMLVideoElement>('#input_video');
  private readonly canvas = mustGet<HTMLCanvasElement>('#output_canvas');
  private readonly statusEl = mustGet<HTMLElement>('#status');
  private readonly statusText = mustGet<HTMLElement>('#status_text');
  private readonly stageEl = mustGet<HTMLElement>('#stage');
  private readonly controls = mustGet<HTMLElement>('#controls');
  private readonly loader = mustGet<HTMLElement>('#loader');
  private readonly loaderLabel = mustGet<HTMLElement>('#loader_label');
  private readonly sheet = mustGet<HTMLElement>('#sheet');
  private readonly sheetCard = mustGet<HTMLElement>('.sheet__card');
  private readonly sheetToggle = mustGet<HTMLButtonElement>('#sheet_toggle');
  private readonly sheetScrim = mustGet<HTMLElement>('#sheet_scrim');

  private readonly scene = new SceneManager(this.canvas);
  private readonly preview = new CameraPreview(this.video);
  private readonly detector = new FaceMeshDetector();
  private readonly meter = new LightingMeter();
  private readonly picker: ComboPicker;

  private mode: Mode = 'loading';
  private ready = false;
  private sheetOpen = false;
  private lightingTimer: number | null = null;

  constructor() {
    this.picker = new ComboPicker(
      mustGet<HTMLElement>('#rail'),
      mustGet<HTMLElement>('#rail_name'),
      mustGet<HTMLElement>('#panel'),
      { onSelect: (combo) => this.scene.applyCombo(combo) }
    );

    // Loading mark draws continuously while the overlay is visible.
    drawPaths(this.loader.querySelectorAll<SVGPathElement>('.loader__path'));

    gsap.set(this.sheetCard, { yPercent: 100 });
    this.sheetToggle.addEventListener('click', () => this.toggleSheet());
    this.sheetScrim.addEventListener('click', () => this.toggleSheet(false));

    this.renderControls();
  }

  async start(): Promise<void> {
    this.scene.applyCombo(this.picker.activeCombo);
    this.showLoader('Preparing your mirror…');

    try {
      await Promise.all([this.preview.start(), this.detector.init()]);
      this.ready = true;
      this.setMode('preview');
      this.hideLoader();
      this.picker.animateIn();
      revealUp([this.statusEl, this.controls], { stagger: 0.08, delay: 0.1 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown camera/model error.';
      this.hideLoader();
      this.setStatus(`⚠ ${message}`);
      this.statusEl.classList.add('stage__status--error');
      console.error('[Zuri] startup failed:', err);
    }
  }

  // ── Flow ───────────────────────────────────────────────────────────────────

  private async capture(): Promise<void> {
    if (!this.ready || this.mode === 'processing') return;
    this.toggleSheet(false);
    this.setMode('processing');
    this.showLoader('Creating your look…');

    let photo: HTMLCanvasElement | null = null;
    let landmarks = null;

    // Retry with fresh frames — single-image detection is flaky, so we give it
    // several quick attempts (the live feed keeps running underneath).
    for (let i = 0; i < CAPTURE_ATTEMPTS && !landmarks; i++) {
      photo = this.preview.capture();
      landmarks = await this.detector.detect(photo);
      if (!landmarks && i < CAPTURE_ATTEMPTS - 1) {
        await wait(90);
      }
    }

    if (!photo || !landmarks) {
      this.hideLoader();
      this.setMode('preview');
      this.setStatus('Couldn’t find your face — face the camera in good light and try again.');
      return;
    }

    this.scene.setPhoto(photo);
    this.scene.updateLandmarks(landmarks);
    this.scene.applyCombo(this.picker.activeCombo);
    this.setMode('result');
    this.hideLoader();
    crossFadeIn(this.canvas);
    this.setStatus('Tap a shade to try it · download when you love it.');
  }

  private retake(): void {
    this.scene.clear();
    gsap.set(this.canvas, { clearProps: 'opacity,scale,transform' });
    this.setMode('preview');
    this.setStatus('Frame your shot, then tap to capture.');
  }

  private download(): void {
    const url = this.scene.exportPng();
    const link = document.createElement('a');
    link.href = url;
    link.download = `zuri-${this.picker.activeCombo.id}.png`;
    link.click();
  }

  // ── Sheet ────────────────────────────────────────────────────────────────────

  private toggleSheet(open = !this.sheetOpen): void {
    if (open === this.sheetOpen) return;
    this.sheetOpen = open;
    this.sheet.classList.toggle('is-open', open);
    this.sheet.setAttribute('aria-hidden', String(!open));
    this.sheetToggle.setAttribute('aria-expanded', String(open));
    gsap.to(this.sheetCard, {
      yPercent: open ? 0 : 100,
      duration: open ? 0.5 : 0.4,
      ease: open ? 'power3.out' : 'power2.in',
      overwrite: true,
    });
  }

  // ── Loader ───────────────────────────────────────────────────────────────────

  private showLoader(label: string): void {
    this.loaderLabel.textContent = label;
    this.loader.classList.remove('is-hidden');
  }

  private hideLoader(): void {
    this.loader.classList.add('is-hidden');
  }

  // ── View ─────────────────────────────────────────────────────────────────────

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.stageEl.dataset.mode = mode;
    this.statusEl.classList.toggle('stage__status--live', mode === 'result');
    this.renderControls();

    this.stopLightingAdvisor();
    if (mode === 'preview' && this.ready) {
      this.startLightingAdvisor();
    } else {
      delete this.statusEl.dataset.light;
    }
  }

  private renderControls(): void {
    this.controls.innerHTML = '';

    if (this.mode === 'result') {
      const retake = makeButton('Retake', 'control');
      retake.addEventListener('click', () => {
        tapPulse(retake);
        this.retake();
      });
      const download = makeButton('Download', 'control control--primary');
      download.addEventListener('click', () => {
        tapPulse(download);
        this.download();
      });
      this.controls.append(retake, download);
      revealUp(this.controls.children, { y: 12, stagger: 0.07 });
      return;
    }

    // preview / processing / loading → round shutter
    const shutter = document.createElement('button');
    shutter.type = 'button';
    shutter.className = 'shutter';
    shutter.setAttribute('aria-label', 'Capture photo');
    shutter.disabled = this.mode === 'processing' || !this.ready;
    shutter.addEventListener('click', () => {
      tapPulse(shutter);
      void this.capture();
    });
    this.controls.append(shutter);
  }

  // ── Real-time lighting coach ───────────────────────────────────────────────

  private startLightingAdvisor(): void {
    const tick = () => this.applyLightingAdvice(this.meter.sample(this.video).quality);
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
      dark: 'Quite dark — face a window or lamp for the glow.',
      dim: 'A touch more light will glow — or capture, we’ll enhance it.',
      harsh: 'Very bright spot — soften it or turn slightly.',
      good: 'Beautiful light. Tap to capture.',
    };
    this.statusEl.dataset.light = quality;
    this.setStatus(advice[quality]);
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mustGet<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el;
}
