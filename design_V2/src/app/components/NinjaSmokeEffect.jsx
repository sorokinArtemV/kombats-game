import { useEffect, useRef } from 'react';

/**
 * Canvas 2D particle system — mystical smoke cloud around a ninja silhouette.
 *
 * Smoke particles drift AROUND the ninja (not a chimney plume from below) and
 * slowly breathe upward. Ash particles rise from the bottom third with a
 * flicker, rendered with the "lighter" composite so they glow softly when
 * they cross smoke. The canvas sits on top of the ninja <img> with
 * pointer-events: none so clicks still reach the figure underneath.
 */
export function NinjaSmokeEffect({
  width = 400,
  height = 500,
  ninjaSrc,
  intensity = 0.6,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI: back the canvas at device resolution, scale drawing ops once.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;

    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    const smokeCount = Math.round(50 + 20 * clampedIntensity);
    const ashCount = Math.round(10 + 5 * clampedIntensity);

    const rand = (min, max) => min + Math.random() * (max - min);

    const spawnSmoke = () => ({
      // Spawn zone: ellipse AROUND the ninja, not below.
      x: cx + (Math.random() - 0.5) * width * 0.6,
      y: cy + (Math.random() - 0.5) * height * 0.5,
      vx: rand(-0.3, 0.3),
      vy: rand(-0.3, 0.3),
      radius: rand(25, 60),
      growth: rand(0.08, 0.15),
      life: 0,
      maxLife: rand(250, 400),
      // Cool blue-gray tint — blends into a dim blue-purple panel.
      r: Math.round(rand(130, 170)),
      g: Math.round(rand(140, 180)),
      b: Math.round(rand(170, 210)),
      alphaMax: rand(0.12, 0.2),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleFreq: rand(0.015, 0.03),
      wobbleAmp: rand(0.15, 0.35),
    });

    const spawnAsh = () => ({
      // Spawn from the bottom third of the ninja silhouette area.
      x: cx + (Math.random() - 0.5) * width * 0.3,
      y: height * 0.66 + Math.random() * height * 0.3,
      vx: rand(-0.2, 0.2),
      vy: rand(-2.0, -1.2),
      size: rand(1, 2),
      life: 0,
      maxLife: rand(100, 180),
      gravity: rand(0.008, 0.018),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleFreq: rand(0.06, 0.12),
      wobbleAmp: rand(0.3, 0.7),
      r: 255,
      g: Math.round(rand(100, 170)),
      b: Math.round(rand(50, 90)),
    });

    const smokes = [];
    for (let i = 0; i < smokeCount; i++) {
      const p = spawnSmoke();
      // Stagger initial lives so particles don't all pop in together.
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
      ctx.clearRect(0, 0, width, height);

      // ---- Smoke pass (source-over) ----
      ctx.globalCompositeOperation = 'source-over';
      for (const s of smokes) {
        s.life++;
        s.vy -= 0.002; // slow upward bias — breathes up
        s.x +=
          s.vx + Math.sin(s.life * s.wobbleFreq + s.wobblePhase) * s.wobbleAmp * 0.3;
        s.y += s.vy;
        s.radius += s.growth;

        const t = s.life / s.maxLife;
        let lifeAlpha = 1;
        if (t < 0.15) lifeAlpha = t / 0.15; // fade-in over first 15%
        else if (t > 0.6) lifeAlpha = Math.max(0, (1 - t) / 0.4); // fade-out over last 40%

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

        if (s.life >= s.maxLife) {
          Object.assign(s, spawnSmoke());
        }
      }

      // ---- Ash pass (lighter — additive glow) ----
      ctx.globalCompositeOperation = 'lighter';
      for (const a of ashes) {
        a.life++;
        a.vy += a.gravity;
        a.x +=
          a.vx + Math.sin(a.life * a.wobbleFreq + a.wobblePhase) * a.wobbleAmp;
        a.y += a.vy;

        const flicker = Math.sin(a.life * 0.15) * 0.3 + 0.7;
        const t = a.life / a.maxLife;
        let lifeAlpha = 1;
        if (t < 0.1) lifeAlpha = t / 0.1;
        else if (t > 0.7) lifeAlpha = Math.max(0, (1 - t) / 0.3);

        const alpha = flicker * lifeAlpha * clampedIntensity;

        if (alpha > 0.01) {
          const haloR = a.size * 3.5;
          const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, haloR);
          g.addColorStop(0, `rgba(${a.r}, ${a.g}, ${a.b}, ${alpha * 0.9})`);
          g.addColorStop(1, `rgba(${a.r}, ${a.g}, ${a.b}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(a.x, a.y, haloR, 0, Math.PI * 2);
          ctx.fill();

          // Tiny bright core so the ember reads as a point of light.
          ctx.fillStyle = `rgba(${a.r}, ${a.g}, ${a.b}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
          ctx.fill();
        }

        if (a.life >= a.maxLife) {
          Object.assign(a, spawnAsh());
        }
      }

      // Always restore before next frame so outside code sees a clean ctx.
      ctx.globalCompositeOperation = 'source-over';
    };

    if (reducedMotion) {
      // Paint one static frame so the panel isn't bare, but no animation.
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
    };
  }, [width, height, intensity]);

  return (
    <div style={{ position: 'absolute', width, height }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={ninjaSrc}
          alt=""
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block',
            userSelect: 'none',
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
