(() => {
  'use strict';

  const W = 1000;
  const H = 680;
  const GRID = 4;
  const PRESET_FALLBACK_COLOR = '#161616';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const els = {
    presetSelect: document.getElementById('presetSelect'),
    fontInput: document.getElementById('fontInput'),
    fontName: document.getElementById('fontName'),
    text: document.getElementById('textInput'),
    size: document.getElementById('fontSize'),
    sizeVal: document.getElementById('fontSizeVal'),
    strength: document.getElementById('strength'),
    strengthVal: document.getElementById('strengthVal'),
    diversity: document.getElementById('diversity'),
    diversityVal: document.getElementById('diversityVal'),
    generate: document.getElementById('generateBtn'),
    placeholder: document.getElementById('placeholder'),
    stage: document.getElementById('stage'),
    count: document.getElementById('selectedCount'),
    info: document.getElementById('selectionInfo'),
    candidates: document.getElementById('candidateArea'),
    reroll: document.getElementById('rerollBtn'),
    undo: document.getElementById('undoBtn'),
    redo: document.getElementById('redoBtn'),
    del: document.getElementById('deleteBtn'),
    export: document.getElementById('exportBtn'),
    colorInput: document.getElementById('colorInput'),
    colorText: document.getElementById('colorText'),
    thicknessInput: document.getElementById('thicknessInput'),
    thicknessText: document.getElementById('thicknessText'),
    sizeInput: document.getElementById('sizeInput'),
    sizeText: document.getElementById('sizeText'),
    applyStyleBtn: document.getElementById('applyStyleBtn'),
    styleScope: document.getElementById('styleScope'),
    styleHint: document.getElementById('styleHint')
  };

  let font = null;
  let glyphs = [];
  let selected = new Set();
  let past = [];
  let future = [];
  let candidateNonce = 0;
  let pointerMode = null;
  let pointerStart = null;
  let dragSnapshot = null;
  let selectRect = null;
  let rotateState = null;
  let candidateState = { glyphId: null, nonce: -1, list: [] };

  const FONT_BASE = window.HANDWRITER_FONT_REMOTE_BASE;
  const PRESET_FONTS = window.HANDWRITER_FONT_PRESETS;

  function applyFontBuffer(buffer, name) {
    font = opentype.parse(buffer);
    glyphs = [];
    selected.clear();
    past = [];
    future = [];
    candidateNonce = 0;
    resetCandidateState();
    els.fontName.textContent = '已加载：' + name;
    els.generate.disabled = false;
    els.placeholder.hidden = false;
    els.placeholder.style.display = 'flex';
    els.stage.hidden = true;
    els.stage.style.display = 'none';
    els.placeholder.innerHTML = '<strong>' + name + ' 已加载</strong><span>点击“生成文字”开始验证 Variant Engine。</span>';
    refresh();
  }

  async function loadPreset(id) {
    const preset = PRESET_FONTS[id];
    if (!preset) return;
    els.fontName.textContent = '正在加载：' + preset.name + '…';
    els.generate.disabled = true;
    const encoded = encodeURIComponent(preset.file);
    const sources = ['./fonts/' + encoded, FONT_BASE + '/' + encoded];
    let lastError = null;
    for (const url of sources) {
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        applyFontBuffer(await response.arrayBuffer(), preset.name);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    console.error(lastError);
    font = null;
    els.fontName.textContent = '自动加载失败：' + preset.name;
    els.generate.disabled = true;
    els.placeholder.hidden = false;
    els.placeholder.style.display = 'flex';
    els.stage.hidden = true;
    els.stage.style.display = 'none';
    els.placeholder.innerHTML = '<strong>预设字体加载失败</strong><span>请检查网络，或使用右上角“本地字体”。</span>';
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mixSeed(a, b, c) {
    let h = (a ^ Math.imul(b, 2246822519) ^ Math.imul(c, 3266489917)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function normal(rng) {
    const u = Math.max(rng(), 1e-6);
    const v = Math.max(rng(), 1e-6);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clone(gs) {
    return gs.map(g => ({ ...g }));
  }

  function commit(next) {
    past.push(clone(glyphs));
    if (past.length > 80) past.shift();
    glyphs = clone(next);
    future = [];
    refresh();
  }

  function undo() {
    if (!past.length) return;
    future.unshift(clone(glyphs));
    glyphs = past.pop();
    selected.clear();
    refresh();
  }

  function redo() {
    if (!future.length) return;
    past.push(clone(glyphs));
    glyphs = future.shift();
    selected.clear();
    refresh();
  }

  function commandPoints(c) {
    if (c.type === 'M' || c.type === 'L') return [['x', 'y']];
    if (c.type === 'Q') return [['x1', 'y1'], ['x', 'y']];
    if (c.type === 'C') return [['x1', 'y1'], ['x2', 'y2'], ['x', 'y']];
    return [];
  }

  function bounds(commands) {
    const xs = [];
    const ys = [];
    for (const c of commands) {
      for (const [xk, yk] of commandPoints(c)) {
        if (Number.isFinite(c[xk]) && Number.isFinite(c[yk])) {
          xs.push(c[xk]);
          ys.push(c[yk]);
        }
      }
    }
    if (!xs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function warpModel(seed, strengthPx, diversityBoost) {
    const rng = mulberry32(seed);
    const grid = [];
    const signature = [];
    const boost = 1 + diversityBoost * 0.65;
    for (let gy = 0; gy < GRID; gy++) {
      const row = [];
      for (let gx = 0; gx < GRID; gx++) {
        const edge = gx === 0 || gx === GRID - 1 || gy === 0 || gy === GRID - 1;
        const factor = edge ? 0.38 : 1;
        const dx = normal(rng) * strengthPx * factor * 0.72 * boost;
        const dy = normal(rng) * strengthPx * factor * 0.72 * boost;
        row.push({ dx, dy });
        signature.push(dx, dy);
      }
      grid.push(row);
    }
    const widthScale = 1 + normal(rng) * (0.010 + diversityBoost * 0.010);
    const heightScale = 1 + normal(rng) * (0.010 + diversityBoost * 0.010);
    const shearX = normal(rng) * (0.007 + diversityBoost * 0.006);
    const shearY = normal(rng) * (0.004 + diversityBoost * 0.004);
    signature.push((widthScale - 1) * 100, (heightScale - 1) * 100, shearX * 100, shearY * 100);
    return { grid, widthScale, heightScale, shearX, shearY, signature };
  }

  function displacement(grid, u, v) {
    u = Math.max(0, Math.min(0.999999, u));
    v = Math.max(0, Math.min(0.999999, v));
    const x = u * (GRID - 1);
    const y = v * (GRID - 1);
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    const tx = x - gx;
    const ty = y - gy;
    const p00 = grid[gy][gx];
    const p10 = grid[gy][Math.min(gx + 1, GRID - 1)];
    const p01 = grid[Math.min(gy + 1, GRID - 1)][gx];
    const p11 = grid[Math.min(gy + 1, GRID - 1)][Math.min(gx + 1, GRID - 1)];
    return {
      dx: (1 - tx) * (1 - ty) * p00.dx + tx * (1 - ty) * p10.dx + (1 - tx) * ty * p01.dx + tx * ty * p11.dx,
      dy: (1 - tx) * (1 - ty) * p00.dy + tx * (1 - ty) * p10.dy + (1 - tx) * ty * p01.dy + tx * ty * p11.dy
    };
  }

  function warpPoint(p, b, model) {
    const u = (p.x - b.minX) / Math.max(b.width, 1e-6);
    const v = (p.y - b.minY) / Math.max(b.height, 1e-6);
    const d = displacement(model.grid, u, v);
    const cx = b.minX + b.width / 2;
    const cy = b.minY + b.height / 2;
    const lx = p.x - cx;
    const ly = p.y - cy;
    return { x: cx + lx * model.widthScale + ly * model.shearX + d.dx, y: cy + ly * model.heightScale + lx * model.shearY + d.dy };
  }

  function svg(commands) {
    const f = n => Number.isFinite(n) ? n.toFixed(2) : '0';
    return commands.map(c => {
      if (c.type === 'M') return `M ${f(c.x)} ${f(c.y)}`;
      if (c.type === 'L') return `L ${f(c.x)} ${f(c.y)}`;
      if (c.type === 'Q') return `Q ${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`;
      if (c.type === 'C') return `C ${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
      if (c.type === 'Z') return 'Z';
      return '';
    }).join(' ');
  }

  function geometry(char, fontSize, seed, strength, diversityBias) {
    const glyph = font.charToGlyph(char);
    const units = font.unitsPerEm || 1000;
    const ascent = (font.ascender || units * 0.8) / units * fontSize;
    const descent = Math.abs(font.descender || units * 0.2) / units * fontSize;
    const pad = Math.max(2, fontSize * 0.06);
    const baseY = ascent + pad;
    const commands = glyph.getPath(0, baseY, fontSize).commands.map(c => ({ ...c }));
    const b = bounds(commands);
    const model = warpModel(seed, strength * fontSize, diversityBias || 0);
    for (const c of commands) {
      for (const [xk, yk] of commandPoints(c)) {
        const p = warpPoint({ x: c[xk], y: c[yk] }, b, model);
        c[xk] = p.x;
        c[yk] = p.y;
      }
    }
    let wb = bounds(commands);
    const shiftX = pad - wb.minX;
    const shiftY = Math.max(0, pad - wb.minY);
    for (const c of commands) {
      for (const [xk, yk] of commandPoints(c)) {
        c[xk] += shiftX;
        c[yk] += shiftY;
      }
    }
    wb = bounds(commands);
    const baselineYLocal = baseY + shiftY;
    const adv = ((glyph.advanceWidth || units) / units) * fontSize;
    const width = Math.max(adv + pad * 2, wb.maxX + pad, 4);
    const height = Math.max(baselineYLocal + descent + pad, wb.maxY + pad, ascent + descent + pad * 2, 4);
    const pathData = svg(commands);
    return { pathData, path: new Path2D(pathData), width, height, advance: adv, glyphIndex: glyph.index, signature: model.signature, baselineYLocal };
  }

  function sigDist(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s / Math.max(1, n));
  }

  function candidates(g, count = 6) {
    const rng = mulberry32((g.variantSeed + candidateNonce * 2654435761) ^ 0x9e3779b9);
    const pool = [];
    for (let i = 0; i < 36; i++) {
      const seed = Math.floor(rng() * 0xffffffff) >>> 0;
      const geo = geometry(g.char, g.fontSize, seed, g.warpStrength, g.instanceBias + 0.25);
      pool.push({ seed, geo });
    }
    const out = [pool[0]];
    while (out.length < count) {
      let best = null;
      let score = -1;
      for (const c of pool) {
        if (out.includes(c)) continue;
        const d = Math.min(...out.map(o => sigDist(c.geo.signature, o.geo.signature)));
        if (d > score) { score = d; best = c; }
      }
      if (!best) break;
      out.push(best);
    }
    return out;
  }

  function layout() {
    const text = els.text.value;
    const size = +els.size.value;
    const strength = +els.strength.value;
    const diversity = +els.diversity.value;
    const rng = mulberry32(hashString(text + ':' + size + ':' + strength + ':' + diversity));
    const units = font.unitsPerEm || 1000;
    const ascent = (font.ascender || units * 0.8) / units * size;
    const lineHeight = size * 1.55;
    const left = 48;
    const top = 52;
    const repeatCount = new Map();
    let x = left;
    let lineIndex = 0;
    let baseline = top + ascent;
    let idx = 0;
    const result = [];
    for (const ch of Array.from(text)) {
      if (ch === '\n') {
        x = left;
        lineIndex++;
        baseline = top + lineIndex * lineHeight + ascent;
        continue;
      }
      const glyph = font.charToGlyph(ch);
      const adv = ((glyph.advanceWidth || units) / units) * size;
      if (x + adv > W - left && x > left) {
        x = left;
        lineIndex++;
        baseline = top + lineIndex * lineHeight + ascent;
      }
      const occ = repeatCount.get(ch) || 0;
      repeatCount.set(ch, occ + 1);
      const instanceBias = Math.min(1.15, diversity * (0.22 + occ * 0.28));
      const baseSeed = Math.floor(rng() * 0xffffffff) >>> 0;
      const seed = mixSeed(baseSeed, hashString(ch), occ + idx * 17);
      const geo = geometry(ch, size, seed, strength, instanceBias);
      const y = baseline + (geo.height / 2 - geo.baselineYLocal);
      const xJitter = (rng() - 0.5) * size * 0.02;
      const rotation = (rng() - 0.5) * (1.5 + diversity * 1.2 + occ * 0.25);
      const scaleX = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
      const scaleY = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
      const strokeWidth = Math.max(0, 0.22 + occ * 0.03 + (rng() - 0.5) * 0.10);
      result.push({ id: 'g_' + Date.now().toString(36) + '_' + idx++, char: ch, glyphIndex: glyph.index, x: x + geo.width / 2 + xJitter, y, rotation, scaleX, scaleY, fontSize: size, variantSeed: seed, warpStrength: strength, instanceBias, fill: PRESET_FALLBACK_COLOR, strokeWidth, geo, geoSeed: seed, geoStrength: strength, geoBias: instanceBias });
      x += adv + (rng() - 0.5) * size * 0.04;
    }
    return result;
  }

  function ensureGeo(g) {
    if (!g.geo || g.geoSeed !== g.variantSeed || g.geoStrength !== g.warpStrength || g.geoBias !== g.instanceBias || g.geoSize !== g.fontSize) {
      g.geo = geometry(g.char, g.fontSize, g.variantSeed, g.warpStrength, g.instanceBias);
      g.geoSeed = g.variantSeed;
      g.geoStrength = g.warpStrength;
      g.geoBias = g.instanceBias;
      g.geoSize = g.fontSize;
    }
    return g.geo;
  }

  function pointTransform(g, lx, ly) {
    const a = g.rotation * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = (lx - g.geo.width / 2) * g.scaleX;
    const y = (ly - g.geo.height / 2) * g.scaleY;
    return { x: g.x + x * c - y * s, y: g.y + x * s + y * c };
  }

  function invPoint(g, px, py) {
    const a = -g.rotation * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = px - g.x;
    const dy = py - g.y;
    return { x: (dx * c - dy * s) / g.scaleX + g.geo.width / 2, y: (dx * s + dy * c) / g.scaleY + g.geo.height / 2 };
  }

  function glyphBox(g) {
    ensureGeo(g);
    const pts = [[0, 0], [g.geo.width, 0], [g.geo.width, g.geo.height], [0, g.geo.height]].map(p => pointTransform(g, p[0], p[1]));
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function selectionBox() {
    if (!selected.size) return null;
    const boxes = glyphs.filter(g => selected.has(g.id)).map(glyphBox);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    const r = Math.max(...boxes.map(b => b.x + b.w));
    const bt = Math.max(...boxes.map(b => b.y + b.h));
    return { x, y, w: r - x, h: bt - y, cx: (x + r) / 2, cy: (y + bt) / 2 };
  }

  function normalizeTopMargin(items, topPadding = 28) {
    if (!items || !items.length) return items || [];
    let minY = Infinity;
    for (const g of items) {
      ensureGeo(g);
      const box = glyphBox(g);
      if (box.y < minY) minY = box.y;
    }
    if (!Number.isFinite(minY)) return items;
    const dy = topPadding - minY;
    if (Math.abs(dy) < 0.5) return items;
    for (const g of items) g.y += dy;
    return items;
  }

  function resetCandidateState() { candidateState = { glyphId: null, nonce: -1, list: [] }; }

  function draw(showUI = true, target = ctx) {
    target.clearRect(0, 0, W, H);
    target.fillStyle = '#fff';
    target.fillRect(0, 0, W, H);
    for (const g of glyphs) {
      ensureGeo(g);
      target.save();
      target.translate(g.x, g.y);
      target.rotate(g.rotation * Math.PI / 180);
      target.scale(g.scaleX, g.scaleY);
      target.translate(-g.geo.width / 2, -g.geo.height / 2);
      target.fillStyle = g.fill || PRESET_FALLBACK_COLOR;
      target.fill(g.geo.path);
      if ((g.strokeWidth || 0) > 0.001) {
        target.strokeStyle = g.fill || PRESET_FALLBACK_COLOR;
        target.lineWidth = g.strokeWidth;
        target.lineCap = 'round';
        target.lineJoin = 'round';
        target.stroke(g.geo.path);
      }
      target.restore();
    }
    if (!showUI) return;
    const sb = selectionBox();
    if (sb) {
      target.save();
      target.strokeStyle = 'rgba(0,0,0,.55)';
      target.lineWidth = 1;
      target.setLineDash([5, 4]);
      target.strokeRect(sb.x - 0.5, sb.y - 0.5, sb.w + 1, sb.h + 1);
      target.setLineDash([]);
      target.beginPath();
      target.moveTo(sb.cx, sb.y);
      target.lineTo(sb.cx, sb.y - 24);
      target.stroke();
      target.fillStyle = '#fff';
      target.beginPath();
      target.arc(sb.cx, sb.y - 30, 7, 0, Math.PI * 2);
      target.fill();
      target.stroke();
      target.restore();
    }
    if (selectRect) {
      target.save();
      target.fillStyle = 'rgba(0,0,0,.055)';
      target.strokeStyle = 'rgba(0,0,0,.45)';
      target.setLineDash([5, 4]);
      target.fillRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h);
      target.strokeRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h);
      target.restore();
    }
  }

  function hitGlyph(px, py) {
    for (let i = glyphs.length - 1; i >= 0; i--) {
      const g = glyphs[i];
      ensureGeo(g);
      const p = invPoint(g, px, py);
      if (ctx.isPointInPath(g.geo.path, p.x, p.y)) return g;
      if ((g.strokeWidth || 0) > 0.01 && ctx.isPointInStroke(g.geo.path, p.x, p.y)) return g;
    }
    return null;
  }

  function hitRotate(px, py) {
    const sb = selectionBox();
    if (!sb) return false;
    return Math.hypot(px - sb.cx, py - (sb.y - 30)) <= 13;
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function rectNorm(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
  function intersects(a, b) { return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y; }
  function preserveBaselineY(g, newGeo) {
    const oldGeo = ensureGeo(g);
    const baseline = g.y - (oldGeo.height / 2 - oldGeo.baselineYLocal);
    return baseline + (newGeo.height / 2 - newGeo.baselineYLocal);
  }

  function syncStylePanel() {
    const arr = glyphs.filter(g => selected.has(g.id));
    const disabled = !arr.length;
    els.colorInput.disabled = disabled;
    els.thicknessInput.disabled = disabled;
    els.sizeInput.disabled = disabled;
    els.applyStyleBtn.disabled = disabled;
    if (!arr.length) {
      els.styleScope.textContent = '未选择';
      els.styleHint.textContent = '先选择字符';
      els.colorInput.value = PRESET_FALLBACK_COLOR;
      els.thicknessInput.value = '0.30';
      els.sizeInput.value = els.size.value;
      els.colorText.textContent = PRESET_FALLBACK_COLOR;
      els.thicknessText.textContent = '0.30px';
      els.sizeText.textContent = els.size.value + 'px';
      return;
    }
    const first = arr[0];
    els.styleScope.textContent = arr.length === 1 ? '单字编辑' : '批量编辑';
    els.styleHint.textContent = arr.length === 1 ? '当前修改仅作用于该字' : '当前修改会作用于所有已选字';
    els.colorInput.value = first.fill || PRESET_FALLBACK_COLOR;
    els.thicknessInput.value = (first.strokeWidth || 0).toFixed(2);
    els.sizeInput.value = String(Math.round(first.fontSize));
    els.colorText.textContent = els.colorInput.value;
    els.thicknessText.textContent = Number(els.thicknessInput.value).toFixed(2) + 'px';
    els.sizeText.textContent = Math.round(first.fontSize) + 'px';
  }

  function updateCandidates() {
    els.candidates.innerHTML = '';
    const arr = glyphs.filter(g => selected.has(g.id));
    if (arr.length !== 1) {
      els.reroll.hidden = true;
      els.candidates.className = 'muted';
      els.candidates.textContent = arr.length > 1 ? '多选状态下不生成单字候选。' : '单选字符后生成 6 个候选。';
      if (arr.length === 0) resetCandidateState();
      return;
    }
    const g = arr[0];
    if (candidateState.glyphId !== g.id || candidateState.nonce !== candidateNonce || !candidateState.list.length) {
      candidateState = { glyphId: g.id, nonce: candidateNonce, list: candidates(g) };
    }
    const cs = candidateState.list;
    els.reroll.hidden = false;
    els.candidates.className = 'cands';
    for (const c of cs) {
      const btn = document.createElement('button');
      btn.className = 'cand';
      btn.title = 'seed ' + c.seed;
      btn.style.color = g.fill || PRESET_FALLBACK_COLOR;
      if (c.seed === g.variantSeed) { btn.style.borderColor = '#111'; btn.style.background = '#fff'; }
      btn.innerHTML = `<svg viewBox="0 0 ${Math.max(1, c.geo.width)} ${Math.max(1, c.geo.height)}"><path d="${c.geo.pathData}" fill="currentColor"></path></svg>`;
      btn.onclick = () => {
        const next = glyphs.map(x => x.id !== g.id ? x : { ...x, variantSeed: c.seed, geo: c.geo, geoSeed: c.seed, geoStrength: x.warpStrength, geoBias: x.instanceBias, geoSize: x.fontSize, y: preserveBaselineY(x, c.geo) });
        candidateState = { glyphId: g.id, nonce: candidateNonce, list: cs };
        commit(next);
        selected = new Set([g.id]);
        refresh();
      };
      els.candidates.appendChild(btn);
    }
  }

  function refresh() {
    els.count.textContent = selected.size + ' 个字符';
    const arr = glyphs.filter(g => selected.has(g.id));
    if (arr.length) {
      els.info.className = '';
      els.info.innerHTML = `<div class="selectedText">${arr.map(g => g.char).join('')}</div><p class="muted">拖动任一已选字符整体移动；顶部圆形手柄整体旋转。多选时可批量改颜色、粗细、大小。</p>`;
    } else {
      els.info.className = 'muted';
      els.info.textContent = '单击选择；Shift/Ctrl/Cmd 追加；空白处拖拽框选。';
    }
    els.undo.disabled = !past.length;
    els.redo.disabled = !future.length;
    els.del.disabled = !selected.size;
    els.export.disabled = !glyphs.length;
    syncStylePanel();
    updateCandidates();
    draw();
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = pointer(e);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    pointerStart = p;
    if (hitRotate(p.x, p.y) && selected.size) {
      const sb = selectionBox();
      rotateState = { cx: sb.cx, cy: sb.cy, start: Math.atan2(p.y - sb.cy, p.x - sb.cx), snapshot: glyphs.filter(g => selected.has(g.id)).map(g => ({ ...g })) };
      pointerMode = 'rotate';
      return;
    }
    const g = hitGlyph(p.x, p.y);
    if (g) {
      if (!selected.has(g.id)) { if (!add) selected.clear(); selected.add(g.id); }
      else if (add) { selected.delete(g.id); refresh(); return; }
      dragSnapshot = glyphs.filter(x => selected.has(x.id)).map(x => ({ id: x.id, x: x.x, y: x.y }));
      pointerMode = 'drag';
      refresh();
      return;
    }
    if (!add) selected.clear();
    pointerMode = 'select';
    selectRect = { x: p.x, y: p.y, w: 0, h: 0 };
    refresh();
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointerMode) return;
    const p = pointer(e);
    if (pointerMode === 'drag') {
      const dx = p.x - pointerStart.x;
      const dy = p.y - pointerStart.y;
      for (const s of dragSnapshot) {
        const g = glyphs.find(x => x.id === s.id);
        g.x = s.x + dx;
        g.y = s.y + dy;
      }
      draw();
      return;
    }
    if (pointerMode === 'select') { selectRect = rectNorm(pointerStart, p); draw(); return; }
    if (pointerMode === 'rotate') {
      const angle = Math.atan2(p.y - rotateState.cy, p.x - rotateState.cx);
      const delta = angle - rotateState.start;
      const c = Math.cos(delta);
      const s = Math.sin(delta);
      for (const old of rotateState.snapshot) {
        const g = glyphs.find(x => x.id === old.id);
        const dx = old.x - rotateState.cx;
        const dy = old.y - rotateState.cy;
        g.x = rotateState.cx + dx * c - dy * s;
        g.y = rotateState.cy + dx * s + dy * c;
        g.rotation = old.rotation + delta * 180 / Math.PI;
      }
      draw();
    }
  });

  canvas.addEventListener('pointerup', e => {
    const p = pointer(e);
    if (pointerMode === 'drag' && dragSnapshot) {
      const moved = Math.hypot(p.x - pointerStart.x, p.y - pointerStart.y) > 1;
      if (moved) {
        const before = clone(glyphs);
        for (const s of dragSnapshot) { const item = before.find(x => x.id === s.id); if (item) { item.x = s.x; item.y = s.y; } }
        past.push(before);
        future = [];
      }
    }
    if (pointerMode === 'select' && selectRect) {
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!add) selected.clear();
      for (const g of glyphs) if (intersects(selectRect, glyphBox(g))) selected.add(g.id);
    }
    if (pointerMode === 'rotate' && rotateState) {
      const changed = Math.abs(Math.atan2(p.y - rotateState.cy, p.x - rotateState.cx) - rotateState.start) > 0.002;
      if (changed) {
        const before = clone(glyphs);
        for (const old of rotateState.snapshot) {
          const item = before.find(x => x.id === old.id);
          if (item) { item.x = old.x; item.y = old.y; item.rotation = old.rotation; }
        }
        past.push(before);
        future = [];
      }
    }
    pointerMode = null;
    dragSnapshot = null;
    selectRect = null;
    rotateState = null;
    refresh();
  });

  function applyStyleChanges() {
    if (!selected.size) return;
    const fill = els.colorInput.value;
    const strokeWidth = Math.max(0, +els.thicknessInput.value || 0);
    const targetSize = Math.max(24, +els.sizeInput.value || 24);
    const next = glyphs.map(g => {
      if (!selected.has(g.id)) return g;
      const newGeo = geometry(g.char, targetSize, g.variantSeed, g.warpStrength, g.instanceBias);
      return { ...g, fill, strokeWidth, fontSize: targetSize, geo: newGeo, geoSeed: g.variantSeed, geoStrength: g.warpStrength, geoBias: g.instanceBias, geoSize: targetSize, y: preserveBaselineY(g, newGeo) };
    });
    resetCandidateState();
    commit(next);
  }

  els.presetSelect.onchange = () => { void loadPreset(els.presetSelect.value); };
  els.fontInput.onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      els.fontName.textContent = '正在读取：' + file.name;
      applyFontBuffer(await file.arrayBuffer(), file.name);
      const custom = document.createElement('option');
      custom.value = 'custom';
      custom.textContent = '本地：' + file.name;
      const old = els.presetSelect.querySelector('option[value=custom]');
      if (old) old.remove();
      els.presetSelect.appendChild(custom);
      els.presetSelect.value = 'custom';
    } catch (err) { alert('字体解析失败：' + err.message); }
  };
  els.size.oninput = () => { els.sizeVal.textContent = els.size.value + 'px'; };
  els.strength.oninput = () => { els.strengthVal.textContent = (+els.strength.value * 100).toFixed(1) + '%'; };
  els.diversity.oninput = () => { els.diversityVal.textContent = Math.round(+els.diversity.value * 100) + '%'; };
  els.colorInput.oninput = () => { els.colorText.textContent = els.colorInput.value; };
  els.thicknessInput.oninput = () => { els.thicknessText.textContent = Number(els.thicknessInput.value).toFixed(2) + 'px'; };
  els.sizeInput.oninput = () => { els.sizeText.textContent = Math.round(+els.sizeInput.value) + 'px'; };
  els.generate.onclick = () => {
    glyphs = normalizeTopMargin(layout(), 28);
    past = [];
    future = [];
    selected.clear();
    candidateNonce = 0;
    resetCandidateState();
    els.placeholder.hidden = true;
    els.placeholder.style.display = 'none';
    els.stage.hidden = false;
    els.stage.style.display = 'block';
    refresh();
  };
  els.applyStyleBtn.onclick = () => applyStyleChanges();
  els.reroll.onclick = () => { candidateNonce++; resetCandidateState(); updateCandidates(); };
  els.undo.onclick = undo;
  els.redo.onclick = redo;
  els.del.onclick = () => {
    if (!selected.size) return;
    commit(glyphs.filter(g => !selected.has(g.id)));
    selected.clear();
    refresh();
  };
  els.export.onclick = () => {
    const out = document.createElement('canvas');
    out.width = W * 2;
    out.height = H * 2;
    const c = out.getContext('2d');
    c.scale(2, 2);
    draw(false, c);
    const a = document.createElement('a');
    a.download = 'handwriting-variant.png';
    a.href = out.toDataURL('image/png');
    a.click();
  };
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected.size) {
        e.preventDefault();
        commit(glyphs.filter(g => !selected.has(g.id)));
        selected.clear();
        refresh();
      }
    }
  });
  els.sizeVal.textContent = els.size.value + 'px';
  els.strengthVal.textContent = (+els.strength.value * 100).toFixed(1) + '%';
  els.diversityVal.textContent = Math.round(+els.diversity.value * 100) + '%';
  syncStylePanel();
  void loadPreset('yunyan');
})();
