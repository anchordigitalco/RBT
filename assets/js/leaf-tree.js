/* The RBT tree, in leaf.
   Draws the real logo tree's trunk and branches (/assets/brand/rbt-tree.svg) and grows a
   crown of leaves on them: the trunk rises, leaves sprout outward, then sway in a slow wind
   and rustle when the pointer moves through them.
   Placements: hero (the takeover: the tree stands in the middle of the white hero, and
   scrolling pushes the view into its crown), field (cropped crown in the Open Enrollment
   card), cta (closing card).
   Without JS the plain logo tree shows in the same spot. */
(() => {
  'use strict';

  const root = document.documentElement;
  if (!document.querySelector('.tree-stage[data-mode]')) return;
  const probe = document.createElement('canvas');
  if (!probe.getContext || !('IntersectionObserver' in window) || !('ResizeObserver' in window)) {
    document.querySelectorAll('.tree-stage[data-mode]').forEach((s) => s.classList.add('is-dead'));
    return;
  }
  window.RBT_TREE = true;

  const SRC = 'assets/brand/rbt-tree.svg';
  const ASPECT = 175.85 / 198.74; // tree viewBox width / height
  const MASK_H = 400;
  const MASK_W = Math.round(MASK_H * ASPECT);
  const CANOPY_BOTTOM = 0.77;     // fraction of tree height where the crown ends
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOVER = window.matchMedia('(hover: hover)').matches;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const PHONE = window.innerWidth < 600;
  const TAU = Math.PI * 2;
  const BUCKETS = 32;             // leaf angles are drawn from 32 pre-rotated sprites

  /* ---------------------------------------------------------- color, from the CSS tokens */
  const css = getComputedStyle(root);
  const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const hex = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const DEEP = hex(token('--foliage-deep', '#2F4425'));
  const MID = hex(token('--foliage', '#557236'));
  const LIGHT = hex(token('--foliage-light', '#89A253'));
  const PALE = hex(token('--foliage-pale', '#B5C67E'));
  const TONES = [mix(DEEP, MID, 0.35), MID, mix(MID, LIGHT, 0.5), LIGHT, mix(LIGHT, PALE, 0.55)];

  /* ---------------------------------------------------------- helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // cubic-bezier(0.22, 1, 0.36, 1), the site easing
  const ease = (() => {
    const cx = 0.66, bx = 3 * (0.36 - 0.22) - cx, ax = 1 - cx - bx;
    const cy = 3, by = -cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 18; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-4) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  })();
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ---------------------------------------------------------- the tree image and its mask */
  function loadTree() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = MASK_W;
        c.height = MASK_H;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, MASK_W, MASK_H);
        const data = x.getImageData(0, 0, MASK_W, MASK_H).data;
        const mask = new Uint8Array(MASK_W * MASK_H);
        for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 1 : 0;
        resolve({ img, mask });
      };
      img.onerror = reject;
      img.src = SRC;
    });
  }

  // Trunk and branches. The logo's thin branches are kept (a morphological opening finds the
  // canopy masses and drops them), fragments not connected to the trunk are removed, and then
  // branches are grown from the cut ends out into the crown (space colonization: each branch
  // tip reaches toward the open crown nearest it), so the tree stands on whole branches.
  function buildWood(img) {
    const H = 800, W = Math.round(H * ASPECT), n = W * H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const id = g.getImageData(0, 0, W, H), d = id.data;
    const A = new Uint8Array(n), B = new Uint8Array(n);
    for (let i = 0; i < n; i++) { A[i] = d[i * 4 + 3]; B[i] = A[i] > 110 ? 1 : 0; }
    const pass = (src, r, horiz, min) => {
      const out = new Uint8Array(n), hit = min ? 0 : 1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let v = 1 - hit;
          const a = horiz ? Math.max(0, x - r) : Math.max(0, y - r);
          const b = horiz ? Math.min(W - 1, x + r) : Math.min(H - 1, y + r);
          for (let k = a; k <= b; k++) {
            if (src[horiz ? y * W + k : k * W + x] === hit) { v = hit; break; }
          }
          out[y * W + x] = v;
        }
      }
      return out;
    };
    const erode = (m, r) => pass(pass(m, r, true, true), r, false, true);
    const dilate = (m, r) => pass(pass(m, r, true, false), r, false, false);
    const opened = dilate(erode(B, 9), 9);  // the canopy masses
    const mass = dilate(opened, 3);
    let tx = 0, tn = 0;
    const ty = Math.round(H * 0.8);
    for (let x = 0; x < W; x++) if (B[ty * W + x]) { tx += x; tn++; }
    tx = tn ? tx / tn : W * 0.42;
    const half = W * 0.085;

    // 1. wood: thin parts, the trunk column (tapering into the crown), roots and ground
    const wood = new Uint8Array(n);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!A[i]) continue;
        const off = Math.abs(x - tx);
        if (!mass[i] || y > H * 0.88 || (off < half && y > H * 0.62 + (off / half) * H * 0.07)) wood[i] = 1;
      }
    }
    // 2. keep only wood connected to the trunk
    const keep = new Uint8Array(n);
    let start = -1;
    for (let dx = 0; dx < W && start < 0; dx++) {
      for (const x of [Math.round(tx) + dx, Math.round(tx) - dx]) {
        const i = Math.round(H * 0.85) * W + x;
        if (x >= 0 && x < W && wood[i] && B[i]) { start = i; break; }
      }
    }
    if (start >= 0) {
      const stack = [start];
      keep[start] = 1;
      while (stack.length) {
        const i = stack.pop(), x = i % W, y = (i - x) / W;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (wood[j] && !keep[j]) { keep[j] = 1; stack.push(j); }
          }
        }
      }
    }
    const bark = hex(token('--leaf', '#61544C'));
    // the kept logo pixels as a mask (grown by a pixel so the vector edge is never trimmed)
    const keepWide = dilate(keep, 1);
    for (let i = 0; i < n; i++) { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = keepWide[i] ? 255 : 0; }
    g.putImageData(id, 0, 0);

    // 3. grow branches into the crown
    const rand = rng(79);
    const attract = [];
    const AS = 14;
    for (let y = 0; y < H * 0.76; y += AS) {
      for (let x = 0; x < W; x += AS) {
        const ax = x + rand() * AS, ay = y + rand() * AS;
        const i = (ay | 0) * W + (ax | 0);
        if (ay < H && ax < W && opened[i] && !(ay > H * 0.62 && Math.abs(ax - tx) < half)) attract.push([ax, ay]);
      }
    }
    const nodes = [];
    const CELL = 50, D = 150, STEP = 7, KILL = 13;
    const grid = new Map();
    const cellKey = (x, y) => ((x / CELL) | 0) + ',' + ((y / CELL) | 0);
    const addNode = (x, y, parent) => {
      const idx = nodes.length;
      nodes.push({ x, y, parent, w: 0 });
      const k = cellKey(x, y);
      (grid.get(k) || grid.set(k, []).get(k)).push(idx);
      return idx;
    };
    for (let y = 0; y < H * 0.74; y += 6) {
      for (let x = 0; x < W; x += 6) if (keep[y * W + x]) addNode(x, y, -1);
    }
    if (!nodes.length) addNode(tx, H * 0.62, -1);
    const R = Math.ceil(D / CELL);
    const nearest = (x, y, rad) => {
      let best = -1, bd = rad * rad;
      const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
      for (let gy = cy - R; gy <= cy + R; gy++) {
        for (let gx = cx - R; gx <= cx + R; gx++) {
          const list = grid.get(gx + ',' + gy);
          if (!list) continue;
          for (const j of list) {
            const dx = nodes[j].x - x, dy = nodes[j].y - y, dd = dx * dx + dy * dy;
            if (dd < bd) { bd = dd; best = j; }
          }
        }
      }
      return best;
    };
    let live = attract.slice();
    for (let iter = 0; iter < 180 && live.length; iter++) {
      const pull = new Map();
      for (const [ax, ay] of live) {
        const j = nearest(ax, ay, D);
        if (j < 0) continue;
        const dx = ax - nodes[j].x, dy = ay - nodes[j].y, len = Math.hypot(dx, dy) || 1;
        const v = pull.get(j) || [0, 0];
        v[0] += dx / len; v[1] += dy / len;
        pull.set(j, v);
      }
      if (!pull.size) break;
      const fresh = [];
      for (const [j, v] of pull) {
        const len = Math.hypot(v[0], v[1]) || 1;
        const nx = nodes[j].x + (v[0] / len + (rand() - 0.5) * 0.3) * STEP;
        const ny = nodes[j].y + (v[1] / len + (rand() - 0.5) * 0.3) * STEP;
        const near = nearest(nx, ny, STEP * 0.55);
        if (near >= 0) continue;
        fresh.push(addNode(nx, ny, j));
      }
      if (!fresh.length) break;
      live = live.filter(([ax, ay]) => {
        for (const f of fresh) {
          const dx = nodes[f].x - ax, dy = nodes[f].y - ay;
          if (dx * dx + dy * dy < KILL * KILL) return false;
        }
        return true;
      });
    }
    // pipe model: a branch is as thick as the twigs it carries
    for (let i = nodes.length - 1; i >= 0; i--) {
      const nd = nodes[i];
      if (nd.parent < 0) continue;
      if (nd.w === 0) nd.w = 1;
      nodes[nd.parent].w += nd.w;
    }
    for (const nd of nodes) nd.lw = clamp(1.6 + Math.sqrt(nd.w) * 1.1, 1.8, 11);
    return { mask: c, nodes, W, H, color: rgb(bark) };
  }

  // Draw the wood into a context in device pixels: the vector logo kept to its wood mask,
  // then the grown branches as strokes. Sharp at any size because nothing is upscaled.
  function drawWood(g, wood, img, dx, dy, ds) {
    const tw = Math.max(1, Math.ceil(wood.W * ds)), th = Math.max(1, Math.ceil(wood.H * ds));
    const t = document.createElement('canvas');
    t.width = tw; t.height = th;
    const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, tw, th);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(wood.mask, 0, 0, tw, th);
    tg.globalCompositeOperation = 'source-over';
    tg.strokeStyle = wood.color;
    tg.lineCap = 'round';
    for (const nd of wood.nodes) {
      if (nd.parent < 0) continue;
      const p = wood.nodes[nd.parent];
      tg.lineWidth = nd.lw * ds;
      tg.beginPath();
      tg.moveTo(p.x * ds, p.y * ds);
      tg.lineTo(nd.x * ds, nd.y * ds);
      tg.stroke();
    }
    g.drawImage(t, dx, dy);
  }

  function summedArea(mask) {
    const W = MASK_W + 1;
    const s = new Uint32Array(W * (MASK_H + 1));
    for (let y = 1; y <= MASK_H; y++) {
      let row = 0;
      for (let x = 1; x <= MASK_W; x++) {
        row += mask[(y - 1) * MASK_W + x - 1];
        s[y * W + x] = s[(y - 1) * W + x] + row;
      }
    }
    return (x, y, k) => {
      x |= 0; y |= 0;
      const x0 = Math.max(0, x - k), y0 = Math.max(0, y - k);
      const x1 = Math.min(MASK_W, x + k + 1), y1 = Math.min(MASK_H, y + k + 1);
      if (x1 <= x0 || y1 <= y0) return 0;
      const sum = s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
      return sum / ((x1 - x0) * (y1 - y0));
    };
  }

  /* ---------------------------------------------------------- leaves */
  const leafCache = new Map();

  function buildLeaves(mask, density, count, seed) {
    const key = count + ':' + seed;
    if (leafCache.has(key)) return leafCache.get(key);
    const rand = rng(seed);
    const yMax = MASK_H * CANOPY_BOTTOM;
    const filled = (x, y) => x >= 0 && y >= 0 && x < MASK_W && y < MASK_H && mask[(y | 0) * MASK_W + (x | 0)] === 1;

    let area = 0;
    for (let y = 0; y < yMax; y++) for (let x = 0; x < MASK_W; x++) area += mask[y * MASK_W + x];
    const s = Math.sqrt(area / count);

    let cx = 0, cy = 0, n = 0;
    for (let y = 0; y < yMax; y += 2) for (let x = 0; x < MASK_W; x += 2) if (mask[y * MASK_W + x]) { cx += x; cy += y; n++; }
    cx /= n; cy /= n;
    let rMax = 0;
    for (let y = 0; y < yMax; y += 3) for (let x = 0; x < MASK_W; x += 3) if (mask[y * MASK_W + x]) rMax = Math.max(rMax, Math.hypot(x - cx, y - cy));

    // where the trunk meets the crown: leaves sprout outward from here
    let tx = 0, tn = 0;
    const ty = Math.round(MASK_H * 0.8);
    for (let x = 0; x < MASK_W; x++) if (mask[ty * MASK_W + x]) { tx += x; tn++; }
    const sprout = { x: tn ? tx / tn : MASK_W * 0.42, y: MASK_H * 0.6 };

    const leaves = [];
    const add = (x, y, edge) => {
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy) / rMax;
      const out = Math.atan2(dy, dx) + Math.PI / 2;
      const angle = rand() < 0.72 ? out + (rand() - 0.5) * 1.6 : rand() * TAU;
      let light = 0.5 - (dx / rMax) * 0.35 - (dy / rMax) * 0.45 + (dist - 0.5) * 0.3 + (rand() - 0.5) * 0.55;
      if (edge) light += 0.08;
      leaves.push({
        x, y, angle,
        tone: clamp(Math.round(light * 4), 0, 4),
        len: lerp(1.7, 2.6, rand()) * (edge ? 0.85 : 1),
        phase: rand() * TAU,
        speed: 0.7 + rand() * 0.6,
        delay: Math.hypot(x - sprout.x, y - sprout.y),
      });
    };

    for (let gy = 0; gy < yMax; gy += s) {
      for (let gx = 0; gx < MASK_W; gx += s) {
        const x = gx + rand() * s, y = gy + rand() * s;
        if (y >= yMax) continue;
        if (y > MASK_H * 0.67 && Math.abs(x - sprout.x) < MASK_W * 0.085) continue; // the trunk stays bare
        if (filled(x, y) && density(x, y, Math.round(s * 1.6)) > 0.42) add(x, y, false);
      }
    }
    // a loose fringe just outside the silhouette, so the outline reads as leaves
    const f = s * 1.05;
    for (let gy = 0; gy < yMax; gy += f) {
      for (let gx = 0; gx < MASK_W; gx += f) {
        const x = gx + rand() * f, y = gy + rand() * f;
        if (y >= yMax * 0.97 || filled(x, y)) continue;
        const d = density(x, y, 5);
        if (d > 0.16 && d < 0.6 && rand() < 0.7) add(x, y, true);
      }
    }

    const maxDelay = Math.max(...leaves.map((l) => l.delay));
    leaves.forEach((l) => {
      l.delay = 0.42 + (l.delay / maxDelay) * 1.0;
      l.bucket = ((Math.round((l.angle / TAU) * BUCKETS) % BUCKETS) + BUCKETS) % BUCKETS;
      l.angle = (l.bucket / BUCKETS) * TAU;
    });
    leaves.sort((a, b) => a.tone - b.tone);
    const out = { leaves, s, cx, cy, rMax };
    leafCache.set(key, out);
    return out;
  }

  /* ---------------------------------------------------------- leaf sprites */
  const sprites = new Map();
  function sprite(tone, len, res = DPR) {
    const L = Math.max(4, Math.round(len));
    const key = tone + ':' + L + ':' + res;
    let c = sprites.get(key);
    if (c) return c;
    const W = L * 0.44, pad = 1;
    const cw = Math.ceil((W + pad * 2) * res), ch = Math.ceil((L + pad * 2) * res);
    c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.scale(res, res);
    const mx = (W + pad * 2) / 2, base = L + pad, tip = pad;
    const col = TONES[tone];
    const grad = g.createLinearGradient(mx - W / 2, 0, mx + W / 2, 0);
    grad.addColorStop(0, rgb(mix(col, PALE, 0.22)));
    grad.addColorStop(0.5, rgb(col));
    grad.addColorStop(1, rgb(mix(col, DEEP, 0.4)));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(mx, base);
    g.bezierCurveTo(mx + W * 0.62, base - L * 0.28, mx + W * 0.42, tip + L * 0.2, mx, tip);
    g.bezierCurveTo(mx - W * 0.42, tip + L * 0.2, mx - W * 0.62, base - L * 0.28, mx, base);
    g.fill();
    g.strokeStyle = rgb(mix(col, DEEP, 0.55), 0.55);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(mx, base);
    g.lineTo(mx, tip + L * 0.18);
    g.stroke();
    c.w = cw / res; c.h = ch / res;
    c.px = mx; c.py = base;
    sprites.set(key, c);
    return c;
  }

  // pre-rotated leaves, shared by every leaf with the same tone, size and angle bucket
  const turned = new Map();
  function rotatedSprite(tone, len, bucket, res = DPR, nb = BUCKETS) {
    const L = Math.max(4, Math.round(len));
    const key = tone + ':' + L + ':' + bucket + ':' + res + ':' + nb;
    let c = turned.get(key);
    if (c) return c;
    const base = sprite(tone, L, res);
    const angle = (bucket / nb) * TAU;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const pts = [[-base.px, -base.py], [base.w - base.px, -base.py], [-base.px, base.h - base.py], [base.w - base.px, base.h - base.py]]
      .map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    const minX = Math.min(...pts.map((q) => q[0])), maxX = Math.max(...pts.map((q) => q[0]));
    const minY = Math.min(...pts.map((q) => q[1])), maxY = Math.max(...pts.map((q) => q[1]));
    c = document.createElement('canvas');
    c.width = Math.ceil((maxX - minX) * res) + 2;
    c.height = Math.ceil((maxY - minY) * res) + 2;
    const g = c.getContext('2d');
    g.setTransform(res * cos, res * sin, -res * sin, res * cos, (-minX + 0.5) * res, (-minY + 0.5) * res);
    g.drawImage(base, -base.px, -base.py, base.w, base.h);
    c.w = c.width / res; c.h = c.height / res;
    c.ox = -minX + 0.5; c.oy = -minY + 0.5;
    turned.set(key, c);
    return c;
  }

  /* ---------------------------------------------------------- one placement */
  const WOOD_DUR = 0.9;
  const LEAF_DUR = 0.65;
  const RUSTLE = 80;

  class Stage {
    constructor(el, tree, set) {
      this.el = el;
      this.mode = el.dataset.mode;
      this.canvas = el.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.img = tree.img;
      this.woodData = tree.wood;
      this.set = set;
      const n = set.leaves.length;
      this.hx = new Float32Array(n);
      this.hy = new Float32Array(n);
      this.len = new Float32Array(n);
      this.on = new Uint8Array(n);
      this.ra = new Float32Array(n);
      this.rv = new Float32Array(n);
      this.dx = new Float32Array(n);
      this.dv = new Float32Array(n);
      this.rot = [];
      this.wood = document.createElement('canvas');
      this.visible = false;
      this.growStart = REDUCE ? -Infinity : null;
      this.grown = REDUCE;
      this.pointer = null;
      this.pvx = 0;
      this.live = false;
      this.zoom = 1;
      this.bleed = parseFloat(el.dataset.bleed) || 0; // canvas reaches past the box by this share
      if (this.mode === 'takeover') {
        this.section = el.closest('.takeover');
        this.box = this.section.querySelector('.takeover__slot .tree-stage'); // the tree's place in the hero
        this.layer = this.section.querySelector('.takeover__hero');          // the hero's words
        this.back = this.layer && this.layer.querySelector('.plate__back');  // the pale name behind the tree
        this.fore = this.layer ? [...this.layer.children].filter((c) => c !== this.back) : []; // top bar, ground, title
        this.zoom = PHONE ? 1.6 : 1.8; // how far the scroll zooms into the crown
      }
      this.dpr = this.mode === 'takeover' ? Math.min(DPR, 1.5) : DPR;
      this.res = this.dpr * this.zoom; // leaves and wood are drawn sharp enough for the zoom
      if (!REDUCE && HOVER) this.bindPointer();
    }

    // fit the tree into a box: bottom aligned, a little air at the sides and top
    fit(R, top) {
      const m = 0.04;
      const scale = Math.min((R.w * (1 - 2 * m)) / MASK_W, (R.h * (1 - top - 0.03)) / MASK_H);
      // on a tall box, lift the tree toward the middle instead of leaving empty space above it
      const free = Math.max(0, R.h * (1 - top - 0.03) - MASK_H * scale);
      return { scale, offX: R.x + (R.w - MASK_W * scale) / 2, offY: R.y + R.h * 0.97 - MASK_H * scale - free * 0.45 };
    }

    // fit the tree to a box drawn at its own proportions: edge to edge, standing on the bottom.
    // The hero's labels point at parts of the tree as shares of this box.
    fitExact(R) {
      const scale = Math.min(R.w / MASK_W, R.h / MASK_H);
      return { scale, offX: R.x + (R.w - MASK_W * scale) / 2, offY: R.y + R.h - MASK_H * scale };
    }

    layout() {
      let w, h, scale, offX, offY;
      if (this.mode === 'takeover') {
        // the canvas covers the whole screen; the tree is laid out at its full-screen size
        this.vw = document.documentElement.clientWidth;
        this.vh = window.innerHeight;
        this.headerH = this.section.offsetTop;
        w = this.vw; h = this.vh + this.headerH;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.style.top = -this.headerH + 'px';
        ({ scale, offX, offY } = this.fit({ x: 0, y: this.headerH, w: this.vw, h: this.vh }, 0.1));
        // where the tree stands in the hero, in canvas coordinates; measured with the hero's own
        // scroll move undone, so a resize mid-scroll still finds the resting place
        const moving = [...this.fore, this.back].filter(Boolean);
        const kept = moving.map((m) => [m.style.translate, m.style.scale]);
        moving.forEach((m) => { m.style.translate = ''; m.style.scale = ''; });
        const br = this.box.getBoundingClientRect(), cr = this.el.getBoundingClientRect();
        moving.forEach((m, i) => {
          [m.style.translate, m.style.scale] = kept[i];
          // each part of the hero moves about the stage's top-left corner, so one move fits all
          m.style.transformOrigin = `${-m.offsetLeft}px ${-m.offsetTop}px`;
        });
        this.start = { x: br.left - cr.left, y: br.top - cr.top + this.headerH, w: br.width, h: br.height };
      } else {
        const rect = this.el.getBoundingClientRect();
        const bw = Math.max(1, rect.width), bh = Math.max(1, rect.height), b = this.bleed;
        w = bw * (1 + 2 * b); h = bh * (1 + 2 * b);
        if (this.mode === 'hero') {
          // the hero's tree fills its box exactly, so the labels land on their parts
          ({ scale, offX, offY } = this.fitExact({ x: bw * b, y: bh * b, w: bw, h: bh }));
        } else if (this.mode === 'field') {
          const cx0 = MASK_W * 0.04, cy0 = MASK_H * 0.02, cw = MASK_W * 0.92, ch = MASK_H * 0.5;
          scale = Math.max(w / cw, h / ch);
          offX = (w - cw * scale) / 2 - cx0 * scale;
          offY = (h - ch * scale) / 2 - cy0 * scale;
        } else {
          ({ scale, offX, offY } = this.fit({ x: 0, y: 0, w, h }, 0.0));
        }
      }
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.scale = scale; this.offX = offX; this.offY = offY;
      this.treeTop = offY;
      this.treeW = MASK_W * scale;
      this.treeH = MASK_H * scale;

      // trunk and branches, rendered once for this size at zoom resolution (capped at ~10M px)
      let res = this.res;
      const area = this.treeW * this.treeH * res * res;
      if (area > 6e6) res *= Math.sqrt(6e6 / area);
      this.wood.width = Math.max(1, Math.ceil(this.treeW * res));
      this.wood.height = Math.max(1, Math.ceil(this.treeH * res));
      const g = this.wood.getContext('2d');
      g.clearRect(0, 0, this.wood.width, this.wood.height);
      drawWood(g, this.woodData, this.img, 0, 0, (this.treeH * res) / this.woodData.H);

      const sDisp = this.set.s * scale;
      const pad = 30;
      this.rot = this.set.leaves.map((l, i) => {
        const x = offX + l.x * scale, y = offY + l.y * scale;
        this.hx[i] = x; this.hy[i] = y;
        this.len[i] = clamp(l.len * sDisp, 5, 46);
        this.on[i] = x > -pad && x < w + pad && y > -pad && y < h + pad ? 1 : 0;
        if (!this.on[i]) return null;
        if (this.mode !== 'takeover') return rotatedSprite(l.tone, this.len[i], l.bucket, this.dpr);
        // takeover: lengths in 3px steps and 16 angles keep the zoom-sharp sprites few
        const L = Math.max(6, Math.round(this.len[i] / 3) * 3);
        return rotatedSprite(l.tone, L, Math.round(l.bucket / 2) % 16, this.res, 16);
      });
      // the crown's middle, where the zoom heads
      this.focus = { x: offX + this.set.cx * scale, y: offY + (this.set.cy + this.set.rMax * 0.12) * scale };
      if (this.mode === 'takeover') this.place(this.progress());
    }

    // takeover: how far the visitor has scrolled through the stage, 0 to 1
    progress() {
      const top = this.section.getBoundingClientRect().top;
      const pinned = this.section.offsetHeight - this.vh;
      // first the zoom into the crown, then the view glides down the tree to the ground
      const done = this.headerH - top, zoomEnd = this.headerH + pinned * 0.52;
      this.pan = clamp((done - zoomEnd - pinned * 0.1) / (pinned * 0.34), 0, 1);
      return clamp(done / zoomEnd, 0, 1);
    }

    // takeover: the tree starts where it stands in the hero and the view pushes into its crown
    // until the crown fills the screen. Returns the transform from the full-screen tree layout
    // to the screen.
    place(p) {
      // ease in and out, but moving from the first pixel of scroll
      const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
      const F = this.focus;
      // at rest: the tree fills its box in the hero
      const s0 = this.fitExact(this.start);
      const k0 = s0.scale / this.scale, tx0 = s0.offX - this.offX * k0, ty0 = s0.offY - this.offY * k0;
      // the crown point travels from where it stands to the middle of the screen while the scale
      // grows evenly (in ratio) to the full zoom, so the push feels steady
      const k = k0 * Math.pow(this.zoom / k0, e);
      const ax = lerp(tx0 + k0 * F.x, this.vw / 2, e);
      const ay = lerp(ty0 + k0 * F.y, this.headerH + this.vh * 0.5, e);
      const tx = ax - k * F.x;
      let ty = ay - k * F.y;
      // after the zoom, glide down the tree until the ground sits near the bottom of the screen
      const q = this.pan || 0;
      const eq = q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
      const groundY = ty + k * (this.offY + this.treeH);
      const drop = Math.max(0, groundY - (this.headerH + this.vh * 0.92)) * eq;
      ty -= drop;
      // the top bar, ground and title ride the tree's own move while they fade
      const s = k / k0, h = this.headerH;
      const o = 1 - clamp(p / 0.3, 0, 1);
      const lx = tx - s * tx0, ly = ty - s * ty0 + (s - 1) * h;
      for (const m of this.fore) {
        const ms = m.style;
        ms.translate = p > 0 ? `${lx.toFixed(2)}px ${ly.toFixed(2)}px` : '';
        ms.scale = p > 0 ? s.toFixed(4) : '';
        ms.opacity = o < 1 ? String(o) : '';
        ms.visibility = o === 0 ? 'hidden' : ''; // nothing invisible stays in the tab order
      }
      // the pale name zooms too, at its own slower speed: it stands behind the tree, so it grows
      // less (about 1.5x while the tree grows 2x), heading for the same point, and stays the whole way
      if (this.back) {
        const sb = Math.pow(s, 0.55);
        const bx = ax - sb * (tx0 + k0 * F.x), by = ay - sb * (ty0 + k0 * F.y) + (sb - 1) * h - drop * 0.55;
        const bs = this.back.style;
        bs.translate = p > 0 ? `${bx.toFixed(2)}px ${by.toFixed(2)}px` : '';
        bs.scale = p > 0 ? sb.toFixed(4) : '';
      }
      // at the very end the bottom of the crown softens into the white page below, so when the
      // stage scrolls away there is no hard edge between the tree and the site
      return { k, tx, ty, clip: null };
    }

    bindPointer() {
      const target = this.el.closest('.enroll-card') || this.el;
      let last = null;
      target.addEventListener('pointermove', (ev) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        if (last) this.pvx = clamp(this.pvx * 0.5 + (x - last.x) * 0.5, -40, 40);
        last = { x, y };
        this.pointer = { x, y };
        wake();
      });
      target.addEventListener('pointerleave', () => { this.pointer = null; last = null; });
    }

    grow(delayMs) {
      if (this.growStart === null) this.growStart = performance.now() + delayMs;
    }

    get active() { return !this.grown; }

    frame(now) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      let k = 1, tx = 0, ty = 0, clip = null;
      if (this.mode === 'takeover') ({ k, tx, ty, clip } = this.place(this.progress()));
      if (this.growStart === null) return;
      const gp = (now - this.growStart) / 1000;
      if (gp < 0) return;
      const sec = now / 1000;
      const growing = !this.grown;
      const S = this.dpr * k, OX = this.dpr * tx, OY = this.dpr * ty;

      ctx.save();
      if (clip) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(clip.x, clip.y, clip.w, clip.h, clip.r);
        else ctx.rect(clip.x, clip.y, clip.w, clip.h);
        ctx.clip();
      }

      // trunk and branches rise from the ground
      const wp = growing ? ease(clamp(gp / WOOD_DUR, 0, 1)) : 1;
      if (wp > 0) {
        ctx.save();
        ctx.setTransform(S, 0, 0, S, OX, OY);
        if (wp < 1) {
          const top = this.treeTop + this.treeH * (1 - wp);
          ctx.beginPath();
          ctx.rect(-1e4, top, 2e4, 2e4);
          ctx.clip();
        }
        ctx.drawImage(this.wood, this.offX, this.treeTop, this.treeW, this.treeH);
        ctx.restore();
      }

      // the crown
      const leaves = this.set.leaves;
      let p = this.pointer;
      if (p && k !== 1) p = { x: (p.x - tx) / k, y: (p.y - ty) / k };
      const reach = RUSTLE / k;
      this.pvx *= 0.9;
      if (!growing) {
        // settled: plain blits; sway and rustle are small shifts along each leaf
        ctx.setTransform(S, 0, 0, S, OX, OY);
        for (let i = 0; i < leaves.length; i++) {
          const spr = this.rot[i];
          if (!spr) continue;
          const l = leaves[i];
          let x = this.hx[i], y = this.hy[i];
          if (!REDUCE) {
            const sway = Math.sin(sec * l.speed + l.phase) * 0.9 + Math.sin(sec * 0.6 - x * 0.012) * 0.8;
            x += Math.cos(l.angle) * sway;
            y += Math.sin(l.angle) * sway * 0.6;
            let target = 0;
            if (p) {
              const ddx = x - p.x, ddy = y - p.y, d = Math.sqrt(ddx * ddx + ddy * ddy);
              if (d < reach) target = (1 - d / reach) * clamp(this.pvx * 0.35, -9, 9);
            }
            this.dv[i] = (this.dv[i] + (target - this.dx[i]) * 0.09) * 0.84;
            this.dx[i] += this.dv[i];
            x += this.dx[i];
            y += Math.abs(this.dx[i]) * 0.25;
          }
          ctx.drawImage(spr, x - spr.ox, y - spr.oy, spr.w, spr.h);
        }
      } else {
        // growing: each leaf drawn turned as it unfurls
        for (let i = 0; i < leaves.length; i++) {
          if (!this.on[i]) continue;
          const l = leaves[i];
          let sc = 1, alpha = 1;
          let x = this.hx[i], y = this.hy[i];
          let a = l.angle;
          if (!REDUCE) {
            a += Math.sin(sec * l.speed + l.phase) * 0.07 + Math.sin(sec * 0.6 - x * 0.012) * 0.06;
            let target = 0;
            if (p) {
              const ddx = x - p.x, ddy = y - p.y, d = Math.sqrt(ddx * ddx + ddy * ddy);
              if (d < reach) target = (1 - d / reach) * clamp(this.pvx * 0.05, -0.9, 0.9);
            }
            this.rv[i] = (this.rv[i] + (target - this.ra[i]) * 0.08) * 0.86;
            this.ra[i] += this.rv[i];
            a += this.ra[i];
          }
          if (growing) {
            const local = (gp - l.delay) / LEAF_DUR;
            if (local <= 0) continue;
            if (local < 1) {
              const e = ease(local);
              sc = 0.2 + 0.8 * e;
              a -= (1 - e) * 0.8;
              alpha = Math.min(1, local * 3.2);
            }
          }
          const spr = sprite(l.tone, this.len[i] * sc, this.dpr);
          const cos = Math.cos(a), sin = Math.sin(a);
          ctx.globalAlpha = alpha;
          ctx.setTransform(S * cos, S * sin, -S * sin, S * cos, OX + S * x, OY + S * y);
          ctx.drawImage(spr, -spr.px, -spr.py, spr.w, spr.h);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (growing && gp > 1.42 + LEAF_DUR + 0.05) this.grown = true;
      if (!this.live) { this.live = true; this.el.classList.add('is-live'); }
    }
  }

  /* ---------------------------------------------------------- loop */
  let list = [];
  let raf = 0;
  let lastActive = 0, lastDraw = 0;
  const poke = () => { lastActive = performance.now(); wake(); };
  function tick(now) {
    raf = 0;
    let any = false;
    const busy = now - lastActive < 400 || list.some((s) => s.visible && s.active);
    if (!busy && now - lastDraw < 30) {
      // idle: the slow sway does not need every frame
      if (list.some((s) => s.visible) && !document.hidden) raf = requestAnimationFrame(tick);
      return;
    }
    lastDraw = now;
    const t0 = performance.now();
    for (const s of list) if (s.visible) { s.frame(now); any = true; }
    // rolling average of drawing time per frame, readable as window.RBT_TREE_MS
    window.RBT_TREE_MS = (window.RBT_TREE_MS || 0) * 0.9 + (performance.now() - t0) * 0.1;
    if (any && !document.hidden && !REDUCE) raf = requestAnimationFrame(tick);
  }
  function wake() {
    if (!raf && !REDUCE) raf = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------- the takeover stage */
  // With motion allowed, one canvas covers the pinned hero and draws the tree from its place in
  // the middle of the hero all the way into the crown.
  const TK = document.querySelector('.takeover');
  let undoTakeover = null;
  if (TK && !REDUCE) {
    const sticky = TK.querySelector('.takeover__sticky');
    const layer = TK.querySelector('.takeover__hero');
    const cv = document.createElement('canvas');
    cv.className = 'takeover__canvas';
    cv.setAttribute('aria-hidden', 'true');
    root.classList.add('takeover-on');
    sticky.dataset.mode = 'takeover';
    sticky.prepend(cv);
    undoTakeover = () => {
      root.classList.remove('takeover-on');
      cv.remove();
      delete sticky.dataset.mode;
      if (layer) [...layer.children].forEach((c) => c.removeAttribute('style'));
    };
  }

  /* ---------------------------------------------------------- start */
  loadTree().then((tree) => {
    tree.wood = buildWood(tree.img);
    const density = summedArea(tree.mask);
    const counts = {
      takeover: PHONE ? 1500 : 2800,
      hero: PHONE ? 1300 : 2200,
      field: PHONE ? 1200 : 1800,
      cta: PHONE ? 1000 : 1500,
    };
    const els = [...document.querySelectorAll('[data-mode]')].filter((el) => !(TK && root.classList.contains('takeover-on') && el.closest('.takeover__slot')));
    list = els.map((el) => new Stage(el, tree, buildLeaves(tree.mask, density, counts[el.dataset.mode] || 1500, 1979)));

    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const s = list.find((x) => x.el === en.target);
        if (!s) continue;
        s.visible = en.isIntersecting;
        if (en.isIntersecting && !REDUCE) {
          if (s.mode === 'takeover' || s.mode === 'hero') s.grow(250);
          else if (s.mode === 'field') s.grow(400);
          else if (en.intersectionRatio >= 0.35) s.grow(60);
        }
        if (REDUCE && en.isIntersecting) s.frame(performance.now());
      }
      wake();
    }, { threshold: [0, 0.35] });

    const ro = new ResizeObserver((entries) => {
      for (const en of entries) {
        const s = list.find((x) => x.el === en.target);
        if (!s) continue;
        s.layout();
        if (REDUCE) s.frame(performance.now());
      }
      wake();
    });

    for (const s of list) {
      s.layout();
      io.observe(s.el);
      ro.observe(s.el);
    }
    const relayout = () => { list.forEach((s) => { s.layout(); if (REDUCE && s.visible) s.frame(performance.now()); }); wake(); };
    window.addEventListener('resize', relayout);
    window.addEventListener('load', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    window.addEventListener('scroll', poke, { passive: true });
    window.addEventListener('pointermove', poke, { passive: true });
  }).catch(() => {
    if (undoTakeover) undoTakeover();
    root.classList.add('tree-fallback'); // the plain logo tree shows, and the hero's labels with it
    document.querySelectorAll('.tree-stage[data-mode]').forEach((s) => s.classList.add('is-dead'));
  });
})();
