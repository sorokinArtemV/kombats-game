import { useEffect, useRef } from 'react';

/**
 * Canvas-only ambient haze around the ninja silhouette.
 *
 * DOM:
 *   <div clip>                 — position:absolute inset:0 overflow:hidden
 *     <canvas>                 — inset:-BLEED, wider/taller than the clip
 *
 * The clip wrapper fills the silhouette container exactly; the canvas
 * extends BLEED pixels beyond on every side so particles aren't clipped
 * at spawn. After each frame we stamp an ELLIPTICAL vignette via
 * `destination-in` — radii computed separately for x and y so that
 * non-square canvases fade to zero alpha evenly on every edge (a plain
 * circular radial mask leaves a visible seam on the long axis).
 *
 * The smoke palette is deliberately darker than the panel background
 * so smoke reads as faint shadow haze rather than a glow.
 */
export function NinjaSmokeOverlay({
  intensity = 0.6,
  spawnWidth,
  spawnHeight,
}) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const BLEED = 40;

    // Shared mutable size record — draw loop, spawners, and the resize
    // handler all read the current values.
    const size = { w: 0, h: 0 };

    const applySize = () => {
      const clipW = wrapper.clientWidth;
      const clipH = wrapper.clientHeight;
      if (clipW <= 0 || clipH <= 0) return;
      size.w = clipW + BLEED * 2;
      size.h = clipH + BLEED * 2;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      canvas.style.width = size.w + 'px';
      canvas.style.height = size.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();

    const ro = new ResizeObserver(applySize);
    ro.observe(wrapper);

    const smokeCount = Math.round((50 + 20 * clampedIntensity) * 1.7);
    const ashCount = Math.round(4 + 2 * clampedIntensity);

    const rand = (min, max) => min + Math.random() * (max - min);

    const spawnSmoke = () => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      // If spawn dimensions are provided (CSS pixels), particles spawn
      // inside that sub-box of the canvas. Used when the canvas is wider
      // than the silhouette (split layout) so smoke originates around
      // the figure and drifts outward into the flanks before fading.
      const spreadX = spawnWidth != null ? spawnWidth : size.w * 0.8;
      const spreadY = spawnHeight != null ? spawnHeight : size.h * 0.72;
      return {
        x: cx + (Math.random() - 0.5) * spreadX,
        y: cy + (Math.random() - 0.5) * spreadY,
        vx: (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.5) * 0.1,
        radius: rand(20, 50),
        growth: rand(0.03, 0.06),
        life: 0,
        maxLife: rand(500, 800),
        // Darker cool-blue — reads as shadow haze against the dim
        // blue-purple panel, not as a glowing cloud.
        r: Math.round(rand(45, 80)),
        g: Math.round(rand(55, 95)),
        b: Math.round(rand(75, 115)),
        alphaMax: rand(0.2, 0.3),
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: rand(0.015, 0.03),
        wobbleAmp: rand(0.15, 0.35),
      };
    };

    const spawnAsh = () => {
      const cx = size.w / 2;
      const lum = Math.round(rand(170, 205));
      return {
        x: cx + (Math.random() - 0.5) * size.w * 0.3,
        y: size.h * 0.66 + Math.random() * size.h * 0.3,
        vx: rand(-0.05, 0.05),
        // Very slow float — dust motes, not rising sparks.
        vy: rand(-0.25, -0.1),
        size: rand(0.5, 1.2),
        life: 0,
        // Longer life compensates for slower motion so particles
        // actually travel some distance before fading.
        maxLife: rand(400, 700),
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: rand(0.02, 0.04),
        wobbleAmp: rand(0.08, 0.2),
        r: lum,
        g: lum,
        b: lum,
      };
    };

    const smokes = [];
    for (let i = 0; i < smokeCount; i++) {
      const p = spawnSmoke();
      p.life = Math.random() * p.maxLife;
      smokes.push(p);
    }

    const ashes = [];
    for (let i = 0; i < ashCount; i++) {
      const p = spawnAsh();
      p.life = Math.random() * p.maxLife;
      ashes.push(p);
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;

    const drawFrame = () => {
      const { w, h } = size;
      if (w <= 0 || h <= 0) return;

      ctx.clearRect(0, 0, w, h);

      // ---- Smoke pass (source-over, dark tint) ----
      ctx.globalCompositeOperation = 'source-over';
      for (const s of smokes) {
        s.life++;
        s.vy -= 0.0008;
        s.x +=
          s.vx + Math.sin(s.life * s.wobbleFreq + s.wobblePhase) * s.wobbleAmp * 0.3;
        s.y += s.vy;
        s.radius += s.growth;

        const t = s.life / s.maxLife;
        let lifeAlpha = 1;
        if (t < 0.15) lifeAlpha = t / 0.15;
        else if (t > 0.6) lifeAlpha = Math.max(0, (1 - t) / 0.4);

        const alpha = s.alphaMax * lifeAlpha;

        if (alpha > 0.001) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
          g.addColorStop(0, `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha})`);
          g.addColorStop(0.55, `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha * 0.45})`);
          g.addColorStop(1, `rgba(${s.r}, ${s.g}, ${s.b}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (s.life >= s.maxLife) Object.assign(s, spawnSmoke());
      }

      // ---- Ash pass (source-over, small dull grey motes) ----
      for (const a of ashes) {
        a.life++;
        a.x +=
          a.vx + Math.sin(a.life * a.wobbleFreq + a.wobblePhase) * a.wobbleAmp;
        a.y += a.vy;

        const t = a.life / a.maxLife;
        let lifeAlpha = 1;
        if (t < 0.1) lifeAlpha = t / 0.1;
        else if (t > 0.7) lifeAlpha = Math.max(0, (1 - t) / 0.3);

        const alpha = lifeAlpha * 0.15 * clampedIntensity;

        if (alpha > 0.01) {
          const haloR = a.size * 3;
          const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, haloR);
          g.addColorStop(0, `rgba(${a.r}, ${a.g}, ${a.b}, ${alpha * 0.6})`);
          g.addColorStop(1, `rgba(${a.r}, ${a.g}, ${a.b}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(a.x, a.y, haloR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(${a.r}, ${a.g}, ${a.b}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
          ctx.fill();
        }

        if (a.life >= a.maxLife) Object.assign(a, spawnAsh());
      }

      // ---- Elliptical edge vignette via destination-in ----
      // Separate radii for x and y so both the narrow (horizontal) and
      // tall (vertical) edges fade to full transparency in step.
      // Outer radius lines up with the visible clip edge; a short inner
      // plateau keeps the center opaque.
      const rx = Math.max(1, w / 2 - BLEED);
      const ry = Math.max(1, h / 2 - BLEED);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(rx, ry); // turns a unit circle into our ellipse
      const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 1)');
      // Longer opaque plateau — the widened smoke spawn stays visible
      // across most of the silhouette area. Outer 50% still fades to 0
      // at the visible edge, so the frame is still hidden.
      vignette.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vignette;
      // Generous rect in local (scaled) space — covers the whole canvas.
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';
    };

    if (reducedMotion) {
      drawFrame();
    } else {
      const tick = () => {
        drawFrame();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [intensity, spawnWidth, spawnHeight]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: '-40px',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
