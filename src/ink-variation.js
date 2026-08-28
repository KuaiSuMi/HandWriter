'use strict';
(function () {
  const state = window.HandWriterInkVariation = {
    localTone: 0.35,
    localStroke: 0.28
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

  function pathSeed(path) {
    let seed = pathSeeds.get(path);
    if (seed == null) {
      seedCounter = (seedCounter + 0x9e3779b9) >>> 0;
      seed = seedCounter;
      pathSeeds.set(path, seed);
    }
    return seed;
  }

  function eligible(ctx, path) {
    if (!path || !(path instanceof Path2D) || applying) return false;
    if (ctx.globalAlpha < 0.45) return false;
    return typeof ctx.fillStyle === 'string';
  }

  function addToneVariation(ctx, path, rng) {
    const level = state.localTone;
    if (level <= 0) return;

    const extent = 190;
    const patches = 3 + Math.round(level * 8);
    ctx.save();
    ctx.clip(path);
    for (let i = 0; i < patches; i++) {
      const x = rng() * extent;
      const y = rng() * extent;
      const radius = 14 + rng() * (34 + level * 45);
      const dark = rng() > 0.42;
      const alpha = (0.015 + rng() * 0.045) * (0.45 + level * 1.7);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      if (dark) {
        grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.72})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  function addStrokeVariation(ctx, path, rng, baseColor) {
    const level = state.localStroke;
    if (level <= 0) return;

    const extent = 190;
    const patches = 2 + Math.round(level * 7);
    for (let i = 0; i < patches; i++) {
      const x = rng() * extent;
      const y = rng() * extent;
      const rx = 13 + rng() * (24 + level * 38);
      const ry = 10 + rng() * (22 + level * 34);
      const angle = rng() * Math.PI;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.045 + level * 0.13;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 0.45 + level * (0.9 + rng() * 1.9);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      nativeStroke.call(ctx, path);
      ctx.restore();
    }
  }

  proto.fill = function (...args) {
    const path = args[0] instanceof Path2D ? args[0] : null;
    const shouldEnhance = eligible(this, path);
    const baseColor = typeof this.fillStyle === 'string' ? this.fillStyle : '#161616';
    const result = nativeFill.apply(this, args);

    if (!shouldEnhance || (state.localTone <= 0 && state.localStroke <= 0)) return result;
    applying = true;
    try {
      const transform = this.getTransform();
      const spatial = ((Math.round(transform.e * 8) * 73856093) ^ (Math.round(transform.f * 8) * 19349663)) >>> 0;
      const rng = mulberry32((pathSeed(path) ^ spatial) >>> 0);
      addToneVariation(this, path, rng);
      addStrokeVariation(this, path, rng, baseColor);
    } finally {
      applying = false;
    }
    return result;
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
