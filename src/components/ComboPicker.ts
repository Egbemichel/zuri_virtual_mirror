import { COMBOS, DEFAULT_COMBO_ID, type LipCombo } from '../data/combos';

// ─────────────────────────────────────────────────────────────────────────────
// ComboPicker
//
// The quiet-luxury control panel: a spacious grid of circular combo swatches, a
// "Create your own" custom-shade studio, and the explicit Clear-Gloss switch.
// Pure DOM + CSS — no framework — so it stays featherweight.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComboPickerCallbacks {
  onSelect: (combo: LipCombo) => void;
}

export class ComboPicker {
  private readonly root: HTMLElement;
  private readonly callbacks: ComboPickerCallbacks;

  // Working set = the curated collection plus any user-authored customs.
  private combos: LipCombo[] = [...COMBOS];
  private activeId: string = DEFAULT_COMBO_ID;
  private customCount = 0;

  constructor(root: HTMLElement, callbacks: ComboPickerCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.render();
  }

  get activeCombo(): LipCombo {
    return this.combos.find((c) => c.id === this.activeId) ?? this.combos[0];
  }

  private render(): void {
    this.root.innerHTML = '';

    // ── Brand header ──
    const header = document.createElement('header');
    header.className = 'panel__header';
    header.innerHTML = `
      <p class="panel__eyebrow">Zuri · Maison de Beauté</p>
      <h1 class="panel__title">Virtual Mirror</h1>
      <p class="panel__subtitle">
        Capture a photo, choose a curated lip Combo — a hand-paired liner &amp;
        gloss — or blend your own. Layer the Clear Gloss for extra wet shine.
      </p>
    `;
    this.root.appendChild(header);

    // ── Combo grid ──
    const section = document.createElement('section');
    section.className = 'panel__section';
    section.appendChild(sectionTitle('The Collection'));

    const grid = document.createElement('div');
    grid.className = 'combo-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Lip combos');
    for (const combo of this.combos) grid.appendChild(this.renderCard(combo));
    section.appendChild(grid);
    this.root.appendChild(section);

    // ── Custom shade studio ──
    this.root.appendChild(this.renderCustomStudio());

    // ── Footer note ──
    const footer = document.createElement('footer');
    footer.className = 'panel__footer';
    footer.textContent =
      'Shades render on your captured photo, on-device. Nothing leaves your browser.';
    this.root.appendChild(footer);
  }

  private renderCard(combo: LipCombo): HTMLElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'combo-card';
    card.setAttribute('role', 'radio');
    card.dataset.id = combo.id;
    this.markActive(card, combo.id === this.activeId);

    const swatch = document.createElement('span');
    swatch.className = 'combo-card__swatch';
    swatch.style.background = combo.gloss;
    swatch.style.borderColor = combo.liner;
    swatch.style.boxShadow = `0 0 0 3px ${combo.liner}33, 0 12px 30px ${combo.gloss}40`;

    const meta = document.createElement('span');
    meta.className = 'combo-card__meta';
    meta.innerHTML = `
      <span class="combo-card__name">${escapeHtml(combo.name)}</span>
      <span class="combo-card__tagline">${escapeHtml(combo.tagline)}</span>
    `;

    card.append(swatch, meta);
    card.addEventListener('click', () => this.select(combo));
    return card;
  }

  private renderCustomStudio(): HTMLElement {
    const wrap = document.createElement('section');
    wrap.className = 'panel__section';
    wrap.appendChild(sectionTitle('Create Your Own'));

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
    add.innerHTML = 'Blend &amp; try this shade';
    add.addEventListener('click', () => {
      const gloss = (studio.querySelector('#custom_gloss') as HTMLInputElement).value;
      const liner = (studio.querySelector('#custom_liner') as HTMLInputElement).value;
      const shimmer = parseFloat(
        (studio.querySelector('#custom_shimmer') as HTMLInputElement).value
      );
      this.addCustom(gloss, liner, shimmer);
    });

    studio.appendChild(add);
    wrap.appendChild(studio);
    return wrap;
  }

  private addCustom(gloss: string, liner: string, shimmer: number): void {
    this.customCount += 1;
    const combo: LipCombo = {
      id: `custom-${this.customCount}`,
      name: `Custom №${this.customCount}`,
      tagline: 'Your bespoke blend',
      liner,
      gloss,
      roughness: 0.2, // glossy by default for a luxe finish
      shimmer,
    };
    this.combos.push(combo);
    this.activeId = combo.id;
    this.render(); // rebuild grid to include the new card (now active)
    this.callbacks.onSelect(combo);
  }

  private select(combo: LipCombo): void {
    if (this.activeId === combo.id) return;
    this.activeId = combo.id;
    this.root
      .querySelectorAll<HTMLElement>('.combo-card')
      .forEach((el) => this.markActive(el, el.dataset.id === combo.id));
    this.callbacks.onSelect(combo);
  }

  private markActive(card: HTMLElement, active: boolean): void {
    card.classList.toggle('combo-card--active', active);
    card.setAttribute('aria-checked', String(active));
  }
}

function sectionTitle(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.className = 'panel__section-title';
  h.textContent = text;
  return h;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
