'use strict';
(function () {
  const states = new WeakMap();
  const imageIds = new WeakMap();
  let imageSeq = 1;

  const HOT_MODES = new Set([
    'moveTextbox','resizeTextbox','rotateTextbox',
    'moveSingleGlyph','moveGlyphGroup','rotateSingleGlyph','rotateGlyphGroup',
    'marqueeSelect','createTextbox'
  ]);

  function imageId(image) {
    if (!image || (typeof image !== 'object' && typeof image !== 'function')) return 0;
    let id = imageIds.get(image);
    if (!id) { id = imageSeq++; imageIds.set(image, id); }
    return id;
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width | 0);
    canvas.height = Math.max(1, height | 0);
    return canvas;
  }

  function resetCanvas(canvas, width, height) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function clear(ctx, width, height) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, width, height);
    ctx.restore();
  }

  function createWorkerState(state) {
    if (state.workerTried) return;
    state.workerTried = true;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return;
    try {
      const worker = new Worker('./src/render-worker.js');
      worker.onmessage = event => {
        const data = event.data || {};
        if (data.type !== 'composed' || !data.bitmap) return;
        if (data.version !== state.composeVersion) {
          if (typeof data.bitmap.close === 'function') data.bitmap.close();
          state.workerBusy = false;
          return;
        }
        if (state.baseBitmap && typeof state.baseBitmap.close === 'function') state.baseBitmap.close();
        state.baseBitmap = data.bitmap;
        state.baseKey = data.key || '';
        state.workerBusy = false;
      };
      worker.onerror = () => {
        state.workerFailed = true;
        state.workerBusy = false;
        try { worker.terminate(); } catch (_) {}
      };
      state.worker = worker;
    } catch (_) {
      state.workerFailed = true;
    }
  }

  function makeState(canvas) {
    const state = {
      canvas,
      width: canvas.width,
      height: canvas.height,
      backgroundCanvas: makeCanvas(canvas.width, canvas.height),
      staticCanvas: makeCanvas(canvas.width, canvas.height),
      activeCanvas: makeCanvas(canvas.width, canvas.height),
      overlayCanvas: makeCanvas(canvas.width, canvas.height),
      backgroundSig: '',
      staticSig: '',
      activeKey: '',
      stableGlobalSig: '',
      baseBitmap: null,
      baseKey: '',
      composeVersion: 0,
      workerBusy: false,
      workerTried: false,
      workerFailed: false,
      worker: null,
      stats: { backgroundBuilds: 0, staticBuilds: 0, activeFrames: 0 }
    };
    state.backgroundCtx = state.backgroundCanvas.getContext('2d');
    state.staticCtx = state.staticCanvas.getContext('2d');
    state.activeCtx = state.activeCanvas.getContext('2d');
    state.overlayCtx = state.overlayCanvas.getContext('2d');
    createWorkerState(state);
    states.set(canvas, state);
    return state;
  }

  function ensureState(canvas) {
    let state = states.get(canvas) || makeState(canvas);
    const width = Math.max(1, canvas.width | 0);
    const height = Math.max(1, canvas.height | 0);
    if (state.width !== width || state.height !== height) {
      state.width = width;
      state.height = height;
      resetCanvas(state.backgroundCanvas, width, height);
      resetCanvas(state.staticCanvas, width, height);
      resetCanvas(state.activeCanvas, width, height);
      resetCanvas(state.overlayCanvas, width, height);
      state.backgroundSig = '';
      state.staticSig = '';
      state.baseKey = '';
      if (state.baseBitmap && typeof state.baseBitmap.close === 'function') state.baseBitmap.close();
      state.baseBitmap = null;
    }
    return state;
  }

  function round(v, digits) {
    const n = Number(v) || 0;
    const p = digits === 3 ? 1000 : digits === 2 ? 100 : 10;
    return Math.round(n * p) / p;
  }

  function glyphKey(g) {
    if (!g) return '';
    return [
      g.id || '', g.char || '', round(g.x, 2), round(g.y, 2), round(g.rotation, 2),
      round(g.scaleX == null ? 1 : g.scaleX, 3), round(g.scaleY == null ? 1 : g.scaleY, 3),
      round(g.fontSize, 2), round(g.warpStrength, 3), round(g.instanceBias, 3),
      g.variantSeed || 0, g.geoSeed || 0, g.inkSeed || 0, g.fill || '',
      round(g.strokeWidth, 3), round(g.opacity == null ? 1 : g.opacity, 3),
      round(g.brightness == null ? 1 : g.brightness, 3)
    ].join(',');
  }

  function backgroundKey(doc) {
    const bg = doc.background || {};
    return [
      doc.width, doc.height, imageId(bg.image), bg.fileName || '', bg.mode || '',
      round(bg.scale == null ? 1 : bg.scale, 3), round(bg.opacity == null ? 1 : bg.opacity, 3)
    ].join('|');
  }

  function currentGlobalInkKey(doc) {
    const get = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const noise = doc.noise || {};
    return [
      round(noise.amount, 2), noise.size || 0, noise.colorful ? 1 : 0, noise.seed || 0,
      get('sheenInput'), get('localToneInput'), get('localStrokeInput')
    ].join('|');
  }

  function activeInfo(env) {
    const ids = env.selectedGlyphIds instanceof Set ? env.selectedGlyphIds : new Set();
    const textboxId = env.selectedTextboxId || null;
    const key = [...ids].sort().join(',') + '|tb:' + (textboxId || '');
    return { ids, textboxId, key };
  }

  function staticKey(env, state, active, hot) {
    if (hot && state.staticSig && active.key === state.activeKey) return state.staticSig;
    const doc = env.doc;
    const parts = [backgroundKey(doc), active.key];
    const ink = window.HandWriterInkVariation;
    const nowGlobal = currentGlobalInkKey(doc);
    if (!ink || !ink.interactive) state.stableGlobalSig = nowGlobal;
    parts.push(ink && ink.interactive && state.stableGlobalSig ? state.stableGlobalSig : nowGlobal);
    for (const g of doc.glyphs || []) if (!active.ids.has(g.id)) parts.push(glyphKey(g));
    for (const tb of doc.draftTextboxes || []) {
      if (tb.id === active.textboxId) continue;
      parts.push('tb:' + tb.id);
      for (const g of tb.previewGlyphs || []) parts.push(glyphKey(g));
    }
    return parts.join(';');
  }

  function withContext(env, targetCtx, fn) {
    const original = env.getContext();
    env.setContext(targetCtx);
    try { return fn(); }
    finally { env.setContext(original); }
  }

  function buildBackground(env, state, sig) {
    clear(state.backgroundCtx, state.width, state.height);
    withContext(env, state.backgroundCtx, () => env.drawBackground());
    state.backgroundSig = sig;
    state.stats.backgroundBuilds++;
    state.composeVersion++;
    state.baseKey = '';
  }

  function buildStatic(env, state, active, sig) {
    clear(state.staticCtx, state.width, state.height);
    withContext(env, state.staticCtx, () => {
      for (const g of env.doc.glyphs || []) if (!active.ids.has(g.id)) env.drawGlyph(g);
      for (const tb of env.doc.draftTextboxes || []) {
        if (tb.id === active.textboxId) continue;
        for (const g of tb.previewGlyphs || []) env.drawGlyph(g);
      }
    });
    state.staticSig = sig;
    state.activeKey = active.key;
    state.stats.staticBuilds++;
    state.composeVersion++;
    state.baseKey = '';
  }

  function renderActive(env, state, active) {
    clear(state.activeCtx, state.width, state.height);
    withContext(env, state.activeCtx, () => {
      for (const g of env.doc.glyphs || []) if (active.ids.has(g.id)) env.drawGlyph(g);
      if (active.textboxId) {
        const tb = (env.doc.draftTextboxes || []).find(item => item.id === active.textboxId);
        if (tb) for (const g of tb.previewGlyphs || []) env.drawGlyph(g);
      }
    });
    state.stats.activeFrames++;
  }

  function renderOverlay(env, state) {
    clear(state.overlayCtx, state.width, state.height);
    withContext(env, state.overlayCtx, () => {
      env.drawSelectionOverlay();
      for (const tb of env.doc.draftTextboxes || []) {
        const glyphs = tb.previewGlyphs;
        tb.previewGlyphs = [];
        try { env.drawDraftTextbox(tb); }
        finally { tb.previewGlyphs = glyphs; }
      }
      const interaction = env.interaction || {};
      if (interaction.mode === 'marqueeSelect' && interaction.selectionRect) {
        env.drawRectOverlay(interaction.selectionRect, 'rgba(0,0,0,.05)', 'rgba(0,0,0,.45)');
      }
      if (interaction.mode === 'createTextbox' && interaction.previewRect) {
        env.drawRectOverlay(interaction.previewRect, 'rgba(0,0,0,.03)', 'rgba(0,0,0,.55)');
      }
    });
  }

  async function scheduleWorkerCompose(state, key) {
    if (!state.worker || state.workerFailed || state.workerBusy || typeof createImageBitmap !== 'function') return;
    state.workerBusy = true;
    const version = ++state.composeVersion;
    try {
      const [background, staticText] = await Promise.all([
        createImageBitmap(state.backgroundCanvas),
        createImageBitmap(state.staticCanvas)
      ]);
      if (version !== state.composeVersion) {
        background.close(); staticText.close(); state.workerBusy = false; return;
      }
      state.worker.postMessage({
        type: 'compose', version, key, width: state.width, height: state.height,
        background, staticText
      }, [background, staticText]);
    } catch (_) {
      state.workerBusy = false;
      state.workerFailed = true;
    }
  }

  function composeToMain(env, state, baseKey) {
    const main = env.getContext();
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = 1;
    main.globalCompositeOperation = 'source-over';
    main.filter = 'none';
    main.clearRect(0, 0, state.width, state.height);
    if (state.baseBitmap && state.baseKey === baseKey) {
      main.drawImage(state.baseBitmap, 0, 0);
    } else {
      main.drawImage(state.backgroundCanvas, 0, 0);
      main.drawImage(state.staticCanvas, 0, 0);
    }
    main.drawImage(state.activeCanvas, 0, 0);
    main.drawImage(state.overlayCanvas, 0, 0);
    main.restore();
  }

  function render(env) {
    if (!env || !env.canvas || !env.doc || !env.getContext || !env.setContext) return false;
    const state = ensureState(env.canvas);
    const active = activeInfo(env);
    const interaction = env.interaction || {};
    const ink = window.HandWriterInkVariation;
    const hot = HOT_MODES.has(interaction.mode) || !!(ink && ink.interactive);

    const bgSig = backgroundKey(env.doc);
    if (state.backgroundSig !== bgSig) buildBackground(env, state, bgSig);

    const stSig = staticKey(env, state, active, hot);
    if (state.staticSig !== stSig || state.activeKey !== active.key) buildStatic(env, state, active, stSig);

    renderActive(env, state, active);
    renderOverlay(env, state);

    const baseKey = state.backgroundSig + '::' + state.staticSig;
    if (state.baseKey !== baseKey && !state.workerBusy) scheduleWorkerCompose(state, baseKey);
    composeToMain(env, state, baseKey);
    return true;
  }

  function stats(canvas) {
    const state = states.get(canvas || document.getElementById('canvas'));
    return state ? { ...state.stats, worker: !!state.worker && !state.workerFailed, baseCached: !!state.baseBitmap } : null;
  }

  window.HandWriterLayeredRenderer = { render, stats };
})();
