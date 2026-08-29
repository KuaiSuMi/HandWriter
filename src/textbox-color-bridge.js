'use strict';
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(() => {
    const Core = window.HandWriterCore;
    const colorInput = document.getElementById('colorInput');
    const colorText = document.getElementById('colorText');
    const thicknessInput = document.getElementById('thicknessInput');
    const thicknessText = document.getElementById('thicknessText');
    const opacityInput = document.getElementById('opacityInput');
    const opacityText = document.getElementById('opacityText');
    const brightnessInput = document.getElementById('brightnessInput');
    const brightnessText = document.getElementById('brightnessText');
    const styleScope = document.getElementById('styleScope');
    const styleHint = document.getElementById('styleHint');
    const textboxState = document.getElementById('textboxState');
    const selectedCount = document.getElementById('selectedCount');
    const boxOffsetX = document.getElementById('boxOffsetX');
    const sizeInput = document.getElementById('sizeInput');
    const applyStyleBtn = document.getElementById('applyStyleBtn');
    if (!Core || !colorInput || !thicknessInput || !opacityInput || !brightnessInput || !textboxState) return;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
    const bridgeState = window.HandWriterTextboxStyle = {
      active: false,
      color: colorInput.value || '#161616',
      thickness: Math.max(0.01, Number(thicknessInput.value) || 0.08),
      opacity: clamp(opacityInput.value || 1, 0, 1),
      brightness: clamp(brightnessInput.value || 1, 0.4, 1.8)
    };

    const glyphRegistry = new Set();
    const pathGlyph = new WeakMap();
    const pathStyle = new WeakMap();
    let selectedGlyphs = [];

    function textboxActive() {
      return /排版中/.test(textboxState.textContent || '');
    }

    function styleOf(g) {
      const inherited = g && g.geo && g.geo.path ? pathStyle.get(g.geo.path) : null;
      return {
        opacity: clamp(g && g.opacity != null ? g.opacity : inherited ? inherited.opacity : 1, 0, 1),
        brightness: clamp(g && g.brightness != null ? g.brightness : inherited ? inherited.brightness : 1, 0.4, 1.8)
      };
    }

    function attachStyle(g, style) {
      if (!g) return;
      g.opacity = clamp(style.opacity, 0, 1);
      g.brightness = clamp(style.brightness, 0.4, 1.8);
      glyphRegistry.add(g);
      if (g.geo && g.geo.path) {
        pathGlyph.set(g.geo.path, g);
        pathStyle.set(g.geo.path, { opacity: g.opacity, brightness: g.brightness });
      }
    }

    function registerGlyph(g) {
      if (!g) return g;
      glyphRegistry.add(g);
      const inherited = g.geo && g.geo.path ? pathStyle.get(g.geo.path) : null;
      if (g.opacity == null && inherited) g.opacity = inherited.opacity;
      if (g.brightness == null && inherited) g.brightness = inherited.brightness;
      if (g.opacity == null) g.opacity = 1;
      if (g.brightness == null) g.brightness = 1;
      attachStyle(g, g);
      return g;
    }

    const nativeEnsureGeo = Core.ensureGeo;
    Core.ensureGeo = function (font, g) {
      const oldStyle = g && g.geo && g.geo.path ? pathStyle.get(g.geo.path) : null;
      const geo = nativeEnsureGeo.call(this, font, g);
      if (oldStyle && g.opacity == null) g.opacity = oldStyle.opacity;
      if (oldStyle && g.brightness == null) g.brightness = oldStyle.brightness;
      registerGlyph(g);
      return geo;
    };

    const nativeNormalizeGlyphTop = Core.normalizeGlyphTop;
    Core.normalizeGlyphTop = function (font, items, topY) {
      const out = nativeNormalizeGlyphTop.call(this, font, items, topY);
      for (const g of out || []) {
        if (bridgeState.active) attachStyle(g, bridgeState);
        else registerGlyph(g);
      }
      return out;
    };

    const nativeGroupSelectionBox = Core.groupSelectionBox;
    Core.groupSelectionBox = function (font, glyphs) {
      selectedGlyphs = Array.isArray(glyphs) ? glyphs.slice() : [];
      for (const g of selectedGlyphs) registerGlyph(g);
      requestAnimationFrame(syncSelectionStyleUi);
      return nativeGroupSelectionBox.call(this, font, glyphs);
    };

    const nativeRotatedRectCorners = Core.rotatedRectCorners;
    Core.rotatedRectCorners = function (box) {
      const result = nativeRotatedRectCorners.call(this, box);
      if (!textboxActive() && box) {
        let best = null;
        let bestScore = Infinity;
        for (const g of glyphRegistry) {
          if (!g || !g.geo) continue;
          const w = g.geo.width * (g.scaleX || 1);
          const h = g.geo.height * (g.scaleY || 1);
          const a = (g.rotation || 0) * Math.PI / 180;
          const score = Math.abs(g.x - box.cx) + Math.abs(g.y - box.cy) + Math.abs(w - box.w) + Math.abs(h - box.h) + Math.abs(a - (box.angle || 0)) * 20;
          if (score < bestScore) { best = g; bestScore = score; }
        }
        if (best && bestScore < 3.5) {
          selectedGlyphs = [best];
          requestAnimationFrame(syncSelectionStyleUi);
        }
      }
      return result;
    };

    const nativeJitterInk = Core.jitterInk;
    const nativeClamp = Core.clamp;
    Core.clamp = function (value, min, max) {
      if (bridgeState.active && min === 0 && max === 3 && Number.isFinite(value)) {
        const originalVariation = value - 0.22;
        return nativeClamp(bridgeState.thickness + originalVariation * 0.18, 0.01, 3);
      }
      return nativeClamp(value, min, max);
    };

    Core.jitterInk = function (hex, rng, amount, grayscaleOnly = true) {
      if (!bridgeState.active) return nativeJitterInk.call(this, hex, rng, amount, grayscaleOnly);
      return nativeJitterInk.call(this, bridgeState.color || hex, rng, amount, grayscaleOnly);
    };

    const proto = CanvasRenderingContext2D.prototype;
    const nativeFill = proto.fill;
    const nativeStroke = proto.stroke;
    const nativeFillRect = proto.fillRect;
    const nativeClip = proto.clip;
    const nativeSave = proto.save;
    const nativeRestore = proto.restore;
    const contextState = new WeakMap();

    function getContextState(ctx) {
      let state = contextState.get(ctx);
      if (!state) {
        state = { glyph: null, stack: [], styleDepth: 0 };
        contextState.set(ctx, state);
      }
      return state;
    }

    proto.save = function (...args) {
      const s = getContextState(this);
      s.stack.push(s.glyph);
      return nativeSave.apply(this, args);
    };

    proto.restore = function (...args) {
      const result = nativeRestore.apply(this, args);
      const s = getContextState(this);
      s.glyph = s.stack.length ? s.stack.pop() : null;
      return result;
    };

    proto.clip = function (...args) {
      const path = args[0] instanceof Path2D ? args[0] : null;
      if (path) {
        const g = pathGlyph.get(path);
        if (g) getContextState(this).glyph = g;
      }
      return nativeClip.apply(this, args);
    };

    function glyphForDraw(ctx, args) {
      const path = args[0] instanceof Path2D ? args[0] : null;
      return (path && pathGlyph.get(path)) || getContextState(ctx).glyph || null;
    }

    function withGlyphVisual(ctx, glyph, draw) {
      if (!glyph) return draw();
      const s = getContextState(ctx);
      if (s.styleDepth > 0) return draw();
      const style = styleOf(glyph);
      if (style.opacity >= 0.999 && Math.abs(style.brightness - 1) < 0.001) return draw();
      s.styleDepth++;
      const oldAlpha = ctx.globalAlpha;
      const oldFilter = ctx.filter || 'none';
      ctx.globalAlpha = oldAlpha * style.opacity;
      const brightnessFilter = `brightness(${style.brightness})`;
      ctx.filter = oldFilter && oldFilter !== 'none' ? `${oldFilter} ${brightnessFilter}` : brightnessFilter;
      try { return draw(); }
      finally {
        ctx.globalAlpha = oldAlpha;
        ctx.filter = oldFilter;
        s.styleDepth--;
      }
    }

    proto.fill = function (...args) {
      const glyph = glyphForDraw(this, args);
      return withGlyphVisual(this, glyph, () => nativeFill.apply(this, args));
    };

    proto.stroke = function (...args) {
      const glyph = glyphForDraw(this, args);
      return withGlyphVisual(this, glyph, () => nativeStroke.apply(this, args));
    };

    proto.fillRect = function (...args) {
      const glyph = getContextState(this).glyph;
      return withGlyphVisual(this, glyph, () => nativeFillRect.apply(this, args));
    };

    let redrawQueued = false;
    function requestRedraw() {
      if (redrawQueued) return;
      redrawQueued = true;
      requestAnimationFrame(() => {
        redrawQueued = false;
        const zoom = document.getElementById('zoomInput');
        if (zoom) zoom.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    function updateReadouts(opacity, brightness) {
      if (opacityText) opacityText.textContent = Math.round(opacity * 100) + '%';
      if (brightnessText) brightnessText.textContent = Math.round(brightness * 100) + '%';
    }

    function restoreTextboxStyleControls() {
      if (!textboxActive()) return;
      bridgeState.active = true;
      colorInput.disabled = false;
      thicknessInput.disabled = false;
      opacityInput.disabled = false;
      brightnessInput.disabled = false;
      colorInput.value = bridgeState.color;
      thicknessInput.value = String(bridgeState.thickness);
      opacityInput.value = String(bridgeState.opacity);
      brightnessInput.value = String(bridgeState.brightness);
      if (colorText) colorText.textContent = bridgeState.color;
      if (thicknessText) thicknessText.textContent = bridgeState.thickness.toFixed(2) + 'px';
      updateReadouts(bridgeState.opacity, bridgeState.brightness);
      if (styleScope) styleScope.textContent = '文本框预览样式';
      if (styleHint) styleHint.textContent = '颜色、粗细、透明度和亮度会立即作用于当前新建文本框';
      if (sizeInput) sizeInput.disabled = true;
      if (applyStyleBtn) applyStyleBtn.disabled = true;
    }

    function syncSelectionStyleUi() {
      if (textboxActive()) { restoreTextboxStyleControls(); return; }
      if (selectedCount && /^0\s/.test(selectedCount.textContent || '')) selectedGlyphs = [];
      if (!selectedGlyphs.length) {
        opacityInput.disabled = true;
        brightnessInput.disabled = true;
        opacityInput.value = '1';
        brightnessInput.value = '1';
        updateReadouts(1, 1);
        return;
      }
      const style = styleOf(selectedGlyphs[0]);
      opacityInput.disabled = false;
      brightnessInput.disabled = false;
      opacityInput.value = String(style.opacity);
      brightnessInput.value = String(style.brightness);
      updateReadouts(style.opacity, style.brightness);
    }

    let relayoutQueued = false;
    function relayoutTextboxPreview() {
      if (!textboxActive() || !boxOffsetX || relayoutQueued) return;
      bridgeState.active = true;
      relayoutQueued = true;
      requestAnimationFrame(() => {
        relayoutQueued = false;
        boxOffsetX.dispatchEvent(new Event('input', { bubbles: true }));
        restoreTextboxStyleControls();
        requestAnimationFrame(restoreTextboxStyleControls);
      });
    }

    colorInput.addEventListener('input', () => {
      if (!textboxActive()) return;
      bridgeState.color = colorInput.value || bridgeState.color;
      if (colorText) colorText.textContent = bridgeState.color;
      relayoutTextboxPreview();
    });

    thicknessInput.addEventListener('input', () => {
      if (!textboxActive()) return;
      bridgeState.thickness = Math.max(0.01, Number(thicknessInput.value) || 0.01);
      if (thicknessText) thicknessText.textContent = bridgeState.thickness.toFixed(2) + 'px';
      relayoutTextboxPreview();
    });

    opacityInput.addEventListener('input', () => {
      const value = clamp(opacityInput.value, 0, 1);
      if (textboxActive()) {
        bridgeState.opacity = value;
        updateReadouts(bridgeState.opacity, bridgeState.brightness);
        relayoutTextboxPreview();
        return;
      }
      for (const g of selectedGlyphs) attachStyle(g, { ...styleOf(g), opacity: value });
      updateReadouts(value, selectedGlyphs.length ? styleOf(selectedGlyphs[0]).brightness : 1);
      requestRedraw();
    });

    brightnessInput.addEventListener('input', () => {
      const value = clamp(brightnessInput.value, 0.4, 1.8);
      if (textboxActive()) {
        bridgeState.brightness = value;
        updateReadouts(bridgeState.opacity, bridgeState.brightness);
        relayoutTextboxPreview();
        return;
      }
      for (const g of selectedGlyphs) attachStyle(g, { ...styleOf(g), brightness: value });
      updateReadouts(selectedGlyphs.length ? styleOf(selectedGlyphs[0]).opacity : 1, value);
      requestRedraw();
    });

    let wasActive = false;
    const stateObserver = new MutationObserver(() => {
      const active = textboxActive();
      bridgeState.active = active;
      if (active && !wasActive) {
        restoreTextboxStyleControls();
        relayoutTextboxPreview();
      } else if (active) {
        restoreTextboxStyleControls();
      } else {
        requestAnimationFrame(syncSelectionStyleUi);
      }
      wasActive = active;
    });
    stateObserver.observe(textboxState, { childList: true, subtree: true, characterData: true });

    if (selectedCount) {
      new MutationObserver(() => requestAnimationFrame(syncSelectionStyleUi))
        .observe(selectedCount, { childList: true, subtree: true, characterData: true });
    }

    document.addEventListener('pointerup', () => requestAnimationFrame(syncSelectionStyleUi), true);
    document.addEventListener('click', () => requestAnimationFrame(syncSelectionStyleUi), true);
    syncSelectionStyleUi();
  });
})();
