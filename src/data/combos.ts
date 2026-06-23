// ─────────────────────────────────────────────────────────────────────────────
// The Zuri "Combo" library.
//
// Every product is a curated pairing of a Lip Liner (the deeper outer boundary
// pigment) and a Gloss (the brighter inner fill with a wet sheen). The optional
// Clear Gloss layer is applied globally on top of whichever combo is active.
//
// Colours are authored in sRGB hex; SceneManager linearises them for the shader.
// ─────────────────────────────────────────────────────────────────────────────

export interface LipCombo {
  id: string;
  name: string;
  /** Short evocative descriptor shown under the name in the panel. */
  tagline: string;
  /** Deeper liner pigment — binds to the outer lip boundary (landmarks 61–291). */
  liner: string;
  /** Brighter gloss fill — the dominant lip colour. */
  gloss: string;
  /** Base gloss roughness (0 = mirror, 1 = matte). Clear Gloss overrides this. */
  roughness: number;
  /** Intrinsic glitter density baked into the swatch's micro-twinkle layer. */
  shimmer: number;
}

export const COMBOS: LipCombo[] = [
  {
    id: 'sunset-shimmer',
    name: 'Sunset Shimmer',
    tagline: 'Warm coral · soft gold flecks',
    liner: '#c25b44',
    gloss: '#f9ad99', // brand accent
    roughness: 0.28,
    shimmer: 0.85,
  },
  {
    id: 'golden-glow',
    name: 'Golden Glow',
    tagline: 'Amber bronze · candlelit sheen',
    liner: '#a85a28',
    gloss: '#e68c58', // brand accent
    roughness: 0.22,
    shimmer: 0.95,
  },
  {
    id: 'velvet-rose',
    name: 'Velvet Rose',
    tagline: 'Muted mauve · whisper satin',
    liner: '#7c4a52',
    gloss: '#c98a92',
    roughness: 0.42,
    shimmer: 0.35,
  },
  {
    id: 'noir-cherry',
    name: 'Noir Cherry',
    tagline: 'Deep wine · liquid lacquer',
    liner: '#5e2230',
    gloss: '#9c3a4c',
    roughness: 0.18,
    shimmer: 0.55,
  },
  {
    id: 'bare-silk',
    name: 'Bare Silk',
    tagline: 'Your-lips-but-better · clean nude',
    liner: '#b07a64',
    gloss: '#dcab94',
    roughness: 0.5,
    shimmer: 0.2,
  },
  {
    id: 'molten-copper',
    name: 'Molten Copper',
    tagline: 'Metallic flame · high voltage',
    liner: '#8a3b1e',
    gloss: '#d96b3a',
    roughness: 0.15,
    shimmer: 1.0,
  },
];

export const DEFAULT_COMBO_ID = 'sunset-shimmer';
