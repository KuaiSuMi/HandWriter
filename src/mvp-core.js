'use strict';
(function(){
  const GRID = 4;
  const DEFAULT_COLOR = '#161616';
  const FONT_BASE = 'https://cdn.jsdelivr.net/gh/14790897/handwriting-web@main/ttf_files';
  const SIZE_PRESETS = {
    custom: null,
    a4p: { width: 2480, height: 3508 },
    a4l: { width: 3508, height: 2480 },
    letter: { width: 2550, height: 3300 },
    square: { width: 2048, height: 2048 },
    hd: { width: 1920, height: 1080 }
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
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

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    const s = hex.replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const p = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${p(r)}${p(g)}${p(b)}`;
  }

  function rgbaString(rgb, a) {
    return `rgba(${clamp(rgb.r,0,255)},${clamp(rgb.g,0,255)},${clamp(rgb.b,0,255)},${a})`;
  }

  function offsetColor(hex, delta) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r + delta, g + delta, b + delta);
  }

  function jitterInk(hex, rng, amount, grayscaleOnly = true) {
    const { r, g, b } = hexToRgb(hex);
    if (grayscaleOnly) {
      const delta = (rng() - 0.5) * 2 * amount;
      return rgbToHex(r + delta, g + delta, b + delta);
    }
    return rgbToHex(
      r + (rng() - 0.5) * 2 * amount,
      g + (rng() - 0.5) * 2 * amount,
      b + (rng() - 0.5) * 2 * amount
    );
  }

  function commandPoints(c) {
    if (c.type === 'M' || c.type === 'L') return [['x', 'y']];
    if (c.type === 'Q') return [['x1', 'y1'], ['x', 'y']];
    if (c.type === 'C') return [['x1', 'y1'], ['x2', 'y2'], ['x', 'y']];
    return [];
  }

  function bounds(commands) {
    const xs = [], ys = [];
    for (const c of commands) {
      for (const [xk, yk] of commandPoints(c)) {
        if (Number.isFinite(c[xk]) && Number.isFinite(c[yk])) {
          xs.push(c[xk]); ys.push(c[yk]);
        }
      }
    }
    if (!xs.length) return { minX:0, minY:0, maxX:1, maxY:1, width:1, height:1 };
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function warpModel(seed, strengthPx, diversityBoost) {
    const rng = mulberry32(seed), grid = [], signature = [];
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
    const x = u * (GRID - 1), y = v * (GRID - 1);
    const gx = Math.floor(x), gy = Math.floor(y), tx = x - gx, ty = y - gy;
    const p00 = grid[gy][gx], p10 = grid[gy][Math.min(gx + 1, GRID - 1)];
    const p01 = grid[Math.min(gy + 1, GRID - 1)][gx], p11 = grid[Math.min(gy + 1, GRID - 1)][Math.min(gx + 1, GRID - 1)];
    return {
      dx: (1 - tx) * (1 - ty) * p00.dx + tx * (1 - ty) * p10.dx + (1 - tx) * ty * p01.dx + tx * ty * p11.dx,
      dy: (1 - tx) * (1 - ty) * p00.dy + tx * (1 - ty) * p10.dy + (1 - tx) * ty * p01.dy + tx * ty * p11.dy
    };
  }

  function warpPoint(p, b, model) {
    const u = (p.x - b.minX) / Math.max(b.width, 1e-6);
    const v = (p.y - b.minY) / Math.max(b.height, 1e-6);
    const d = displacement(model.grid, u, v);
    const cx = b.minX + b.width / 2, cy = b.minY + b.height / 2;
    const lx = p.x - cx, ly = p.y - cy;
    return {
      x: cx + lx * model.widthScale + ly * model.shearX + d.dx,
      y: cy + ly * model.heightScale + lx * model.shearY + d.dy
    };
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

  function geometry(font, char, fontSize, seed, strength, diversityBias) {
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
        c[xk] = p.x; c[yk] = p.y;
      }
    }
    let wb = bounds(commands);
    const shiftX = pad - wb.minX;
    const shiftY = Math.max(0, pad - wb.minY);
    for (const c of commands) {
      for (const [xk, yk] of commandPoints(c)) {
        c[xk] += shiftX; c[yk] += shiftY;
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

  function ensureGeo(font, g) {
    if (!g.geo || g.geoSeed !== g.variantSeed || g.geoStrength !== g.warpStrength || g.geoBias !== g.instanceBias || g.geoSize !== g.fontSize) {
      g.geo = geometry(font, g.char, g.fontSize, g.variantSeed, g.warpStrength, g.instanceBias);
      g.geoSeed = g.variantSeed;
      g.geoStrength = g.warpStrength;
      g.geoBias = g.instanceBias;
      g.geoSize = g.fontSize;
    }
    return g.geo;
  }

  function preserveBaselineY(font, g, newGeo) {
    const oldGeo = ensureGeo(font, g);
    const baseline = g.y - (oldGeo.height / 2 - oldGeo.baselineYLocal);
    return baseline + (newGeo.height / 2 - newGeo.baselineYLocal);
  }

  function glyphBox(font, g) {
    ensureGeo(font, g);
    return { x: g.x - g.geo.width / 2, y: g.y - g.geo.height / 2, w: g.geo.width, h: g.geo.height };
  }

  function normalizeGlyphTop(font, items, topY) {
    if (!items || !items.length) return items || [];
    let minY = Infinity;
    for (const g of items) {
      const box = glyphBox(font, g);
      if (box.y < minY) minY = box.y;
    }
    if (!Number.isFinite(minY)) return items;
    const dy = topY - minY;
    if (Math.abs(dy) < 0.5) return items;
    for (const g of items) g.y += dy;
    return items;
  }

  function signatureDistance(a, b) {
    let s = 0, n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i]; s += d * d;
    }
    return Math.sqrt(s / Math.max(1, n));
  }

  function candidates(font, g, candidateNonce, count = 6) {
    const rng = mulberry32((g.variantSeed + candidateNonce * 2654435761) ^ 0x9e3779b9);
    const pool = [];
    for (let i = 0; i < 36; i++) {
      const seed = Math.floor(rng() * 0xffffffff) >>> 0;
      const geo = geometry(font, g.char, g.fontSize, seed, g.warpStrength, g.instanceBias + 0.25);
      pool.push({ seed, geo });
    }
    const out = [pool[0]];
    while (out.length < count) {
      let best = null, score = -1;
      for (const c of pool) {
        if (out.includes(c)) continue;
        const d = Math.min(...out.map(o => signatureDistance(c.geo.signature, o.geo.signature)));
        if (d > score) { score = d; best = c; }
      }
      if (!best) break;
      out.push(best);
    }
    return out;
  }

  function groupSelectionBox(font, glyphs) {
    if (!glyphs.length) return null;
    const boxes = glyphs.map(g => glyphBox(font, g));
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    const r = Math.max(...boxes.map(b => b.x + b.w));
    const btm = Math.max(...boxes.map(b => b.y + b.h));
    return { x, y, w: r - x, h: btm - y, cx: (x + r) / 2, cy: (y + btm) / 2 };
  }

  function rectNorm(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
  function pointInRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function rectsIntersect(a, b) { return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y); }

  function rotatePoint(x, y, cx, cy, a) {
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  function pointInRotatedRect(p, box) {
    const q = rotatePoint(p.x, p.y, box.cx, box.cy, -box.angle);
    return pointInRect(q, { x: box.cx - box.w / 2, y: box.cy - box.h / 2, w: box.w, h: box.h });
  }

  function rotatedRectCorners(box) {
    const corners = [
      { x: box.cx - box.w / 2, y: box.cy - box.h / 2 },
      { x: box.cx + box.w / 2, y: box.cy - box.h / 2 },
      { x: box.cx + box.w / 2, y: box.cy + box.h / 2 },
      { x: box.cx - box.w / 2, y: box.cy + box.h / 2 }
    ];
    return corners.map(p => rotatePoint(p.x, p.y, box.cx, box.cy, box.angle));
  }

  window.HandWriterCore = {
    GRID, DEFAULT_COLOR, FONT_BASE, SIZE_PRESETS,
    mulberry32, hashString, mixSeed, normal, clamp, lerp,
    hexToRgb, rgbToHex, rgbaString, offsetColor, jitterInk,
    geometry, ensureGeo, preserveBaselineY, glyphBox, normalizeGlyphTop, candidates,
    groupSelectionBox, rectNorm, pointInRect, rectsIntersect, rotatePoint, pointInRotatedRect, rotatedRectCorners
  };
})();
