'use client';

import { useEffect, useRef } from 'react';

// A wavy plane of extruded hex tiles in perspective, half magenta, half
// black, lit by a diagonal band. Ported as-is from the approved "Hexfield"
// design mockup — same math, just wired to a React ref/effect instead of a
// plain DOMContentLoaded script.
export default function HexField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false });

    const R = 0.7;
    const ROWZ = 1.5 * R;
    const COLX = Math.sqrt(3) * R;
    const INSET = 0.87;
    const THICK = 0.26;
    const CAM_Y = 3.4;
    const Z_NEAR = 2.4;
    const Z_FAR = 50;
    const LX = 10;
    const LZ = 26;

    function hash2(i, j) {
      let h = (i * 374761393 + j * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967295;
    }

    function cluster(i, j) {
      return (
        0.56 * hash2(Math.floor(i / 4) + 11, Math.floor(j / 4) + 3) +
        0.3 * hash2(Math.floor(i / 2) + 71, Math.floor(j / 2) + 29) +
        0.14 * hash2(i, j)
      );
    }

    function heightAt(x, z, i, j) {
      return (
        0.42 * Math.sin(x * 0.26 + z * 0.12) +
        0.3 * Math.cos(z * 0.19 - x * 0.1) +
        0.16 * Math.sin(x * 0.55 - z * 0.33) +
        (hash2(i + 101, j + 57) - 0.5) * 0.26
      );
    }

    const BDX = 0.82;
    const BDZ = 0.57;
    function lightAt(x, z, y) {
      const perp = Math.abs((x - LX) * BDZ - (z - LZ) * BDX);
      const along = (x - LX) * BDX + (z - LZ) * BDZ;
      let b = Math.exp(-(perp * perp) / 150) * Math.exp(-(along * along) / 1900);
      b *= 0.72 + 0.4 * Math.max(0, Math.min(1, y * 0.7 + 0.5));
      return Math.max(0, Math.min(1, b));
    }

    function hsl2rgb(hu, s, l) {
      s /= 100;
      l /= 100;
      const a = s * Math.min(l, 1 - l);
      function ch(n) {
        const k = (n + hu / 30) % 12;
        return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
      }
      return [255 * ch(0), 255 * ch(8), 255 * ch(4)];
    }

    const FOG = [36, 4, 21];
    function mixFog(c, t) {
      return (
        'rgb(' +
        ((c[0] + (FOG[0] - c[0]) * t) | 0) +
        ',' +
        ((c[1] + (FOG[1] - c[1]) * t) | 0) +
        ',' +
        ((c[2] + (FOG[2] - c[2]) * t) | 0) +
        ')'
      );
    }

    function hull(pts) {
      const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      function cross(o, a, b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      }
      const lo = [];
      const hi = [];
      let k;
      for (k = 0; k < p.length; k++) {
        while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[k]) <= 0) lo.pop();
        lo.push(p[k]);
      }
      for (k = p.length - 1; k >= 0; k--) {
        while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p[k]) <= 0) hi.pop();
        hi.push(p[k]);
      }
      lo.pop();
      hi.pop();
      return lo.concat(hi);
    }

    function poly(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.closePath();
    }

    function render() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
      const cw = canvas.clientWidth || 1200;
      const chh = canvas.clientHeight || 700;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(chh * dpr);

      const W = canvas.width;
      const H = canvas.height;
      const f = Math.max(W * 0.5, H * 0.95);
      const cx = W * 0.44;
      const cy = H * 0.015;

      function proj(x, y, z) {
        const s = f / z;
        return [cx + x * s, cy + (CAM_Y - y) * s];
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, W, H);

      const lp = proj(LX, 0, LZ);
      const g = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], Math.max(W, H) * 0.55);
      g.addColorStop(0, 'rgba(255,150,198,1)');
      g.addColorStop(0.18, 'rgba(255,45,135,0.78)');
      g.addColorStop(0.5, 'rgba(158,10,75,0.26)');
      g.addColorStop(1, 'rgba(40,2,19,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const rr = R * INSET;
      const rowMax = Math.ceil(Z_FAR / ROWZ);
      const rowMin = Math.max(1, Math.floor(Z_NEAR / ROWZ));

      for (let j = rowMax; j >= rowMin; j--) {
        const z = j * ROWZ;
        const s = f / z;
        if (s * R < 1.1) continue;
        const off = j % 2 ? COLX / 2 : 0;
        const halfWorld = (Math.max(cx, W - cx) + s * 2.5) / s;
        const iMin = Math.floor((-halfWorld - off) / COLX) - 1;
        const iMax = Math.ceil((halfWorld - off) / COLX) + 1;
        const fog = Math.max(0, Math.min(1, (z - 12) / 38)) * 0.42;

        for (let i = iMin; i <= iMax; i++) {
          const x = i * COLX + off;
          const y = heightAt(x, z, i, j);
          const br = lightAt(x, z, y);
          const pink = cluster(i, j) + br * 0.2 > 0.46;

          let base;
          let rim;
          if (pink) {
            base = hsl2rgb(334, 92 - 46 * br, 13 + 75 * br);
            rim = hsl2rgb(337, 96 - 40 * br, Math.min(97, 34 + 62 * br));
          } else {
            base = hsl2rgb(320, 14, 2 + 9 * br * br);
            rim = hsl2rgb(333, 62, 9 + 34 * br);
          }

          const top = [];
          const all = [];
          for (let k = 0; k < 6; k++) {
            const th = (k * Math.PI) / 3;
            const vx = x + rr * Math.sin(th);
            const vz = z + rr * Math.cos(th);
            const pt = proj(vx, y, vz);
            top.push(pt);
            all.push(pt);
            all.push(proj(vx, y - THICK, vz));
          }

          ctx.fillStyle = mixFog([base[0] * 0.2, base[1] * 0.17, base[2] * 0.19], fog * 0.7);
          poly(hull(all));
          ctx.fill();

          ctx.fillStyle = mixFog(base, fog);
          poly(top);
          ctx.fill();

          if (s * R > 3.5) {
            ctx.strokeStyle = mixFog(rim, fog * 0.6);
            ctx.lineWidth = Math.max(0.6, s * 0.022);
            ctx.stroke();
          }
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      const b = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], Math.max(W, H) * 0.38);
      b.addColorStop(0, 'rgba(255,120,180,0.34)');
      b.addColorStop(1, 'rgba(255,60,140,0)');
      ctx.fillStyle = b;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(W * 0.5, H * 0.42, Math.min(W, H) * 0.42, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
      v.addColorStop(0, 'rgba(4,3,8,0)');
      v.addColorStop(1, 'rgba(4,3,8,0.6)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    let t;
    render();
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(render, 140);
    };
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []);

  return <canvas ref={canvasRef} className="hexfield" aria-hidden="true" />;
}
