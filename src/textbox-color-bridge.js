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
    const styleScope = document.getElementById('styleScope');
    const styleHint = document.getElementById('styleHint');
    const textboxState = document.getElementById('textboxState');
    const boxOffsetX = document.getElementById('boxOffsetX');
    const sizeInput = document.getElementById('sizeInput');
    const applyStyleBtn = document.getElementById('applyStyleBtn');
    if (!Core || !colorInput || !thicknessInput || !textboxState) return;

    const bridgeState = window.HandWriterTextboxStyle = {
      active: false,
      thickness: Math.max(0.01, Number(thicknessInput.value) || 0.08)
    };

    const nativeJitterInk = Core.jitterInk;
    const nativeClamp = Core.clamp;

    function textboxActive() {
      return /排版中/.test(textboxState.textContent || '');
    }

    // mvp-ui generates textbox glyph stroke width with Core.clamp(value, 0, 3).
    // Remap only that narrow signature while a draft textbox is active, so the
    // requested thickness is stored in preview glyphs and survives confirmation.
    Core.clamp = function (value, min, max) {
      if (bridgeState.active && min === 0 && max === 3 && Number.isFinite(value)) {
        const desired = Math.max(0.01, Number(thicknessInput.value) || 0.01);
        const originalVariation = value - 0.22;
        return nativeClamp(desired + originalVariation * 0.28, 0.01, 3);
      }
      return nativeClamp(value, min, max);
    };

    Core.jitterInk = function (hex, rng, amount, grayscaleOnly = true) {
      if (!bridgeState.active) return nativeJitterInk.call(this, hex, rng, amount, grayscaleOnly);
      const activeColor = colorInput.value || hex;
      return nativeJitterInk.call(this, activeColor, rng, amount, grayscaleOnly);
    };

    function refreshTextboxUi() {
      const nowActive = textboxActive();
      bridgeState.active = nowActive;
      bridgeState.thickness = Math.max(0.01, Number(thicknessInput.value) || 0.01);
      if (!nowActive) return;

      colorInput.disabled = false;
      thicknessInput.disabled = false;
      if (colorText) colorText.textContent = colorInput.value;
      if (thicknessText) thicknessText.textContent = bridgeState.thickness.toFixed(2) + 'px';
      if (styleScope) styleScope.textContent = '文本框预览样式';
      if (styleHint) styleHint.textContent = '颜色和粗细会立即作用于当前新建文本框';
      if (sizeInput) sizeInput.disabled = true;
      if (applyStyleBtn) applyStyleBtn.disabled = true;
    }

    let relayoutQueued = false;
    function relayoutTextboxPreview() {
      if (!textboxActive() || !boxOffsetX || relayoutQueued) return;
      bridgeState.active = true;
      bridgeState.thickness = Math.max(0.01, Number(thicknessInput.value) || 0.01);
      relayoutQueued = true;
      requestAnimationFrame(() => {
        relayoutQueued = false;
        boxOffsetX.dispatchEvent(new Event('input', { bubbles: true }));
        requestAnimationFrame(refreshTextboxUi);
      });
    }

    colorInput.addEventListener('input', () => {
      if (colorText) colorText.textContent = colorInput.value;
      relayoutTextboxPreview();
    });

    thicknessInput.addEventListener('input', () => {
      bridgeState.thickness = Math.max(0.01, Number(thicknessInput.value) || 0.01);
      if (thicknessText) thicknessText.textContent = bridgeState.thickness.toFixed(2) + 'px';
      relayoutTextboxPreview();
    });

    let wasActive = false;
    const observer = new MutationObserver(() => {
      const active = textboxActive();
      bridgeState.active = active;
      requestAnimationFrame(refreshTextboxUi);
      // The first layout happens before textboxState changes to “排版中”.
      // Re-layout once after activation so the initial draft also gets the user's
      // color/thickness without requiring an extra manual adjustment.
      if (active && !wasActive) relayoutTextboxPreview();
      wasActive = active;
    });
    observer.observe(textboxState, { childList: true, subtree: true, characterData: true });

    document.addEventListener('pointerup', () => requestAnimationFrame(refreshTextboxUi), true);
    document.addEventListener('click', () => requestAnimationFrame(refreshTextboxUi), true);
    requestAnimationFrame(refreshTextboxUi);
  });
})();
