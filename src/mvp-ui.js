'use strict';
(function(){
  const Core = window.HandWriterCore;
  const DEFAULT_COLOR = Core.DEFAULT_COLOR;
  const SIZE_PRESETS = Core.SIZE_PRESETS;
  const FONT_BASE = Core.FONT_BASE;
  const HANDLE_VISUAL = 14;
  const HANDLE_HIT = 18;
  const ROTATE_OFFSET = 34;

  const els = {
    canvas: document.getElementById('canvas'),
    presetSelect: document.getElementById('presetSelect'), fontInput: document.getElementById('fontInput'), fontName: document.getElementById('fontName'),
    textInput: document.getElementById('textInput'), fontSize: document.getElementById('fontSize'), fontSizeVal: document.getElementById('fontSizeVal'), strength: document.getElementById('strength'), strengthVal: document.getElementById('strengthVal'), diversity: document.getElementById('diversity'), diversityVal: document.getElementById('diversityVal'),
    sizePreset: document.getElementById('sizePreset'), canvasWidthInput: document.getElementById('canvasWidthInput'), canvasHeightInput: document.getElementById('canvasHeightInput'), applyCanvasBtn: document.getElementById('applyCanvasBtn'),
    bgInput: document.getElementById('bgInput'), bgMode: document.getElementById('bgMode'), bgScale: document.getElementById('bgScale'), bgScaleText: document.getElementById('bgScaleText'), bgOpacity: document.getElementById('bgOpacity'), bgOpacityText: document.getElementById('bgOpacityText'), clearBgBtn: document.getElementById('clearBgBtn'),
    noiseAmount: document.getElementById('noiseAmount'), noiseAmountText: document.getElementById('noiseAmountText'), noiseSize: document.getElementById('noiseSize'), noiseSizeText: document.getElementById('noiseSizeText'), noiseColor: document.getElementById('noiseColor'), noiseColorText: document.getElementById('noiseColorText'),
    zoomInput: document.getElementById('zoomInput'), zoomText: document.getElementById('zoomText'), newTextboxBtn: document.getElementById('newTextboxBtn'), clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    selectedCount: document.getElementById('selectedCount'), selectionInfo: document.getElementById('selectionInfo'), textboxState: document.getElementById('textboxState'), overflowInfo: document.getElementById('overflowInfo'), textboxInfo: document.getElementById('textboxInfo'),
    boxFontSize: document.getElementById('boxFontSize'), boxFontSizeText: document.getElementById('boxFontSizeText'), boxPadding: document.getElementById('boxPadding'), boxPaddingText: document.getElementById('boxPaddingText'), boxCharGap: document.getElementById('boxCharGap'), boxCharGapText: document.getElementById('boxCharGapText'), boxLineGap: document.getElementById('boxLineGap'), boxLineGapText: document.getElementById('boxLineGapText'), boxOffsetX: document.getElementById('boxOffsetX'), boxOffsetXText: document.getElementById('boxOffsetXText'), boxOffsetY: document.getElementById('boxOffsetY'), boxOffsetYText: document.getElementById('boxOffsetYText'), regenerateBoxBtn: document.getElementById('regenerateBoxBtn'), confirmTextboxBtn: document.getElementById('confirmTextboxBtn'), deleteTextboxBtn: document.getElementById('deleteTextboxBtn'),
    colorInput: document.getElementById('colorInput'), colorText: document.getElementById('colorText'), thicknessInput: document.getElementById('thicknessInput'), thicknessText: document.getElementById('thicknessText'), sizeInput: document.getElementById('sizeInput'), sizeText: document.getElementById('sizeText'), applyStyleBtn: document.getElementById('applyStyleBtn'), styleScope: document.getElementById('styleScope'), styleHint: document.getElementById('styleHint'),
    candidateArea: document.getElementById('candidateArea'), rerollBtn: document.getElementById('rerollBtn'), undoBtn: document.getElementById('undoBtn'), redoBtn: document.getElementById('redoBtn'), deleteBtn: document.getElementById('deleteBtn'), exportBtn: document.getElementById('exportBtn')
  };

  const ctx = els.canvas.getContext('2d');
  const paperCanvas = document.createElement('canvas');
  const paperCtx = paperCanvas.getContext('2d', { willReadFrequently: true });
  let paperMap = null;
  let font = null;
  let doc = createDocument(1240, 1754);
  let selectedGlyphIds = new Set();
  let selectedTextboxId = null;
  let interaction = { mode: null };
  let past = [];
  let future = [];
  let candidateNonce = 0;
  let candidateState = { glyphId: null, nonce: -1, list: [] };
  let multiSelectionBox = null;

  function createDocument(width, height) {
    return {
      width, height, zoom: 0.35,
      background: { image: null, mode: 'contain', opacity: 1, scale: 1, fileName: '' },
      noise: { amount: 0, size: 1, colorful: false, seed: 0x12345678 },
      glyphs: [],
      draftTextboxes: []
    };
  }

  function cloneDoc(source) {
    const plain = JSON.parse(JSON.stringify(source));
    if (source.background.image) plain.background.image = source.background.image;
    return plain;
  }

  function resetSelectionState() {
    selectedGlyphIds = new Set();
    selectedTextboxId = null;
    candidateState = { glyphId: null, nonce: -1, list: [] };
    multiSelectionBox = null;
  }

  function snapshot() {
    past.push(cloneDoc(doc));
    if (past.length > 80) past.shift();
    future = [];
  }

  function restoreHistory(target) {
    doc = target;
    resetSelectionState();
    interaction = { mode: null };
    rebuildPaperMap();
    draw();
    syncUI();
  }

  function undo() { if (!past.length) return; future.unshift(cloneDoc(doc)); restoreHistory(past.pop()); }
  function redo() { if (!future.length) return; past.push(cloneDoc(doc)); restoreHistory(future.shift()); }
  function clearSelection() { resetSelectionState(); }
  function activeTextbox() { return doc.draftTextboxes.find(t => t.id === selectedTextboxId) || null; }
  function selectedGlyphs() { return doc.glyphs.filter(g => selectedGlyphIds.has(g.id)); }
  function nextId(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

  function setCanvasSize(width, height) {
    doc.width = Math.max(300, Math.round(width));
    doc.height = Math.max(300, Math.round(height));
    els.canvas.width = doc.width;
    els.canvas.height = doc.height;
    els.canvas.style.width = Math.round(doc.width * doc.zoom) + 'px';
    els.canvas.style.height = Math.round(doc.height * doc.zoom) + 'px';
    rebuildPaperMap();
  }

  function updateZoom(value) {
    doc.zoom = Math.max(0.1, Math.min(1, +value || 0.35));
    els.zoomInput.value = String(doc.zoom);
    els.zoomText.textContent = Math.round(doc.zoom * 100) + '%';
    els.canvas.style.width = Math.round(doc.width * doc.zoom) + 'px';
    els.canvas.style.height = Math.round(doc.height * doc.zoom) + 'px';
  }

  function applySizePreset(name) {
    const p = SIZE_PRESETS[name];
    if (!p) return;
    els.canvasWidthInput.value = p.width;
    els.canvasHeightInput.value = p.height;
  }

  function commitCanvasSize(width, height) {
    snapshot();
    setCanvasSize(width, height);
    draw();
    syncUI();
  }

  function toCanvasPoint(evt) {
    const r = els.canvas.getBoundingClientRect();
    return { x: (evt.clientX - r.left) / doc.zoom, y: (evt.clientY - r.top) / doc.zoom };
  }

  function getGlyphRenderBox(g) {
    Core.ensureGeo(font, g);
    return { cx: g.x, cy: g.y, w: g.geo.width * (g.scaleX || 1), h: g.geo.height * (g.scaleY || 1), angle: (g.rotation || 0) * Math.PI / 180 };
  }

  function getCurrentSelectionBox() {
    const glyphs = selectedGlyphs();
    if (glyphs.length === 1) return getGlyphRenderBox(glyphs[0]);
    if (glyphs.length > 1) return multiSelectionBox;
    return null;
  }

  function refreshMultiSelection(angle) {
    const arr = selectedGlyphs();
    if (arr.length <= 1) { multiSelectionBox = null; return; }
    const base = Core.groupSelectionBox(font, arr);
    multiSelectionBox = { cx: base.cx, cy: base.cy, w: base.w, h: base.h, angle: angle || 0 };
  }

  function ensureMultiSelection() {
    const arr = selectedGlyphs();
    if (arr.length <= 1) { multiSelectionBox = null; return null; }
    if (!multiSelectionBox) refreshMultiSelection(0);
    return multiSelectionBox;
  }

  function getTextboxRenderBox(tb) {
    return { cx: tb.x + tb.width / 2, cy: tb.y + tb.height / 2, w: tb.width, h: tb.height, angle: (tb.rotation || 0) * Math.PI / 180 };
  }

  function applyTextboxRotation(tb) {
    const box = getTextboxRenderBox(tb);
    const angleDeg = tb.rotation || 0;
    const angle = angleDeg * Math.PI / 180;
    const baseList = (tb.basePreviewGlyphs || []).map(g => createGlyphObject({ ...g, id: g.id }));
    tb.previewGlyphs = baseList.map(src => {
      const q = Core.rotatePoint(src.x, src.y, box.cx, box.cy, angle);
      return createGlyphObject({ ...src, id: src.id, x: q.x, y: q.y, rotation: (src.rotation || 0) + angleDeg });
    });
    return tb;
  }

  function textboxInnerRect(tb) {
    return { x: tb.x + tb.padding + tb.offsetX, y: tb.y + tb.padding + tb.offsetY, w: Math.max(10, tb.width - tb.padding * 2), h: Math.max(10, tb.height - tb.padding * 2) };
  }

  function createGlyphObject(opts) {
    const rng = Core.mulberry32(Core.mixSeed(opts.variantSeed, Core.hashString(opts.char), opts.sequenceIndex || 0));
    return {
      id: opts.id || nextId('g'), char: opts.char, x: opts.x, y: opts.y,
      rotation: opts.rotation || 0, scaleX: opts.scaleX || 1, scaleY: opts.scaleY || 1,
      fontSize: opts.fontSize, variantSeed: opts.variantSeed, warpStrength: opts.warpStrength, instanceBias: opts.instanceBias,
      fill: opts.fill || DEFAULT_COLOR, strokeWidth: opts.strokeWidth || 0,
      inkSeed: opts.inkSeed || Math.floor(rng() * 0xffffffff) >>> 0,
      geo: opts.geo || null, geoSeed: opts.geoSeed, geoStrength: opts.geoStrength, geoBias: opts.geoBias, geoSize: opts.geoSize
    };
  }

  function layoutTextbox(tb) {
    if (!font) return tb;
    const inner = textboxInnerRect(tb), text = tb.text, size = tb.fontSize;
    const strength = tb.warpStrength, diversity = tb.diversity;
    const rng = Core.mulberry32(Core.hashString(text + ':' + size + ':' + strength + ':' + diversity + ':' + tb.id));
    const units = font.unitsPerEm || 1000;
    const ascent = (font.ascender || units * 0.8) / units * size;
    const lineHeight = size * tb.lineGap;
    const left = inner.x, top = inner.y;
    const repeatCount = new Map();
    let x = left, lineIndex = 0, baseline = top + ascent, idx = 0;
    const result = [];
    let overflowCount = 0;

    for (const ch of Array.from(text)) {
      if (ch === '\n') { x = left; lineIndex++; baseline = top + lineIndex * lineHeight + ascent; continue; }
      const glyph = font.charToGlyph(ch);
      const adv = ((glyph.advanceWidth || units) / units) * size + tb.charGap;
      if (x + adv > left + inner.w && x > left) { x = left; lineIndex++; baseline = top + lineIndex * lineHeight + ascent; }
      if (baseline + size * 0.35 > top + inner.h) { overflowCount++; continue; }
      const occ = repeatCount.get(ch) || 0;
      repeatCount.set(ch, occ + 1);
      const instanceBias = Math.min(1.15, diversity * (0.22 + occ * 0.28));
      const baseSeed = Math.floor(rng() * 0xffffffff) >>> 0;
      const seed = Core.mixSeed(baseSeed, Core.hashString(ch), occ + idx * 17);
      const geo = Core.geometry(font, ch, size, seed, strength, instanceBias);
      const y = baseline + (geo.height / 2 - geo.baselineYLocal);
      const xJitter = (rng() - 0.5) * size * 0.02;
      const rotation = (rng() - 0.5) * (1.5 + diversity * 1.2 + occ * 0.25);
      const scaleX = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
      const scaleY = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
      const strokeWidth = Core.clamp(0.22 + occ * 0.03 + (rng() - 0.5) * 0.16, 0, 3);
      const fill = Core.jitterInk(DEFAULT_COLOR, rng, 24, true);
      result.push(createGlyphObject({
        id: nextId('dg'), char: ch, x: x + geo.width / 2 + xJitter, y, rotation, scaleX, scaleY,
        fontSize: size, variantSeed: seed, warpStrength: strength, instanceBias,
        fill, strokeWidth, geo, geoSeed: seed, geoStrength: strength, geoBias: instanceBias, geoSize: size,
        inkSeed: Core.mixSeed(seed, 99173, idx + occ), sequenceIndex: idx
      }));
      x += adv; idx++;
    }
    tb.basePreviewGlyphs = Core.normalizeGlyphTop(font, result, tb.y + tb.padding + tb.offsetY).map(g => createGlyphObject({ ...g, id: g.id }));
    tb.overflowCount = overflowCount;
    applyTextboxRotation(tb);
    return tb;
  }

  function createDraftTextbox(rect) {
    const tb = {
      id: nextId('tb'), x: rect.x, y: rect.y,
      width: Math.max(120, rect.w), height: Math.max(80, rect.h), text: els.textInput.value,
      fontSize: +els.fontSize.value, warpStrength: +els.strength.value, diversity: +els.diversity.value,
      padding: 16, charGap: 0, lineGap: 1.55, offsetX: 0, offsetY: 0, rotation: 0,
      basePreviewGlyphs: [], previewGlyphs: [], overflowCount: 0
    };
    return layoutTextbox(tb);
  }

  function applyTextboxControls() {
    const tb = activeTextbox();
    if (!tb) return;
    tb.text = els.textInput.value;
    tb.fontSize = +els.boxFontSize.value;
    tb.padding = +els.boxPadding.value;
    tb.charGap = +els.boxCharGap.value;
    tb.lineGap = +els.boxLineGap.value;
    tb.offsetX = +els.boxOffsetX.value;
    tb.offsetY = +els.boxOffsetY.value;
    tb.warpStrength = +els.strength.value;
    tb.diversity = +els.diversity.value;
    layoutTextbox(tb);
    draw();
    syncUI();
  }

  function confirmTextbox() {
    const tb = activeTextbox();
    if (!tb) return;
    snapshot();
    const committed = tb.previewGlyphs.map(g => createGlyphObject({ ...g, id: nextId('g') }));
    doc.glyphs.push(...committed);
    doc.draftTextboxes = doc.draftTextboxes.filter(x => x.id !== tb.id);
    selectedTextboxId = null;
    selectedGlyphIds = new Set(committed.map(g => g.id));
    refreshMultiSelection(0);
    draw();
    syncUI();
  }

  function drawBackground() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, doc.width, doc.height);
    const bg = doc.background;
    if (!bg.image) return;
    ctx.save();
    ctx.globalAlpha = bg.opacity;
    if (bg.mode === 'stretch') {
      ctx.drawImage(bg.image, 0, 0, doc.width, doc.height);
    } else {
      const iw = bg.image.width, ih = bg.image.height;
      const scale = bg.mode === 'cover' ? Math.max(doc.width / iw, doc.height / ih) : Math.min(doc.width / iw, doc.height / ih);
      const finalScale = scale * bg.scale;
      const dw = iw * finalScale, dh = ih * finalScale;
      const dx = (doc.width - dw) / 2, dy = (doc.height - dh) / 2;
      ctx.drawImage(bg.image, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  function drawBackgroundToContext(target, w, h) {
    target.save();
    target.fillStyle = '#fff';
    target.fillRect(0, 0, w, h);
    const bg = doc.background;
    if (!bg.image) { target.restore(); return; }
    target.globalAlpha = bg.opacity;
    if (bg.mode === 'stretch') {
      target.drawImage(bg.image, 0, 0, w, h);
    } else {
      const iw = bg.image.width, ih = bg.image.height;
      const scale = bg.mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      const finalScale = scale * bg.scale;
      const dw = iw * finalScale, dh = ih * finalScale;
      const dx = (w - dw) / 2, dy = (h - dh) / 2;
      target.drawImage(bg.image, dx, dy, dw, dh);
    }
    target.restore();
  }

  function rebuildPaperMap() {
    const sampleScale = Math.max(1, Math.ceil(Math.max(doc.width, doc.height) / 900));
    const w = Math.max(32, Math.round(doc.width / sampleScale));
    const h = Math.max(32, Math.round(doc.height / sampleScale));
    paperCanvas.width = w;
    paperCanvas.height = h;
    drawBackgroundToContext(paperCtx, w, h);
    const image = paperCtx.getImageData(0, 0, w, h);
    const src = image.data;
    const luminance = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      luminance[i] = (0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2]) / 255;
    }
    const smooth = new Float32Array(w * h);
    const contrast = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, sum2 = 0, count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const xx = Math.max(0, Math.min(w - 1, x + ox));
            const yy = Math.max(0, Math.min(h - 1, y + oy));
            const val = luminance[yy * w + xx];
            sum += val; sum2 += val * val; count++;
          }
        }
        const mean = sum / count;
        smooth[y * w + x] = mean;
        contrast[y * w + x] = Math.sqrt(Math.max(0, sum2 / count - mean * mean));
      }
    }
    const texture = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) texture[i] = Core.clamp((luminance[i] - smooth[i]) * 3.5, -1, 1);
    paperMap = { w, h, scale: sampleScale, luminance, smooth, texture, contrast };
  }

  function samplePaperWorld(x, y) {
    if (!paperMap) return { lum: 1, tex: 0, contrast: 0 };
    const px = Core.clamp(x / paperMap.scale, 0, paperMap.w - 1.001);
    const py = Core.clamp(y / paperMap.scale, 0, paperMap.h - 1.001);
    const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(paperMap.w - 1, x0 + 1), y1 = Math.min(paperMap.h - 1, y0 + 1);
    const tx = px - x0, ty = py - y0;
    const idx = (xx, yy) => yy * paperMap.w + xx;
    const bilerp = arr => Core.lerp(Core.lerp(arr[idx(x0, y0)], arr[idx(x1, y0)], tx), Core.lerp(arr[idx(x0, y1)], arr[idx(x1, y1)], tx), ty);
    return { lum: bilerp(paperMap.luminance), tex: bilerp(paperMap.texture), contrast: bilerp(paperMap.contrast) };
  }

  function drawInkTexture(g) {
    const width = g.geo.width, height = g.geo.height;
    const base = Core.hexToRgb(g.fill || DEFAULT_COLOR);
    const rng = Core.mulberry32(g.inkSeed || Core.mixSeed(g.variantSeed, 8191, 17));
    ctx.save();
    ctx.clip(g.geo.path);

    const bands = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < bands; i++) {
      const vertical = rng() > 0.35;
      const spread = vertical ? width * (0.18 + rng() * 0.24) : height * (0.18 + rng() * 0.24);
      const pos = vertical ? rng() * width : rng() * height;
      const grad = vertical ? ctx.createLinearGradient(pos - spread, 0, pos + spread, 0) : ctx.createLinearGradient(0, pos - spread, 0, pos + spread);
      const dark = Core.rgbaString({ r: base.r - 18, g: base.g - 18, b: base.b - 18 }, 0.03 + rng() * 0.05);
      const light = Core.rgbaString({ r: base.r + 20, g: base.g + 20, b: base.b + 20 }, 0.02 + rng() * 0.04);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.28, rng() > 0.5 ? dark : light);
      grad.addColorStop(0.5, rng() > 0.5 ? light : dark);
      grad.addColorStop(0.72, rng() > 0.5 ? dark : light);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    const blobs = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < blobs; i++) {
      const x = rng() * width, y = rng() * height;
      const radius = Math.max(width, height) * (0.12 + rng() * 0.18);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const delta = (rng() > 0.5 ? 1 : -1) * (10 + rng() * 16);
      const shade = Core.hexToRgb(Core.offsetColor(g.fill || DEFAULT_COLOR, delta));
      grad.addColorStop(0, Core.rgbaString(shade, 0.06 + rng() * 0.06));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    const speckles = Math.max(6, Math.round(width * height / 2400));
    for (let i = 0; i < speckles; i++) {
      const x = rng() * width, y = rng() * height;
      const r = 0.35 + rng() * 0.8;
      const delta = (rng() > 0.5 ? 1 : -1) * (8 + rng() * 14);
      ctx.beginPath();
      ctx.fillStyle = Core.rgbaString(Core.hexToRgb(Core.offsetColor(g.fill || DEFAULT_COLOR, delta)), 0.03 + rng() * 0.07);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPaperTextureModulation(g, paper) {
    const amount = doc.noise.amount;
    if (!amount) return;
    const rng = Core.mulberry32(Core.mixSeed(g.inkSeed || g.variantSeed, 6113, 29));
    const width = g.geo.width, height = g.geo.height;
    const baseHex = g.fill || DEFAULT_COLOR;
    ctx.save();
    ctx.clip(g.geo.path);
    const rows = Math.max(4, Math.round(height / 12));
    for (let i = 0; i < rows; i++) {
      const y = (i / Math.max(1, rows - 1)) * height;
      const sample = samplePaperWorld(g.x + (rng() - 0.5) * width * 0.25, g.y - height / 2 + y);
      const alpha = (0.03 + amount * 0.08) * (0.7 + sample.contrast * 6);
      const delta = (sample.tex * 22) + (sample.lum - 0.5) * 10;
      ctx.fillStyle = Core.rgbaString(Core.hexToRgb(Core.offsetColor(baseHex, delta)), alpha);
      ctx.fillRect(0, y, width, Math.max(1, height / rows + 1));
    }
    ctx.restore();

    if (doc.background.image) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.10 + amount * 0.16;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - paper.lum) * 0.45})`;
      ctx.fill(g.geo.path);
      ctx.restore();
    }
  }

  function drawGlyphBlendNoise(g, paper) {
    const amount = doc.noise.amount;
    if (!amount) return;
    const noise = doc.noise;
    const size = Math.max(1, noise.size | 0);
    const seed = Core.mixSeed(noise.seed || 0x12345678, g.inkSeed || g.variantSeed, g.char.charCodeAt(0));
    const rng = Core.mulberry32(seed);
    const baseHex = g.fill || DEFAULT_COLOR;
    const baseRgb = Core.hexToRgb(baseHex);

    const fuzzPasses = 1 + Math.round(amount * 4 + size * 0.4 + paper.contrast * 12);
    for (let i = 0; i < fuzzPasses; i++) {
      const dx = (rng() - 0.5) * size * (0.5 + amount + paper.contrast * 6);
      const dy = (rng() - 0.5) * size * (0.5 + amount + paper.contrast * 6);
      const delta = (rng() - 0.5) * (noise.colorful ? 40 : 22);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = (0.02 + amount * 0.045) * (0.8 + (1 - paper.lum) * 0.6);
      ctx.fillStyle = Core.rgbaString(noise.colorful ? { r: baseRgb.r + delta, g: baseRgb.g - delta * 0.25, b: baseRgb.b + delta * 0.6 } : Core.hexToRgb(Core.offsetColor(baseHex, delta)), 1);
      ctx.fill(g.geo.path);
      ctx.restore();
    }

    ctx.save();
    ctx.clip(g.geo.path);
    const speckles = Math.max(10, Math.round((g.geo.width * g.geo.height / 1800) * (0.4 + amount * 1.8)));
    for (let i = 0; i < speckles; i++) {
      const x = rng() * g.geo.width, y = rng() * g.geo.height;
      const r = (0.15 + rng() * 0.75) * size;
      const delta = (rng() - 0.5) * (noise.colorful ? 48 : 26);
      ctx.beginPath();
      ctx.fillStyle = Core.rgbaString(noise.colorful ? { r: baseRgb.r + delta, g: baseRgb.g + delta * 0.2, b: baseRgb.b - delta * 0.35 } : Core.hexToRgb(Core.offsetColor(baseHex, delta)), 0.03 + rng() * (0.05 + amount * 0.06));
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEmbossAndBleed(g, paper) {
    const amount = doc.noise.amount;
    if (!amount) return;
    const baseHex = g.fill || DEFAULT_COLOR;
    const dark = Core.hexToRgb(Core.offsetColor(baseHex, -28));
    const light = Core.hexToRgb(Core.offsetColor(baseHex, 34));
    const bleedRadius = (0.6 + doc.noise.size * 0.9 + amount * 1.6 + paper.contrast * 10);

    ctx.save();
    ctx.globalAlpha = 0.05 + amount * 0.10;
    ctx.shadowBlur = bleedRadius;
    ctx.shadowColor = Core.rgbaString(dark, 0.45);
    ctx.shadowOffsetX = 0.4 + paper.tex * 1.2;
    ctx.shadowOffsetY = 0.5 + paper.contrast * 10;
    ctx.strokeStyle = Core.rgbaString(dark, 0.32 + amount * 0.25);
    ctx.lineWidth = Math.max(0.8, (g.strokeWidth || 0.25) + bleedRadius * 0.35);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(g.geo.path);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.02 + amount * 0.05;
    ctx.translate(-0.6, -0.5);
    ctx.strokeStyle = Core.rgbaString(light, 0.55);
    ctx.lineWidth = Math.max(0.6, (g.strokeWidth || 0.25) + 0.4);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(g.geo.path);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.018 + amount * 0.05;
    ctx.translate(0.8 + paper.tex * 1.4, 0.8 + paper.contrast * 9);
    ctx.strokeStyle = Core.rgbaString(dark, 0.65);
    ctx.lineWidth = Math.max(0.6, (g.strokeWidth || 0.25) + 0.5);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(g.geo.path);
    ctx.restore();
  }

  function drawGlyph(g) {
    Core.ensureGeo(font, g);
    const paper = samplePaperWorld(g.x, g.y);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate((g.rotation || 0) * Math.PI / 180);
    ctx.scale(g.scaleX || 1, g.scaleY || 1);
    ctx.translate(-g.geo.width / 2, -g.geo.height / 2);

    drawEmbossAndBleed(g, paper);

    if (doc.background.image) ctx.globalCompositeOperation = 'multiply';
    const darkness = (1 - paper.lum) * 0.06 + paper.tex * 0.04;
    ctx.fillStyle = Core.offsetColor(g.fill || DEFAULT_COLOR, darkness * 255);
    ctx.globalAlpha = 0.92 - paper.contrast * 0.22;
    ctx.fill(g.geo.path);
    ctx.globalAlpha = 1;
    drawInkTexture(g);
    drawPaperTextureModulation(g, paper);
    drawGlyphBlendNoise(g, paper);
    if ((g.strokeWidth || 0) > 0.001) {
      ctx.strokeStyle = g.fill || DEFAULT_COLOR;
      ctx.lineWidth = g.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(g.geo.path);
    }
    ctx.restore();
  }

  function drawRotatedSelectionBox(box) {
    const corners = Core.rotatedRectCorners(box);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const rotateAnchor = Core.rotatePoint(box.cx, box.cy - box.h / 2 - ROTATE_OFFSET, box.cx, box.cy, box.angle);
    const topMid = Core.rotatePoint(box.cx, box.cy - box.h / 2, box.cx, box.cy, box.angle);
    ctx.beginPath();
    ctx.moveTo(topMid.x, topMid.y);
    ctx.lineTo(rotateAnchor.x, rotateAnchor.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(rotateAnchor.x, rotateAnchor.y, HANDLE_VISUAL / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function textboxHandles(tb) {
    const box = getTextboxRenderBox(tb);
    const locals = [
      { kind: 'nw', x: box.cx - box.w / 2, y: box.cy - box.h / 2 },
      { kind: 'ne', x: box.cx + box.w / 2, y: box.cy - box.h / 2 },
      { kind: 'sw', x: box.cx - box.w / 2, y: box.cy + box.h / 2 },
      { kind: 'se', x: box.cx + box.w / 2, y: box.cy + box.h / 2 },
      { kind: 'rotate', x: box.cx, y: box.cy - box.h / 2 - ROTATE_OFFSET }
    ];
    return locals.map(h => ({ ...h, ...Core.rotatePoint(h.x, h.y, box.cx, box.cy, box.angle) }));
  }

  function drawRotatedRect(box, strokeStyle, dash) {
    const corners = Core.rotatedRectCorners(box);
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.setLineDash(dash || []);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawTextboxHandles(tb) {
    const handles = textboxHandles(tb);
    const box = getTextboxRenderBox(tb);
    const topMid = Core.rotatePoint(box.cx, box.cy - box.h / 2, box.cx, box.cy, box.angle);
    const rotateHandle = handles.find(h => h.kind === 'rotate');
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.2;
    if (rotateHandle) {
      ctx.beginPath();
      ctx.moveTo(topMid.x, topMid.y);
      ctx.lineTo(rotateHandle.x, rotateHandle.y);
      ctx.stroke();
    }
    for (const h of handles) {
      if (h.kind === 'rotate') {
        ctx.beginPath();
        ctx.arc(h.x, h.y, HANDLE_VISUAL / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(h.x - HANDLE_VISUAL / 2, h.y - HANDLE_VISUAL / 2, HANDLE_VISUAL, HANDLE_VISUAL);
        ctx.strokeRect(h.x - HANDLE_VISUAL / 2, h.y - HANDLE_VISUAL / 2, HANDLE_VISUAL, HANDLE_VISUAL);
      }
    }
    ctx.restore();
  }

  function drawDraftTextbox(tb) {
    drawRotatedRect(getTextboxRenderBox(tb), tb.id === selectedTextboxId ? 'rgba(34,34,34,.8)' : 'rgba(0,0,0,.22)', tb.id === selectedTextboxId ? [8, 4] : [5, 4]);
    for (const g of tb.previewGlyphs) drawGlyph(g);
    if (tb.id === selectedTextboxId) drawTextboxHandles(tb);
  }

  function drawRectOverlay(rect, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawSelectionOverlay() {
    const glyphs = selectedGlyphs();
    if (!glyphs.length) return;
    if (glyphs.length === 1) drawRotatedSelectionBox(getGlyphRenderBox(glyphs[0]));
    else {
      const box = ensureMultiSelection();
      if (box) drawRotatedSelectionBox(box);
    }
  }

  function draw() {
    drawBackground();
    for (const g of doc.glyphs) drawGlyph(g);
    drawSelectionOverlay();
    for (const tb of doc.draftTextboxes) drawDraftTextbox(tb);
    if (interaction.mode === 'marqueeSelect' && interaction.selectionRect) drawRectOverlay(interaction.selectionRect, 'rgba(0,0,0,.05)', 'rgba(0,0,0,.45)');
    if (interaction.mode === 'createTextbox' && interaction.previewRect) drawRectOverlay(interaction.previewRect, 'rgba(0,0,0,.03)', 'rgba(0,0,0,.55)');
  }

  function hitTextboxHandle(tb, p) {
    for (const h of textboxHandles(tb)) if (Math.hypot(p.x - h.x, p.y - h.y) <= HANDLE_HIT) return h;
    return null;
  }

  function hitSelectionRotateHandle(p) {
    const box = getCurrentSelectionBox();
    if (!box) return null;
    const world = Core.rotatePoint(box.cx, box.cy - box.h / 2 - ROTATE_OFFSET, box.cx, box.cy, box.angle);
    return Math.hypot(p.x - world.x, p.y - world.y) <= HANDLE_HIT ? { box, world } : null;
  }

  function hitSelectionBody(p) {
    const box = getCurrentSelectionBox();
    if (!box) return false;
    return Core.pointInRotatedRect(p, box);
  }

  function hitGlyph(p) {
    for (let i = doc.glyphs.length - 1; i >= 0; i--) {
      const g = doc.glyphs[i];
      Core.ensureGeo(font, g);
      const angle = -(g.rotation || 0) * Math.PI / 180;
      const localCenter = Core.rotatePoint(p.x, p.y, g.x, g.y, angle);
      const localX = (localCenter.x - g.x) / (g.scaleX || 1) + g.geo.width / 2;
      const localY = (localCenter.y - g.y) / (g.scaleY || 1) + g.geo.height / 2;
      if (ctx.isPointInPath(g.geo.path, localX, localY) || ((g.strokeWidth || 0) > 0.01 && ctx.isPointInStroke(g.geo.path, localX, localY))) return g;
    }
    return null;
  }

  function hitDraftTextbox(p) {
    for (let i = doc.draftTextboxes.length - 1; i >= 0; i--) {
      const tb = doc.draftTextboxes[i];
      if (Core.pointInRotatedRect(p, getTextboxRenderBox(tb))) return tb;
    }
    return null;
  }

  function syncTextboxPanel() {
    const tb = activeTextbox();
    const disabled = !tb;
    ['boxFontSize','boxPadding','boxCharGap','boxLineGap','boxOffsetX','boxOffsetY','regenerateBoxBtn','confirmTextboxBtn','deleteTextboxBtn'].forEach(id => els[id].disabled = disabled);
    if (!tb) {
      els.textboxState.textContent = '未选择';
      els.overflowInfo.textContent = '未选择文本框';
      els.textboxInfo.textContent = '角点可拖拽，旋转手柄已放大';
      return;
    }
    els.textboxState.textContent = '排版中';
    els.boxFontSize.value = String(Math.round(tb.fontSize)); els.boxFontSizeText.textContent = Math.round(tb.fontSize) + 'px';
    els.boxPadding.value = String(Math.round(tb.padding)); els.boxPaddingText.textContent = Math.round(tb.padding) + 'px';
    els.boxCharGap.value = String(Math.round(tb.charGap)); els.boxCharGapText.textContent = Math.round(tb.charGap) + 'px';
    els.boxLineGap.value = String(tb.lineGap); els.boxLineGapText.textContent = tb.lineGap.toFixed(2) + '×';
    els.boxOffsetX.value = String(Math.round(tb.offsetX)); els.boxOffsetXText.textContent = Math.round(tb.offsetX) + 'px';
    els.boxOffsetY.value = String(Math.round(tb.offsetY)); els.boxOffsetYText.textContent = Math.round(tb.offsetY) + 'px';
    els.overflowInfo.textContent = tb.overflowCount ? `有 ${tb.overflowCount} 个字符未放入文本框` : '文本框内文字已全部放下';
    els.textboxInfo.textContent = `${Math.round(tb.width)}×${Math.round(tb.height)} px，旋转 ${Math.round(tb.rotation || 0)}°`;
  }

  function syncGlyphPanel() {
    const arr = selectedGlyphs();
    const disabled = !arr.length;
    els.colorInput.disabled = disabled; els.thicknessInput.disabled = disabled; els.sizeInput.disabled = disabled; els.applyStyleBtn.disabled = disabled;
    if (!arr.length) {
      els.styleScope.textContent = '未选择'; els.styleHint.textContent = '先选择字符';
      els.colorInput.value = DEFAULT_COLOR; els.colorText.textContent = DEFAULT_COLOR;
      els.thicknessInput.value = '0.30'; els.thicknessText.textContent = '0.30px';
      els.sizeInput.value = els.fontSize.value; els.sizeText.textContent = els.fontSize.value + 'px';
      return;
    }
    const first = arr[0];
    els.styleScope.textContent = arr.length === 1 ? '单字编辑' : '临时编组批量编辑';
    els.styleHint.textContent = arr.length === 1 ? '当前修改仅作用于该字' : '当前修改会作用于所有已选字';
    els.colorInput.value = first.fill || DEFAULT_COLOR; els.colorText.textContent = els.colorInput.value;
    els.thicknessInput.value = (first.strokeWidth || 0).toFixed(2); els.thicknessText.textContent = Number(els.thicknessInput.value).toFixed(2) + 'px';
    els.sizeInput.value = String(Math.round(first.fontSize)); els.sizeText.textContent = Math.round(first.fontSize) + 'px';
  }

  function updateCandidates() {
    els.candidateArea.innerHTML = '';
    const arr = selectedGlyphs();
    if (arr.length !== 1) {
      els.rerollBtn.hidden = true;
      els.candidateArea.className = 'muted';
      els.candidateArea.textContent = arr.length > 1 ? '多选状态下不显示单字候选。' : '单击单个字符后显示 6 个候选。';
      if (!arr.length) candidateState = { glyphId: null, nonce: -1, list: [] };
      return;
    }
    const g = arr[0];
    if (candidateState.glyphId !== g.id || candidateState.nonce !== candidateNonce || !candidateState.list.length) {
      candidateState = { glyphId: g.id, nonce: candidateNonce, list: Core.candidates(font, g, candidateNonce) };
    }
    els.rerollBtn.hidden = false;
    els.candidateArea.className = 'cands';
    for (const c of candidateState.list) {
      const btn = document.createElement('button');
      btn.className = 'cand';
      btn.title = 'seed ' + c.seed;
      btn.style.color = g.fill || DEFAULT_COLOR;
      if (c.seed === g.variantSeed) { btn.style.borderColor = '#111'; btn.style.background = '#fff'; }
      btn.innerHTML = `<svg viewBox="0 0 ${Math.max(1, c.geo.width)} ${Math.max(1, c.geo.height)}"><path d="${c.geo.pathData}" fill="currentColor"></path></svg>`;
      btn.onclick = () => {
        snapshot();
        const target = doc.glyphs.find(x => x.id === g.id);
        if (!target) return;
        target.variantSeed = c.seed;
        target.geo = c.geo;
        target.geoSeed = c.seed;
        target.geoStrength = target.warpStrength;
        target.geoBias = target.instanceBias;
        target.geoSize = target.fontSize;
        target.inkSeed = Core.mixSeed(c.seed, 8191, target.char.charCodeAt(0));
        target.y = Core.preserveBaselineY(font, target, c.geo);
        draw();
        syncUI();
      };
      els.candidateArea.appendChild(btn);
    }
  }

  function syncSelectionInfo() {
    const glyphs = selectedGlyphs();
    els.selectedCount.textContent = glyphs.length + ' 个字符';
    if (selectedTextboxId) {
      els.selectionInfo.innerHTML = '<div class="selectedText">文本框排版中</div><p class="muted">当前在文本框内预览排版。可以拖动、缩放、旋转文本框；点“确认并解除编组”后，字符会变成独立对象。</p>';
    } else if (glyphs.length === 1) {
      els.selectionInfo.innerHTML = `<div class="selectedText">${glyphs[0].char}</div><p class="muted">当前为单字编辑模式。选择框会随字符旋转。渗墨、压印与纸纹会自动按背景采样融合。</p>`;
    } else if (glyphs.length > 1) {
      els.selectionInfo.innerHTML = `<div class="selectedText">临时编组</div><p class="muted">已框选 ${glyphs.length} 个字符。可拖动整体移动，或使用旋转手柄整体旋转；选择框会保持同角度旋转。</p>`;
    } else {
      els.selectionInfo.textContent = '单击字符可编辑单字；空白处拖拽可框选多个字形成临时编组；双击空白处可快速创建文本框。';
    }
  }

  function syncUI() {
    syncSelectionInfo();
    syncTextboxPanel();
    syncGlyphPanel();
    updateCandidates();
    els.undoBtn.disabled = !past.length;
    els.redoBtn.disabled = !future.length;
    els.deleteBtn.disabled = !selectedGlyphIds.size;
  }

  function applyGlyphStyles() {
    const arr = selectedGlyphs();
    if (!arr.length) return;
    snapshot();
    const fill = els.colorInput.value;
    const strokeWidth = Math.max(0, +els.thicknessInput.value || 0);
    const size = Math.max(16, +els.sizeInput.value || 16);
    for (const g of arr) {
      g.fill = fill;
      g.strokeWidth = strokeWidth;
      if (size !== g.fontSize) {
        const newGeo = Core.geometry(font, g.char, size, g.variantSeed, g.warpStrength, g.instanceBias);
        g.fontSize = size;
        g.geo = newGeo;
        g.geoSeed = g.variantSeed;
        g.geoStrength = g.warpStrength;
        g.geoBias = g.instanceBias;
        g.geoSize = size;
        g.y = Core.preserveBaselineY(font, g, newGeo);
      }
      g.inkSeed = Core.mixSeed(g.variantSeed, Core.hashString(fill), Math.round(strokeWidth * 100));
    }
    if (selectedGlyphIds.size > 1) refreshMultiSelection(multiSelectionBox ? multiSelectionBox.angle : 0);
    draw();
    syncUI();
  }

  async function loadPreset(id) {
    const preset = window.HANDWRITER_FONT_PRESETS && window.HANDWRITER_FONT_PRESETS[id];
    if (!preset) return;
    els.fontName.textContent = '正在加载：' + preset.name + '…';
    const encoded = encodeURIComponent(preset.file);
    const sources = ['./fonts/' + encoded, FONT_BASE + '/' + encoded];
    for (const url of sources) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        font = opentype.parse(await res.arrayBuffer());
        els.fontName.textContent = '已加载：' + preset.name;
        draw();
        syncUI();
        return;
      } catch (err) {}
    }
    els.fontName.textContent = '预设字体加载失败，请使用本地字体';
  }

  els.presetSelect.onchange = () => loadPreset(els.presetSelect.value);
  els.fontInput.onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      font = opentype.parse(await file.arrayBuffer());
      els.fontName.textContent = '已加载：' + file.name;
      draw();
      syncUI();
    } catch (err) { alert('字体解析失败：' + err.message); }
  };
  els.fontSize.oninput = () => els.fontSizeVal.textContent = els.fontSize.value + 'px';
  els.strength.oninput = () => els.strengthVal.textContent = (+els.strength.value * 100).toFixed(1) + '%';
  els.diversity.oninput = () => els.diversityVal.textContent = Math.round(+els.diversity.value * 100) + '%';
  els.sizePreset.onchange = () => applySizePreset(els.sizePreset.value);
  els.applyCanvasBtn.onclick = () => commitCanvasSize(+els.canvasWidthInput.value, +els.canvasHeightInput.value);
  els.zoomInput.oninput = () => { updateZoom(els.zoomInput.value); draw(); };
  els.bgMode.onchange = () => { doc.background.mode = els.bgMode.value; rebuildPaperMap(); draw(); };
  els.bgScale.oninput = () => { doc.background.scale = +els.bgScale.value; els.bgScaleText.textContent = Math.round(doc.background.scale * 100) + '%'; rebuildPaperMap(); draw(); };
  els.bgOpacity.oninput = () => { doc.background.opacity = +els.bgOpacity.value; els.bgOpacityText.textContent = Math.round(doc.background.opacity * 100) + '%'; rebuildPaperMap(); draw(); };
  els.noiseAmount.oninput = () => { doc.noise.amount = +els.noiseAmount.value; els.noiseAmountText.textContent = Math.round(doc.noise.amount * 100) + '%'; draw(); };
  els.noiseSize.oninput = () => { doc.noise.size = +els.noiseSize.value; els.noiseSizeText.textContent = doc.noise.size + 'px'; draw(); };
  els.noiseColor.oninput = () => { doc.noise.colorful = !!(+els.noiseColor.value); els.noiseColorText.textContent = doc.noise.colorful ? '开启' : '关闭'; draw(); };
  els.bgInput.onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      snapshot();
      doc.background.image = img;
      doc.background.fileName = file.name;
      setCanvasSize(img.width, img.height);
      els.canvasWidthInput.value = img.width;
      els.canvasHeightInput.value = img.height;
      els.sizePreset.value = 'custom';
      clearSelection();
      draw();
      syncUI();
    };
    img.src = URL.createObjectURL(file);
  };
  els.clearBgBtn.onclick = () => { snapshot(); doc.background.image = null; doc.background.fileName = ''; rebuildPaperMap(); draw(); syncUI(); };
  els.newTextboxBtn.onclick = () => { clearSelection(); interaction = { mode: 'createTextbox' }; draw(); syncUI(); };
  els.clearSelectionBtn.onclick = () => { clearSelection(); interaction = { mode: null }; draw(); syncUI(); };
  els.regenerateBoxBtn.onclick = () => { if (!activeTextbox()) return; snapshot(); applyTextboxControls(); };
  els.confirmTextboxBtn.onclick = confirmTextbox;
  els.deleteTextboxBtn.onclick = () => {
    const tb = activeTextbox(); if (!tb) return; snapshot();
    doc.draftTextboxes = doc.draftTextboxes.filter(x => x.id !== tb.id);
    clearSelection(); draw(); syncUI();
  };
  els.boxFontSize.oninput = () => { els.boxFontSizeText.textContent = els.boxFontSize.value + 'px'; if (activeTextbox()) applyTextboxControls(); };
  els.boxPadding.oninput = () => { els.boxPaddingText.textContent = els.boxPadding.value + 'px'; if (activeTextbox()) applyTextboxControls(); };
  els.boxCharGap.oninput = () => { els.boxCharGapText.textContent = els.boxCharGap.value + 'px'; if (activeTextbox()) applyTextboxControls(); };
  els.boxLineGap.oninput = () => { els.boxLineGapText.textContent = Number(els.boxLineGap.value).toFixed(2) + '×'; if (activeTextbox()) applyTextboxControls(); };
  els.boxOffsetX.oninput = () => { els.boxOffsetXText.textContent = els.boxOffsetX.value + 'px'; if (activeTextbox()) applyTextboxControls(); };
  els.boxOffsetY.oninput = () => { els.boxOffsetYText.textContent = els.boxOffsetY.value + 'px'; if (activeTextbox()) applyTextboxControls(); };
  els.colorInput.oninput = () => els.colorText.textContent = els.colorInput.value;
  els.thicknessInput.oninput = () => els.thicknessText.textContent = Number(els.thicknessInput.value).toFixed(2) + 'px';
  els.sizeInput.oninput = () => els.sizeText.textContent = els.sizeInput.value + 'px';
  els.applyStyleBtn.onclick = applyGlyphStyles;
  els.rerollBtn.onclick = () => { candidateNonce++; candidateState = { glyphId: null, nonce: -1, list: [] }; updateCandidates(); };
  els.undoBtn.onclick = undo;
  els.redoBtn.onclick = redo;
  els.deleteBtn.onclick = () => {
    if (!selectedGlyphIds.size) return;
    snapshot();
    doc.glyphs = doc.glyphs.filter(g => !selectedGlyphIds.has(g.id));
    selectedGlyphIds = new Set(); multiSelectionBox = null;
    draw(); syncUI();
  };
  els.exportBtn.onclick = () => {
    const out = document.createElement('canvas'); out.width = doc.width; out.height = doc.height;
    out.getContext('2d').drawImage(els.canvas, 0, 0);
    const a = document.createElement('a'); a.download = 'HandWriter.png'; a.href = out.toDataURL('image/png'); a.click();
  };

  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedGlyphIds.size) { e.preventDefault(); els.deleteBtn.click(); }
      else if (selectedTextboxId) { e.preventDefault(); els.deleteTextboxBtn.click(); }
    }
  });

  els.canvas.addEventListener('dblclick', evt => {
    if (!font) return;
    const p = toCanvasPoint(evt);
    snapshot();
    const tb = createDraftTextbox({ x: p.x, y: p.y, w: Math.min(420, doc.width - p.x - 20), h: 220 });
    doc.draftTextboxes.push(tb);
    clearSelection();
    selectedTextboxId = tb.id;
    draw();
    syncUI();
  });

  els.canvas.addEventListener('pointerdown', evt => {
    if (!font) return;
    const p = toCanvasPoint(evt);
    els.canvas.setPointerCapture(evt.pointerId);

    if (interaction.mode === 'createTextbox') {
      interaction.start = p;
      interaction.previewRect = { x: p.x, y: p.y, w: 1, h: 1 };
      draw();
      return;
    }

    const tb = activeTextbox();
    if (tb) {
      const handle = hitTextboxHandle(tb, p);
      if (handle) {
        snapshot();
        const box = getTextboxRenderBox(tb);
        interaction = { mode: handle.kind === 'rotate' ? 'rotateTextbox' : 'resizeTextbox', handle, start: p, textboxId: tb.id,
          orig: { x: tb.x, y: tb.y, w: tb.width, h: tb.height }, origRotation: tb.rotation || 0, center: { x: box.cx, y: box.cy }, boxAngle: box.angle,
          startAngle: Math.atan2(p.y - box.cy, p.x - box.cx) };
        return;
      }
      if (Core.pointInRotatedRect(p, getTextboxRenderBox(tb))) {
        snapshot();
        interaction = { mode: 'moveTextbox', start: p, textboxId: tb.id, orig: { x: tb.x, y: tb.y }, glyphSnapshot: tb.previewGlyphs.map(g => ({ id: g.id, x: g.x, y: g.y })), baseGlyphSnapshot: (tb.basePreviewGlyphs || []).map(g => ({ id: g.id, x: g.x, y: g.y })) };
        draw(); return;
      }
    }

    const rotateHandle = hitSelectionRotateHandle(p);
    if (rotateHandle && selectedGlyphIds.size) {
      snapshot();
      const box = getCurrentSelectionBox();
      interaction = {
        mode: selectedGlyphIds.size === 1 ? 'rotateSingleGlyph' : 'rotateGlyphGroup',
        start: p, center: { x: box.cx, y: box.cy }, startAngle: Math.atan2(p.y - box.cy, p.x - box.cx),
        startGroupAngle: box.angle, glyphSnapshot: selectedGlyphs().map(g => ({ ...g }))
      };
      return;
    }

    if (selectedGlyphIds.size && hitSelectionBody(p)) {
      snapshot();
      const box = getCurrentSelectionBox();
      interaction = { mode: selectedGlyphIds.size === 1 ? 'moveSingleGlyph' : 'moveGlyphGroup', start: p, startBox: box ? { ...box } : null, glyphSnapshot: selectedGlyphs().map(g => ({ id: g.id, x: g.x, y: g.y })) };
      return;
    }

    const glyph = hitGlyph(p);
    if (glyph) {
      selectedTextboxId = null;
      if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
        const next = new Set(selectedGlyphIds);
        if (next.has(glyph.id)) next.delete(glyph.id); else next.add(glyph.id);
        selectedGlyphIds = next;
      } else selectedGlyphIds = new Set([glyph.id]);
      if (selectedGlyphIds.size > 1) refreshMultiSelection(0); else multiSelectionBox = null;
      draw(); syncUI(); return;
    }

    const draftHit = hitDraftTextbox(p);
    if (draftHit) { clearSelection(); selectedTextboxId = draftHit.id; draw(); syncUI(); return; }

    clearSelection();
    interaction = { mode: 'marqueeSelect', start: p, selectionRect: { x: p.x, y: p.y, w: 1, h: 1 } };
    draw(); syncUI();
  });

  els.canvas.addEventListener('pointermove', evt => {
    const p = toCanvasPoint(evt);
    if (interaction.mode === 'createTextbox' && interaction.start) { interaction.previewRect = Core.rectNorm(interaction.start, p); draw(); return; }
    if (interaction.mode === 'marqueeSelect' && interaction.start) { interaction.selectionRect = Core.rectNorm(interaction.start, p); draw(); return; }
    if (interaction.mode === 'moveTextbox') {
      const tb = doc.draftTextboxes.find(t => t.id === interaction.textboxId); if (!tb) return;
      const dx = p.x - interaction.start.x, dy = p.y - interaction.start.y;
      tb.x = interaction.orig.x + dx; tb.y = interaction.orig.y + dy;
      for (const s of interaction.glyphSnapshot) {
        const g = tb.previewGlyphs.find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }
      }
      for (const s of interaction.baseGlyphSnapshot || []) {
        const g = (tb.basePreviewGlyphs || []).find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }
      }
      draw(); syncUI(); return;
    }
    if (interaction.mode === 'resizeTextbox') {
      const tb = doc.draftTextboxes.find(t => t.id === interaction.textboxId); if (!tb) return;
      const center = { x: interaction.orig.x + interaction.orig.w / 2, y: interaction.orig.y + interaction.orig.h / 2 };
      const lp = Core.rotatePoint(p.x, p.y, center.x, center.y, -(interaction.boxAngle || 0));
      const r = { ...interaction.orig };
      if (interaction.handle.kind.includes('n')) { r.y = Math.min(interaction.orig.y + interaction.orig.h - 40, lp.y); r.h = interaction.orig.y + interaction.orig.h - r.y; }
      if (interaction.handle.kind.includes('s')) { r.h = Math.max(40, lp.y - interaction.orig.y); }
      if (interaction.handle.kind.includes('w')) { r.x = Math.min(interaction.orig.x + interaction.orig.w - 60, lp.x); r.w = interaction.orig.x + interaction.orig.w - r.x; }
      if (interaction.handle.kind.includes('e')) { r.w = Math.max(60, lp.x - interaction.orig.x); }
      tb.x = r.x; tb.y = r.y; tb.width = r.w; tb.height = r.h;
      layoutTextbox(tb); draw(); syncUI(); return;
    }
    if (interaction.mode === 'rotateTextbox') {
      const tb = doc.draftTextboxes.find(t => t.id === interaction.textboxId); if (!tb) return;
      const angle = Math.atan2(p.y - interaction.center.y, p.x - interaction.center.x) - interaction.startAngle;
      tb.rotation = interaction.origRotation + angle * 180 / Math.PI;
      applyTextboxRotation(tb);
      draw(); syncUI(); return;
    }
    if (interaction.mode === 'moveSingleGlyph' || interaction.mode === 'moveGlyphGroup') {
      const dx = p.x - interaction.start.x, dy = p.y - interaction.start.y;
      for (const s of interaction.glyphSnapshot) {
        const g = doc.glyphs.find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }
      }
      if (interaction.mode === 'moveGlyphGroup' && multiSelectionBox) { multiSelectionBox.cx = interaction.startBox.cx + dx; multiSelectionBox.cy = interaction.startBox.cy + dy; }
      draw(); syncUI(); return;
    }
    if (interaction.mode === 'rotateSingleGlyph' || interaction.mode === 'rotateGlyphGroup') {
      const angle = Math.atan2(p.y - interaction.center.y, p.x - interaction.center.x) - interaction.startAngle;
      for (const old of interaction.glyphSnapshot) {
        const g = doc.glyphs.find(x => x.id === old.id); if (!g) continue;
        if (interaction.mode === 'rotateSingleGlyph') g.rotation = old.rotation + angle * 180 / Math.PI;
        else {
          const q = Core.rotatePoint(old.x, old.y, interaction.center.x, interaction.center.y, angle);
          g.x = q.x; g.y = q.y; g.rotation = old.rotation + angle * 180 / Math.PI;
        }
      }
      if (interaction.mode === 'rotateGlyphGroup' && multiSelectionBox) multiSelectionBox.angle = interaction.startGroupAngle + angle;
      draw(); syncUI(); return;
    }
  });

  els.canvas.addEventListener('pointerup', evt => {
    const p = toCanvasPoint(evt);
    if (interaction.mode === 'createTextbox' && interaction.start) {
      const rect = Core.rectNorm(interaction.start, p);
      interaction = { mode: null };
      if (rect.w > 20 && rect.h > 20) {
        snapshot();
        const tb = createDraftTextbox(rect);
        doc.draftTextboxes.push(tb);
        clearSelection(); selectedTextboxId = tb.id;
      }
      draw(); syncUI(); return;
    }
    if (interaction.mode === 'marqueeSelect' && interaction.start) {
      const rect = Core.rectNorm(interaction.start, p);
      selectedGlyphIds = new Set(doc.glyphs.filter(g => Core.rectsIntersect(Core.glyphBox(font, g), rect)).map(g => g.id));
      selectedTextboxId = null;
      if (selectedGlyphIds.size > 1) refreshMultiSelection(0); else multiSelectionBox = null;
      interaction = { mode: null };
      draw(); syncUI(); return;
    }
    if (['moveTextbox','resizeTextbox','rotateTextbox','moveSingleGlyph','moveGlyphGroup','rotateSingleGlyph','rotateGlyphGroup'].includes(interaction.mode)) {
      interaction = { mode: null };
      draw(); syncUI(); return;
    }
    interaction = { mode: null };
  });

  setCanvasSize(doc.width, doc.height);
  updateZoom(doc.zoom);
  applySizePreset('a4p');
  els.canvasWidthInput.value = doc.width;
  els.canvasHeightInput.value = doc.height;
  els.fontSizeVal.textContent = els.fontSize.value + 'px';
  els.strengthVal.textContent = (+els.strength.value * 100).toFixed(1) + '%';
  els.diversityVal.textContent = Math.round(+els.diversity.value * 100) + '%';
  els.bgScaleText.textContent = '100%';
  els.bgOpacityText.textContent = '100%';
  els.noiseAmountText.textContent = '0%';
  els.noiseSizeText.textContent = '1px';
  els.noiseColorText.textContent = '关闭';
  rebuildPaperMap();
  syncUI();
  draw();
  loadPreset('yunyan');
})();
