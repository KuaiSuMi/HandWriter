'use strict';
(function () {
  const state = window.HandWriterInkVariation = {
    localTone: 0.35,
    localStroke: 0.28,
    chromaNoise: 0.22,
    softness: 0.26,
    feather: 0.34,
    inkLift: 0.18
  };

  const proto = CanvasRenderingContext2D.prototype;
  const nativeFill = proto.fill;
  const nativeStroke = proto.stroke;
  const pathSeeds = new WeakMap();
  let seedCounter = 0x51f15e;
  let applying = false;

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

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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

  function realismStrength() {
    return clamp(readControl('noiseAmount', 0.35), 0, 1);
  }

  function featherSize() {
    return clamp(readControl('noiseSize', 1), 1, 4);
  }

  function colorfulEnabled() {
    return readControl('noiseColor', 1) > 0;
  }

  function parseColor(value) {
    if (typeof value !== 'string') return { r: 28, g: 27, b: 25 };
    const hex = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return {
        r: parseInt(hex[1] + hex[1], 16),
        g: parseInt(hex[2] + hex[2], 16),
        b: parseInt(hex[3] + hex[3], 16)
      };
    }
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      };
    }
    const m = hex.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return { r: 28, g: 27, b: 25 };
  }

  function rgba(rgb, alpha) {
    return `rgba(${Math.round(clamp(rgb.r, 0, 255))},${Math.round(clamp(rgb.g, 0, 255))},${Math.round(clamp(rgb.b, 0, 255))},${alpha})`;
  }

  function realisticInk(baseColor, rng) {
    const c = parseColor(baseColor);
    const lift = 9 + state.inkLift * 26 + realismStrength() * 8;
    const warm = colorfulEnabled() ? (rng() - 0.35) * 5 : 0;
    return {
      r: c.r + lift + warm + 2.5,
      g: c.g + lift + warm * 0.35 + 1.2,
      b: c.b + lift - warm * 0.55
    };
  }

  function eligible(ctx, path) {
    if (!path || !(path instanceof Path2D) || applying) return false;
    if (ctx.globalAlpha < 0.4) return false;
    return typeof ctx.fillStyle === 'string';
  }

  function addSoftFoundation(ctx, path, rng, ink) {
    const strength = realismStrength();
    const size = featherSize();
    const blur = 0.28 + state.softness * 0.95 + size * 0.12;
    const passes = 2 + Math.round(strength * 2);
    for (let i = 0; i < passes; i++) {
      ctx.save();
      ctx.filter = `blur(${blur + rng() * 0.35}px)`;
      ctx.globalAlpha *= 0.035 + strength * 0.028;
      ctx.translate((rng() - 0.5) * 0.9, (rng() - 0.5) * 0.9);
      ctx.fillStyle = rgba(ink, 1);
      nativeFill.call(ctx, path);
      ctx.restore();
    }
  }

  function addToneVariation(ctx, path, rng) {
    const level = state.localTone;
    if (level <= 0) return;
    const strength = realismStrength();
    const extent = 190;
    const patches = 4 + Math.round(level * 10);
    ctx.save();
    ctx.clip(path);
    for (let i = 0; i < patches; i++) {
      const x = rng() * extent;
      const y = rng() * extent;
      const radius = 12 + rng() * (28 + level * 52);
      const dark = rng() > 0.5;
      const alpha = (0.014 + rng() * 0.038) * (0.65 + level * 1.45 + strength * 0.4);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      if (dark) {
        grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, `rgba(246,244,239,${alpha * 0.75})`);
        grad.addColorStop(1, 'rgba(246,244,239,0)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  function addChromaNoise(ctx, path, rng) {
    if (!colorfulEnabled()) return;
    const strength = Math.max(0.15, realismStrength());
    const extent = 190;
    const count = 10 + Math.round(state.chromaNoise * 28 + strength * 20);
    ctx.save();
    ctx.clip(path);
    for (let i = 0; i < count; i++) {
      const x = rng() * extent;
      const y = rng() * extent;
      const radius = 0.22 + rng() * (0.55 + strength * 0.55);
      const pick = rng();
      const alpha = 0.014 + rng() * (0.022 + strength * 0.018);
      let c;
      if (pick < 0.34) c = `rgba(150,95,88,${alpha})`;
      else if (pick < 0.67) c = `rgba(78,105,138,${alpha})`;
      else c = `rgba(108,122,92,${alpha * 0.9})`;
      ctx.beginPath();
      ctx.fillStyle = c;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function addStrokeVariation(ctx, path, rng, ink) {
    const level = state.localStroke;
    if (level <= 0) return;
    const strength = realismStrength();
    const extent = 190;
    const patches = 2 + Math.round(level * 8);
    for (let i = 0; i < patches; i++) {
      const x = rng() * extent;
      const y = rng() * extent;
      const rx = 12 + rng() * (22 + level * 40);
      const ry = 9 + rng() * (20 + level * 35);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha *= 0.035 + level * 0.12 + strength * 0.025;
      ctx.strokeStyle = rgba(ink, 1);
      ctx.lineWidth = 0.38 + level * (0.8 + rng() * 1.7);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      nativeStroke.call(ctx, path);
      ctx.restore();
    }
  }

  function addFeatherEdge(ctx, path, rng, ink) {
    const strength = realismStrength();
    const size = featherSize();
    const feather = state.feather * (0.55 + strength * 0.9);
    const passes = 3 + Math.round(size * 0.7);
    for (let i = 0; i < passes; i++) {
      ctx.save();
      ctx.filter = `blur(${0.18 + i * 0.18 + size * 0.08}px)`;
      ctx.globalAlpha *= (0.018 + strength * 0.022) * (1 - i / (passes + 1));
      ctx.translate((rng() - 0.5) * (0.6 + feather), (rng() - 0.5) * (0.6 + feather));
      ctx.strokeStyle = rgba(ink, 1);
      ctx.lineWidth = 0.65 + i * 0.35 + size * 0.22;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      nativeStroke.call(ctx, path);
      ctx.restore();
    }
  }

  proto.fill = function (...args) {
    const path = args[0] instanceof Path2D ? args[0] : null;
    const shouldEnhance = eligible(this, path);
    if (!shouldEnhance) return nativeFill.apply(this, args);

    applying = true;
    try {
      const transform = this.getTransform();
      const spatial = ((Math.round(transform.e * 8) * 73856093) ^ (Math.round(transform.f * 8) * 19349663)) >>> 0;
      const rng = mulberry32((pathSeed(path) ^ spatial) >>> 0);
      const originalFill = this.fillStyle;
      const ink = realisticInk(originalFill, rng);

      addSoftFoundation(this, path, rng, ink);

      this.save();
      this.fillStyle = rgba(ink, 1);
      this.globalAlpha *= 0.89 + (1 - realismStrength()) * 0.035;
      const result = nativeFill.call(this, path, ...args.slice(1));
      this.restore();

      addToneVariation(this, path, rng);
      addChromaNoise(this, path, rng);
      addStrokeVariation(this, path, rng, ink);
      addFeatherEdge(this, path, rng, ink);
      return result;
    } finally {
      applying = false;
    }
  };

  function requestRedraw() {
    const zoom = document.getElementById('zoomInput');
    if (zoom) zoom.dispatchEvent(new Event('input', { bubbles: true }));
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

  bindRange('localToneInput', 'localToneText', 'localTone');
  bindRange('localStrokeInput', 'localStrokeText', 'localStroke');
})();
