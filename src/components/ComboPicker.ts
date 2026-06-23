import { COMBOS, DEFAULT_COMBO_ID, type LipCombo } from '../data/combos';
import { revealUp, tapPulse } from '../animations';

// ─────────────────────────────────────────────────────────────────────────────
// ComboPicker
//
// Minimal, cute selector for the full-screen camera UI:
//   · a horizontal RAIL of circular shade swatches at the bottom, with the
//     active shade's name floating above it;
//   · the "Create your own" studio + brand info live in the slide-up SHEET.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComboPickerCallbacks {
  onSelect: (combo: LipCombo) => void;
}

export class ComboPicker {
  private readonly rail: HTMLElement;
  private readonly railName: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly callbacks: ComboPickerCallbacks;

  private combos: LipCombo[] = [...COMBOS];
  private activeId: string = DEFAULT_COMBO_ID;
  private customCount = 0;

  constructor(
    rail: HTMLElement,
    railName: HTMLElement,
    panel: HTMLElement,
    callbacks: ComboPickerCallbacks
  ) {
    this.rail = rail;
    this.railName = railName;
    this.panel = panel;
    this.callbacks = callbacks;
    this.renderRail();
    this.renderSheet();
  }

  get activeCombo(): LipCombo {
    return this.combos.find((c) => c.id === this.activeId) ?? this.combos[0];
  }

  /** Entrance animation for the swatch rail (called once the camera is live). */
  animateIn(): void {
    revealUp(this.rail.querySelectorAll('.swatch'), { y: 18, stagger: 0.04 });
  }

  // ── Rail ───────────────────────────────────────────────────────────────────

  private renderRail(): void {
    this.rail.innerHTML = '';
    for (const combo of this.combos) {
      this.rail.appendChild(this.renderSwatch(combo));
    }
    this.railName.textContent = this.activeCombo.name;
  }

  private renderSwatch(combo: LipCombo): HTMLElement {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.dataset.id = combo.id;
    swatch.style.background = combo.gloss;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', `${combo.name} lip shade`);
    swatch.title = combo.name;
    this.markActive(swatch, combo.id === this.activeId);
    swatch.addEventListener('click', () => this.select(combo, swatch));
    return swatch;
  }

  private select(combo: LipCombo, swatch?: HTMLElement): void {
    this.activeId = combo.id;
    this.rail
      .querySelectorAll<HTMLElement>('.swatch')
      .forEach((el) => this.markActive(el, el.dataset.id === combo.id));
    this.railName.textContent = combo.name;
    if (swatch) {
      tapPulse(swatch);
      swatch.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    this.callbacks.onSelect(combo);
  }

  private markActive(swatch: HTMLElement, active: boolean): void {
    swatch.classList.toggle('swatch--active', active);
    swatch.setAttribute('aria-checked', String(active));
  }

  // ── Sheet (custom studio + info) ─────────────────────────────────────────────

  private renderSheet(): void {
    this.panel.innerHTML = '';

    const header = document.createElement('header');
    header.innerHTML = `
      <p class="panel__eyebrow">Zuri · Maison de Beauté</p>
      <h1 class="panel__title">Your shades</h1>
      <p class="panel__subtitle">
        Pick a shade from the rail, or blend your own below. It renders straight
        onto your captured photo — on your device, nothing leaves your browser.
      </p>
    `;
    this.panel.appendChild(header);

    const section = document.createElement('section');
    section.className = 'panel__section';
    const title = document.createElement('h2');
    title.className = 'panel__section-title';
    title.textContent = 'Create your own';
    section.appendChild(title);
    section.appendChild(this.renderStudio());
    this.panel.appendChild(section);

    const footer = document.createElement('footer');
    footer.className = 'panel__footer';
    footer.textContent =
      'Tip: soft, even, front-facing light gives the most premium, glossy result.';
    this.panel.appendChild(footer);
  }

  private renderStudio(): HTMLElement {
    const studio = document.createElement('div');
    studio.className = 'custom-studio';
    studio.innerHTML = `
      <div class="custom-field">
        <label for="custom_gloss">Gloss</label>
        <input type="color" id="custom_gloss" value="#f9ad99" />
      </div>
      <div class="custom-field">
        <label for="custom_liner">Liner</label>
        <input type="color" id="custom_liner" value="#c25b44" />
      </div>
      <div class="custom-field custom-field--wide">
        <label for="custom_shimmer">Shimmer</label>
        <input type="range" id="custom_shimmer" min="0" max="1" step="0.05" value="0.5" />
      </div>
    `;

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'custom-add';
    add.textContent = 'Blend & try this shade';
    add.addEventListener('click', () => {
      tapPulse(add);
      const gloss = (studio.querySelector('#custom_gloss') as HTMLInputElement).value;
      const liner = (studio.querySelector('#custom_liner') as HTMLInputElement).value;
      const shimmer = parseFloat(
        (studio.querySelector('#custom_shimmer') as HTMLInputElement).value
      );
      this.addCustom(gloss, liner, shimmer);
    });

    studio.appendChild(add);
    return studio;
  }

  private addCustom(gloss: string, liner: string, shimmer: number): void {
    this.customCount += 1;
    const combo: LipCombo = {
      id: `custom-${this.customCount}`,
      name: `Custom №${this.customCount}`,
      tagline: 'Your bespoke blend',
      liner,
      gloss,
      roughness: 0.2,
      shimmer,
    };
    this.combos.push(combo);
    const swatch = this.renderSwatch(combo);
    this.rail.appendChild(swatch);
    this.select(combo, swatch);
  }
}
