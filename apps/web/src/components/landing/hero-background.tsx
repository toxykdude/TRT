/**
 * Decorative hero backdrop — a pure CSS/SVG stand-in for the spec'd 3D render
 * of glowing cellular spheres in a dark aquatic environment. Layered radial
 * gradients + heavy blur create the depth-of-field (bokeh) effect.
 *
 * The field is a fixed deterministic array (no runtime randomness) so SSR and
 * client markup always match. All motion is disabled under reduced-motion.
 */

type CellTint = 'mint' | 'teal' | 'sky';

/** Soft "membrane + glow" gradients, one per tint. */
const TINT_GRADIENT: Record<CellTint, string> = {
  mint: 'radial-gradient(circle at 35% 30%, rgba(214,255,242,0.95) 0%, rgba(0,230,161,0.8) 20%, rgba(0,230,161,0.22) 55%, transparent 72%)',
  teal: 'radial-gradient(circle at 35% 30%, rgba(204,251,241,0.9) 0%, rgba(45,212,191,0.7) 22%, rgba(45,212,191,0.18) 55%, transparent 72%)',
  sky: 'radial-gradient(circle at 35% 30%, rgba(224,242,254,0.9) 0%, rgba(56,189,248,0.6) 24%, rgba(56,189,248,0.15) 55%, transparent 72%)',
};

type Cell = {
  /** diameter in px */
  size: number;
  left: string;
  top: string;
  /** gaussian blur radius in px — larger = further from the focal plane */
  blur: number;
  opacity: number;
  tint: CellTint;
  duration: string;
  delay: string;
};

/** Out-of-focus background spheres (the bokeh field), weighted to the right. */
const BOKEH: Cell[] = [
  { size: 260, left: '66%', top: '8%', blur: 42, opacity: 0.45, tint: 'mint', duration: '16s', delay: '0s' },
  { size: 190, left: '82%', top: '52%', blur: 28, opacity: 0.5, tint: 'teal', duration: '13s', delay: '-3s' },
  { size: 150, left: '38%', top: '72%', blur: 20, opacity: 0.4, tint: 'sky', duration: '15s', delay: '-6s' },
  { size: 120, left: '56%', top: '62%', blur: 12, opacity: 0.6, tint: 'mint', duration: '11s', delay: '-5s' },
  { size: 48, left: '50%', top: '28%', blur: 6, opacity: 0.5, tint: 'teal', duration: '12s', delay: '-4s' },
];

/** Near-focal cells — sharper, brighter. */
const CELLS: Cell[] = [
  { size: 92, left: '74%', top: '32%', blur: 2, opacity: 0.9, tint: 'mint', duration: '9s', delay: '-2s' },
  { size: 64, left: '87%', top: '20%', blur: 1, opacity: 0.8, tint: 'sky', duration: '10s', delay: '-7s' },
  { size: 34, left: '62%', top: '46%', blur: 0, opacity: 0.9, tint: 'mint', duration: '8s', delay: '-1s' },
];

/** Tiny particle stream dots. */
const PARTICLES: Cell[] = [
  { size: 10, left: '58%', top: '38%', blur: 0, opacity: 0.7, tint: 'mint', duration: '7s', delay: '-2.5s' },
  { size: 7, left: '64%', top: '55%', blur: 0, opacity: 0.6, tint: 'sky', duration: '6s', delay: '-3.5s' },
  { size: 12, left: '71%', top: '68%', blur: 0, opacity: 0.75, tint: 'mint', duration: '7.5s', delay: '-1.5s' },
  { size: 6, left: '79%', top: '44%', blur: 0, opacity: 0.6, tint: 'teal', duration: '6.5s', delay: '-4.5s' },
  { size: 9, left: '84%', top: '36%', blur: 0, opacity: 0.7, tint: 'mint', duration: '8.5s', delay: '-0.5s' },
  { size: 6, left: '90%', top: '62%', blur: 0, opacity: 0.55, tint: 'sky', duration: '6s', delay: '-5.5s' },
  { size: 8, left: '46%', top: '58%', blur: 0, opacity: 0.5, tint: 'teal', duration: '7s', delay: '-3s' },
];

function CellDot({ cell }: { cell: Cell }) {
  return (
    <span
      className="absolute animate-float rounded-full motion-reduce:animate-none"
      style={{
        width: cell.size,
        height: cell.size,
        left: cell.left,
        top: cell.top,
        background: TINT_GRADIENT[cell.tint],
        filter: cell.blur > 0 ? `blur(${cell.blur}px)` : undefined,
        opacity: cell.opacity,
        animationDuration: cell.duration,
        animationDelay: cell.delay,
      }}
    />
  );
}

export function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Deep aquatic base gradient (#011E1A → #03362E) */}
      <div className="absolute inset-0 bg-[linear-gradient(150deg,#011E1A_0%,#03362E_55%,#01241F_100%)]" />

      {/* Ambient volumetric glows */}
      <div className="absolute inset-0 bg-[radial-gradient(45%_40%_at_72%_28%,rgba(0,230,161,0.14),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_35%_at_18%_82%,rgba(20,184,166,0.1),transparent_70%)]" />

      {/* Cellular field */}
      {BOKEH.map((cell, i) => (
        <CellDot key={`bokeh-${i}`} cell={cell} />
      ))}
      {CELLS.map((cell, i) => (
        <CellDot key={`cell-${i}`} cell={cell} />
      ))}
      {PARTICLES.map((cell, i) => (
        <CellDot key={`particle-${i}`} cell={cell} />
      ))}

      {/* Depth vignette + subtle top shade for nav legibility */}
      <div className="absolute inset-0 bg-[radial-gradient(85%_75%_at_50%_42%,transparent_45%,rgba(1,30,26,0.85)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
    </div>
  );
}
