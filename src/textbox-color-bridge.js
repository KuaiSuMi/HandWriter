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
      color: colorInput.value || '#161616',
      thickness: Math.max(0.01, Number(thicknessInput.value) || 0.08)
    };

    const nativeJitterInk = Core.jitterInk;
    const nativeClamp = Core.clamp;

    function textboxActive() {
      return /排版中/.test(textboxState.textContent || '');
    }

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

    function restoreTextboxStyleControls() {
      if (!textboxActive()) return;
      bridgeState.active = true;
      colorInput.disabled = false;
      thicknessInput.disabled = false;
      colorInput.value = bridgeState.color;
      thicknessInput.value = String(bridgeState.thickness);
      if (colorText) colorText.textContent = bridgeState.color;
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

    let wasActive = false;
    const observer = new MutationObserver(() => {
      const active = textboxActive();
      bridgeState.active = active;
      if (active && !wasActive) {
        restoreTextboxStyleControls();
        relayoutTextboxPreview();
      } else if (active) {
        restoreTextboxStyleControls();
      }
      wasActive = active;
    });
    observer.observe(textboxState, { childList: true, subtree: true, characterData: true });

    document.addEventListener('pointerup', () => requestAnimationFrame(restoreTextboxStyleControls), true);
    document.addEventListener('click', () => requestAnimationFrame(restoreTextboxStyleControls), true);
  });
})();
