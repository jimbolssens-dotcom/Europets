const sharp = require('sharp');
const fs = require('fs');

const COLS = 30;          // hexes across the whole mark
const MARK_MAX_Y = 900;   // below this is the wordmark, not the mark

sharp('/home/user/Europets/website/public/logo.png').raw().ensureAlpha()
  .toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
  const { width: W, height: H } = info;
  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i+1], data[i+2], data[i+3]]; };

  // three channels, separated by colour
  function classify(x, y) {
    if (y >= MARK_MAX_Y) return 0;
    const [r, g, b, a] = at(x, y);
    if (a < 160) return 0;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (r > 150 && g < 110 && b > 70 && b < 190) return 1;        // pink cross
    if (mx < 85) return 2;                                         // dog (near-black)
    if (mx >= 95 && mx <= 205 && (mx - mn) < 60) return 3;          // cat (grey)
    return 0;
  }

  // bounding box of the whole mark
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < MARK_MAX_Y; y++) for (let x = 0; x < W; x++) {
    if (classify(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const bw = x1 - x0, bh = y1 - y0;

  const COLX = bw / COLS;
  const R = COLX / Math.sqrt(3);
  const ROWY = 1.5 * R;
  const ROWS = Math.ceil(bh / ROWY) + 1;

  // sample each hex centre over a small disc; keep the dominant channel
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS + 1; col++) {
      const cx = x0 + col * COLX + (row % 2 ? COLX / 2 : 0);
      const cy = y0 + row * ROWY;
      const rad = R * 0.62;
      const tally = [0, 0, 0, 0];
      let n = 0;
      for (let dy = -rad; dy <= rad; dy += rad / 2.5) {
        for (let dx = -rad; dx <= rad; dx += rad / 2.5) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const px = Math.round(cx + dx), py = Math.round(cy + dy);
          n++;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          tally[classify(px, py)]++;
        }
      }
      const filled = tally[1] + tally[2] + tally[3];
      if (!n || filled / n < 0.36) continue;
      let ch = 1;
      if (tally[2] >= tally[1] && tally[2] >= tally[3]) ch = 2;
      else if (tally[3] >= tally[1] && tally[3] >= tally[2]) ch = 3;
      const lvl = Math.min(3, Math.max(0, Math.round((filled / n) * 3.4) - 1));
      cells.push([col, row, ch, lvl]);
    }
  }

  // ascii proof so we can see whether it actually reads as a dog and a cat
  const glyph = { 1: '#', 2: '@', 3: '+' };
  const art = [];
  for (let row = 0; row < ROWS; row++) {
    let line = (row % 2 ? ' ' : '');
    for (let col = 0; col <= COLS; col++) {
      const c = cells.find(c => c[0] === col && c[1] === row);
      line += c ? glyph[c[2]] + ' ' : '. ';
    }
    art.push(line);
  }
  fs.writeFileSync('mosaic.txt', art.join('\n'));

  const counts = cells.reduce((a, c) => (a[c[2]] = (a[c[2]] || 0) + 1, a), {});
  console.log('grid', COLS + 1, 'x', ROWS, '| cells', cells.length, '| cross', counts[1], 'dog', counts[2], 'cat', counts[3]);
  fs.writeFileSync('mosaic.json', JSON.stringify({ cols: COLS + 1, rows: ROWS, cells }));
  console.log(art.join('\n'));
});
