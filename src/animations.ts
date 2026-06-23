import gsap from 'gsap';

// ─────────────────────────────────────────────────────────────────────────────
// animations.ts — a tiny, reusable GSAP micro-animation library for Zuri.
//
// Three reused micro-animations (revealUp, tapPulse, crossFadeIn) plus an SVG
// path "draw" helper, all gated by prefers-reduced-motion. Keep motion calm and
// quiet-luxury: soft eases, short durations.
// ─────────────────────────────────────────────────────────────────────────────

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * #1 — revealUp: staggered fade + rise entrance.
 * Reused for the swatch rail, the dock controls, and sheet content.
 */
export function revealUp(
  targets: gsap.TweenTarget,
  opts: { y?: number; stagger?: number; delay?: number; duration?: number } = {}
): gsap.core.Tween | void {
  const { y = 16, stagger = 0.05, delay = 0, duration = 0.55 } = opts;
  if (prefersReducedMotion()) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return;
  }
  return gsap.fromTo(
    targets,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, stagger, delay, ease: 'power3.out', overwrite: 'auto' }
  );
}

/**
 * #2 — tapPulse: tactile press feedback (squash → elastic settle).
 * Reused on every primary button and swatch tap.
 */
export function tapPulse(target: gsap.TweenTarget): void {
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    target,
    { scale: 0.9 },
    { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.55)', overwrite: 'auto' }
  );
}

/**
 * #3 — crossFadeIn: soft fade + settle for content swaps.
 * Reused for the capture→result reveal and status changes.
 */
export function crossFadeIn(
  target: gsap.TweenTarget,
  opts: { duration?: number; from?: number } = {}
): gsap.core.Tween | void {
  const { duration = 0.5, from = 1.03 } = opts;
  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 1, scale: 1 });
    return;
  }
  return gsap.fromTo(
    target,
    { opacity: 0, scale: from },
    { opacity: 1, scale: 1, duration, ease: 'power2.out', overwrite: 'auto' }
  );
}

/**
 * SVG "draw": animate stroke-dashoffset from full length to 0 (no premium
 * plugin needed). Used by the loading mark and decorative strokes.
 */
export function drawPaths(
  paths: SVGPathElement[] | NodeListOf<SVGPathElement>,
  opts: { duration?: number; stagger?: number; repeat?: number; yoyo?: boolean } = {}
): gsap.core.Tween | void {
  const { duration = 1.2, stagger = 0.15, repeat = -1, yoyo = true } = opts;
  const els = Array.from(paths);
  els.forEach((p) => {
    const len = p.getTotalLength();
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });
  if (prefersReducedMotion()) {
    gsap.set(els, { strokeDashoffset: 0 });
    return;
  }
  return gsap.to(els, {
    strokeDashoffset: 0,
    duration,
    stagger,
    repeat,
    yoyo,
    ease: 'sine.inOut',
  });
}

export { gsap };
