'use strict';
(function () {
  const state = window.HandWriterInkVariation = {
    localTone: 0.34,
    localStroke: 0.20,
    sheen: 0.45,
    interactive: false
  };

  const proto = CanvasRenderingContext2D.prototype;
  const nativeFill = proto.fill;
  const nativeStroke = proto.stroke;
  const nativeCanvasAdd = HTMLCanvasElement.prototype.addEventListener;
  const pathSeeds = new WeakMap();
  let seedCounter = 0x51f15e;
  let applying = false;
  let redrawQueued = false;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pathSeed(path) {
    let seed = pathSeeds.get(path);
    if (seed == null) {
      seedCounter = (seedCounter + 0x9e3779b9) >>> 0;
      seed = seedCounter;
      pathSeeds.set(path, seed);
    }
    return seed;
  }

  function readControl(id, fallback) {
    const el = document.getElementById(id);
    return el ? Number(el.value) : fallback;
  }

  function fusionStrength() { return clamp(readControl('noiseAmount', 0.55), 0, 1); }
  function sheenStrength() { return clamp(readControl('sheenInput', state.sheen ?? 0.45), 0, 1); }
  function featherSize() { return clamp(readControl('noiseSize', 2), 1, 4); }
  function colorfulEnabled() { return readControl('noiseColor', 1) > 0; }

  function parseColor(value) {
    if (typeof value !== 'string') return { r: 28, g: 27, b: 25 };
    const s = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16) };
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) {
      return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16) };
    }
    const m = s.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return { r: 28, g: 27, b: 25 };
  }

  function rgba(c, a) {
    return `rgba(${Math.round(clamp(c.r, 0, 255))},${Math.round(clamp(c.g, 0, 255))},${Math.round(clamp(c.b, 0, 255))},${a})`;
  }

  function realisticInk(base, rng) {
    const c = parseColor(base);
    const fusion = fusionStrength();
    const lift = 9 + fusion * 13;
    const warm = colorfulEnabled() ? (rng() - 0.42) * 5 : 0;
    return {
      r: c.r + lift + warm + 3,
      g: c.g + lift + warm * 0.45 + 2,
      b: c.b + lift - warm * 0.55 + 1
    };
  }

  function eligible(ctx, path) {
    return !!path && path instanceof Path2D && !applying && ctx.globalAlpha >= 0.4 && typeof ctx.fillStyle === 'string';
  }

  function addToneVariation(ctx, path, rng, ink) {
    const level = state.localTone;
    if (level <= 0) return;
    const extent = 180;
    const x = rng() * extent;
    const y = rng() * extent;
    const radius = 24 + rng() * (30 + level * 42);
    const lighter = rng() > 0.46;
    const alpha = 0.014 + level * 0.026;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const tone = lighter
      ? { r: ink.r + 32, g: ink.g + 30, b: ink.b + 27 }
      : { r: ink.r - 18, g: ink.g - 17, b: ink.b - 15 };
    grad.addColorStop(0, rgba(tone, alpha));
    grad.addColorStop(1, rgba(tone, 0));
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Ballpoint/gel ink commonly retains a smoother surface than paper fibres and
  // therefore produces a weak directional specular sheen under oblique light.
  function addSpecularSheen(ctx, path, rng, ink) {
    const fusion = fusionStrength();
    const sheen = sheenStrength();
    if (fusion <= 0.03 || sheen <= 0.01) return;
    const extent = 190;
    const angle = -0.62 + (rng() - 0.5) * 0.18;
    const cx = extent * (0.34 + rng() * 0.32);
    const cy = extent * (0.24 + rng() * 0.40);
    const len = extent * (0.92 + rng() * 0.12);
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    const a = (0.035 + fusion * 0.05) * (0.25 + sheen * 1.45);
    const wide = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    const hi = { r: ink.r + 118, g: ink.g + 112, b: ink.b + 102 };
    wide.addColorStop(0, 'rgba(255,255,255,0)');
    wide.addColorStop(0.35, rgba(hi, a * 0.18));
    wide.addColorStop(0.50, rgba(hi, a * 0.58));
    wide.addColorStop(0.65, rgba(hi, a * 0.16));
    wide.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.clip(path);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = wide;
    ctx.fillRect(-24, -24, extent + 48, extent + 48);

    if (sheen > 0.08) {
      const thin = ctx.createLinearGradient(cx - dx * 0.9, cy - dy * 0.9, cx + dx * 0.9, cy + dy * 0.9);
      thin.addColorStop(0, 'rgba(255,255,255,0)');
      thin.addColorStop(0.46, rgba(hi, a * 0.22));
      thin.addColorStop(0.495, rgba(hi, a * 1.18));
      thin.addColorStop(0.535, rgba(hi, a * 0.20));
      thin.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.filter = `blur(${0.12 + sheen * 0.45}px)`;
      ctx.fillStyle = thin;
      ctx.fillRect(-24, -24, extent + 48, extent + 48);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  function addFiberRidge(ctx, path, rng, ink) {
    const level = state.localStroke;
    if (level <= 0) return;
    ctx.save();
    ctx.globalAlpha *= 0.014 + level * 0.025;
    ctx.translate((rng() - 0.65) * 0.34, (rng() - 0.35) * 0.30);
    ctx.strokeStyle = rgba({ r: ink.r - 16, g: ink.g - 15, b: ink.b - 13 }, 0.75);
    ctx.lineWidth = 0.16 + level * 0.20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    nativeStroke.call(ctx, path);
    ctx.restore();
  }

  function addChromaMicroNoise(ctx, path, rng) {
    if (!colorfulEnabled()) return;
    const fusion = fusionStrength();
    const count = 2 + Math.round(fusion * 3);
    ctx.save();
    ctx.clip(path);
    for (let i = 0; i < count; i++) {
      const x = rng() * 175;
      const y = rng() * 175;
      const r = 0.22 + rng() * 0.42;
      const a = 0.008 + rng() * 0.012;
      const pick = rng();
      ctx.beginPath();
      ctx.fillStyle = pick < 0.34 ? `rgba(145,98,91,${a})` : pick < 0.67 ? `rgba(82,105,132,${a})` : `rgba(104,119,94,${a})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function addFeatherEdge(ctx, path, rng, ink) {
    const fusion = fusionStrength();
    if (fusion <= 0.02) return;
    const size = featherSize();
    ctx.save();
    ctx.globalAlpha *= 0.008 + fusion * 0.014;
    ctx.shadowBlur = 0.35 + size * 0.18;
    ctx.shadowColor = rgba(ink, 0.28);
    ctx.translate((rng() - 0.5) * 0.28, (rng() - 0.5) * 0.28);
    ctx.strokeStyle = rgba(ink, 0.46);
    ctx.lineWidth = 0.16 + size * 0.045;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    nativeStroke.call(ctx, path);
    ctx.restore();
  }

  proto.fill = function (...args) {
    const path = args[0] instanceof Path2D ? args[0] : null;

    // The main renderer creates several low-alpha auxiliary passes for bleed/noise.
    // During direct manipulation these are skipped, then restored on pointer-up.
    if (state.interactive && path && this.globalAlpha < 0.34) return;
    if (!eligible(this, path)) return nativeFill.apply(this, args);

    applying = true;
    try {
      const tr = this.getTransform();
      const spatial = ((Math.round(tr.e * 4) * 73856093) ^ (Math.round(tr.f * 4) * 19349663)) >>> 0;
      const rng = mulberry32((pathSeed(path) ^ spatial) >>> 0);
      const ink = realisticInk(this.fillStyle, rng);

      this.save();
      this.fillStyle = rgba(ink, 1);
      this.globalAlpha *= 0.89 - fusionStrength() * 0.035;
      const result = nativeFill.call(this, path, ...args.slice(1));
      this.restore();

      if (!state.interactive) {
        addToneVariation(this, path, rng, ink);
        addSpecularSheen(this, path, rng, ink);
        addFiberRidge(this, path, rng, ink);
        addChromaMicroNoise(this, path, rng);
        addFeatherEdge(this, path, rng, ink);
      }
      return result;
    } finally {
      applying = false;
    }
  };

  proto.stroke = function (...args) {
    const path = args[0] instanceof Path2D ? args[0] : null;
    if (state.interactive && (this.globalAlpha < 0.34 || this.shadowBlur > 0.15)) return;

    // The font outline itself can still look too heavy even when strokeWidth is near
    // zero. For very small explicit glyph strokes, softly erode the filled outline
    // along its boundary before drawing the requested hairline stroke. This makes
    // the lower end of the thickness slider genuinely thinner instead of merely
    // "no extra outline".
    if (path && this.globalAlpha >= 0.85 && this.shadowBlur <= 0.15 && this.lineWidth <= 0.24) {
      const target = Math.max(0.01, this.lineWidth || 0.01);
      const thinness = clamp((0.24 - target) / 0.23, 0, 1);
      if (thinness > 0.02) {
        this.save();
        this.globalCompositeOperation = 'destination-out';
        this.globalAlpha = 0.16 + thinness * 0.42;
        this.strokeStyle = 'rgba(0,0,0,1)';
        this.lineWidth = 0.16 + thinness * 0.78;
        this.lineCap = 'round';
        this.lineJoin = 'round';
        nativeStroke.call(this, path);
        this.restore();
      }
    }
    return nativeStroke.apply(this, args);
  };

  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      const zoom = document.getElementById('zoomInput');
      if (zoom) zoom.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function bindRange(id, textId, key) {
    const input = document.getElementById(id);
    const text = document.getElementById(textId);
    if (!input || !text) return;
    input.value = String(state[key]);
    text.textContent = Math.round(state[key] * 100) + '%';
    input.addEventListener('input', () => {
      state[key] = Number(input.value) || 0;
      text.textContent = Math.round(state[key] * 100) + '%';
      requestRedraw();
    });
  }

  function installPointerMoveThrottle() {
    HTMLCanvasElement.prototype.addEventListener = function (type, listener, options) {
      if (this.id === 'canvas' && type === 'pointermove' && typeof listener === 'function') {
        let queued = false;
        let lastEvent = null;
        const wrapped = function (event) {
          lastEvent = event;
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            const e = lastEvent;
            lastEvent = null;
            if (e) listener.call(this, e);
          });
        }.bind(this);
        return nativeCanvasAdd.call(this, type, wrapped, options);
      }
      return nativeCanvasAdd.call(this, type, listener, options);
    };
  }

  function installInteractionFastPath() {
    document.addEventListener('pointerdown', e => {
      if (e.target && e.target.id === 'canvas') state.interactive = true;
    }, true);
    const finish = () => {
      if (!state.interactive) return;
      state.interactive = false;
      requestRedraw();
    };
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
    window.addEventListener('blur', finish);
  }

  function installBestDefaults() {
    window.addEventListener('DOMContentLoaded', () => {
      const amount = document.getElementById('noiseAmount');
      const sheen = document.getElementById('sheenInput');
      const size = document.getElementById('noiseSize');
      const color = document.getElementById('noiseColor');
      if (amount && Number(amount.value) === 0) amount.value = '0.55';
      if (sheen && Number(sheen.value) === 0) sheen.value = '0.45';
      if (size && Number(size.value) < 2) size.value = '2';
      if (color) color.value = '1';
      if (amount) amount.dispatchEvent(new Event('input', { bubbles: true }));
      if (sheen) sheen.dispatchEvent(new Event('input', { bubbles: true }));
      if (size) size.dispatchEvent(new Event('input', { bubbles: true }));
      if (color) color.dispatchEvent(new Event('input', { bubbles: true }));
    }, { once: true });
  }

  installPointerMoveThrottle();
  installInteractionFastPath();
  installBestDefaults();
  bindRange('localToneInput', 'localToneText', 'localTone');
  bindRange('localStrokeInput', 'localStrokeText', 'localStroke');
  bindRange('sheenInput', 'sheenText', 'sheen');
})();
