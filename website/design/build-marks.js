/* Turn the Europets logo mark into hexagonal cell maps at several grid
   resolutions. Run: node build-marks.js  ->  marks.json (+ ascii proofs)

   Three things matter for fidelity, and only one of them is grid size:

   1. The artwork strokes the dog and cat in white to lift them off the
      cross. Classifying that stroke as "not a shape" erodes both animals,
      so we flood it back into whichever animal it belongs to first.
   2. Where an animal overlaps the cross, the animal must win the cell —
      the silhouette is the recognisable part, the cross is backdrop.
   3. Partial cells carry a coverage level, so the renderer can shrink and
      dim them. That is what gives a hard hex grid a soft, readable edge. */

const sharp = require('sharp');
const fs = require('fs');

const GRIDS = [
  { key: 'coarse', cols: 22 },
  { key: 'medium', cols: 34 },
  { key: 'fine',   cols: 52 },
];

const MARK_MAX_Y = 900;   // below this is the wordmark, not the mark
const KEY = '0123456789abcdef';
const EMPTY = 0, CROSS = 1, DOG = 2, CAT = 3, EDGE = 4;

sharp('/home/user/Europets/website/public/logo.png').raw().ensureAlpha()
  .toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
  const W = info.width, H = info.height;

  // ---- 1. classify every pixel of the mark -------------------------------
  const lab = new Uint8Array(W * H);
  for (let y = 0; y < MARK_MAX_Y; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 160) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let v = EMPTY;
      if (r > 150 && g < 110 && b > 70 && b < 190) v = CROSS;
      else if (mx < 85) v = DOG;
      else if (mx > 215 && mx - mn < 30) v = EDGE;
      else if (mx >= 90 && mx <= 210 && mx - mn < 60) v = CAT;
      lab[y * W + x] = v;
    }
  }

  // ---- 2. flood the white keyline back into the animal it outlines -------
  const q = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let p = 0; p < W * H; p++) if (lab[p] === DOG || lab[p] === CAT) q[tail++] = p;
  const MAX_SPREAD = 26;
  const dist = new Uint8Array(W * H);
  while (head < tail) {
    const p = q[head++];
    if (dist[p] >= MAX_SPREAD) continue;
    const x = p % W, y = (p / W) | 0;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < 4; k++) {
      const nx = x + near[k][0], ny = y + near[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= MARK_MAX_Y) continue;
      const np = ny * W + nx;
      if (lab[np] !== EDGE) continue;
      lab[np] = lab[p];
      dist[np] = dist[p] + 1;
      q[tail++] = np;
    }
  }
  let reclaimed = 0;
  for (let p = 0; p < W * H; p++) if (lab[p] === EDGE) { lab[p] = EMPTY; } else if (dist[p]) reclaimed++;
  console.log('keyline pixels reclaimed into the animals:', reclaimed);

  // ---- 3. bounding box of the whole mark ---------------------------------
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < MARK_MAX_Y; y++) for (let x = 0; x < W; x++) {
    if (lab[y * W + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }

  // ---- 4. sample each hexagon --------------------------------------------
  const SQ3 = Math.sqrt(3);
  const BIAS = { 1: 1, 2: 1.45, 3: 1.6 };   // animals beat the backdrop
  const FLOOR = { 1: 0.46, 2: 0.32, 3: 0.26 }; // and survive on less coverage

  function sampleGrid(COLS) {
    const bw = x1 - x0;
    const COLX = bw / COLS;
    const R = COLX / SQ3;
    const ROWY = 1.5 * R;
    const ROWS = Math.ceil((y1 - y0) / ROWY) + 1;
    const step = Math.max(1, R / 7);

    const cells = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col <= COLS; col++) {
        const cx = x0 + col * COLX + (row % 2 ? COLX / 2 : 0);
        const cy = y0 + row * ROWY;
        const tally = [0, 0, 0, 0];
        let n = 0;
        for (let dy = -R; dy <= R; dy += step) {
          for (let dx = -R * SQ3 / 2; dx <= R * SQ3 / 2; dx += step) {
            if (Math.abs(dy) > R - Math.abs(dx) / SQ3) continue;   // point in hex
            n++;
            const px = Math.round(cx + dx), py = Math.round(cy + dy);
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const v = lab[py * W + px];
            if (v) tally[v]++;
          }
        }
        if (!n) continue;

        let ch = 0, best = 0;
        for (let c = 1; c <= 3; c++) {
          const score = (tally[c] / n) * BIAS[c];
          if (score > best) { best = score; ch = c; }
        }
        if (!ch) continue;
        const cover = (tally[1] + tally[2] + tally[3]) / n;
        if (cover < FLOOR[ch]) continue;

        const lvl = Math.max(0, Math.min(4, Math.round((cover - 0.3) / 0.7 * 4)));
        cells.push([col, row, ch, lvl]);
      }
    }
    return { cols: COLS + 1, rows: ROWS, cells };
  }

  const out = {};
  const glyph = { 1: '.', 2: '@', 3: 'o' };
  GRIDS.forEach(function (gspec) {
    const g = sampleGrid(gspec.cols);
    const grid = new Array(g.cols * g.rows).fill(0);
    g.cells.forEach(function (c) { grid[c[1] * g.cols + c[0]] = 1 + (c[2] - 1) * 5 + c[3]; });
    out[gspec.key] = { cols: g.cols, rows: g.rows, data: grid.map(function (v) { return KEY[v]; }).join('') };

    const counts = g.cells.reduce(function (a, c) { a[c[2]] = (a[c[2]] || 0) + 1; return a; }, {});
    console.log(gspec.key.padEnd(7), g.cols + 'x' + g.rows,
                '| cells', String(g.cells.length).padStart(4),
                '| cross', counts[1] || 0, 'dog', counts[2] || 0, 'cat', counts[3] || 0);

    const art = [];
    for (let row = 0; row < g.rows; row++) {
      let line = (row % 2 ? ' ' : '');
      for (let col = 0; col < g.cols; col++) {
        const v = grid[row * g.cols + col];
        line += v ? glyph[Math.floor((v - 1) / 5) + 1] + ' ' : '  ';
      }
      art.push(line.replace(/\s+$/, ''));
    }
    fs.writeFileSync('proof-' + gspec.key + '.txt', art.join('\n'));
  });

  fs.writeFileSync('marks.json', JSON.stringify(out));
  console.log('\n--- coarse proof ---\n' + fs.readFileSync('proof-coarse.txt', 'utf8'));
});
