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
    const styleScope = document.getElementById('styleScope');
    const styleHint = document.getElementById('styleHint');
    const textboxState = document.getElementById('textboxState');
    const boxOffsetX = document.getElementById('boxOffsetX');
    const thicknessInput = document.getElementById('thicknessInput');
    const sizeInput = document.getElementById('sizeInput');
    const applyStyleBtn = document.getElementById('applyStyleBtn');
    if (!Core || !colorInput || !textboxState) return;

    const nativeJitterInk = Core.jitterInk;
    Core.jitterInk = function (hex, rng, amount, grayscaleOnly = true) {
      const activeColor = colorInput.value || hex;
      const base = activeColor && typeof activeColor === 'string' ? activeColor : hex;
      return nativeJitterInk.call(this, base, rng, amount, grayscaleOnly);
    };

    function textboxActive() {
      return /排版中/.test(textboxState.textContent || '');
    }

    function refreshTextboxColorUi() {
      if (!textboxActive()) return;
      colorInput.disabled = false;
      if (colorText) colorText.textContent = colorInput.value;
      if (styleScope) styleScope.textContent = '文本框预览颜色';
      if (styleHint) styleHint.textContent = '修改颜色会立即作用于当前文本框中的预览字符';
      if (thicknessInput) thicknessInput.disabled = true;
      if (sizeInput) sizeInput.disabled = true;
      if (applyStyleBtn) applyStyleBtn.disabled = true;
    }

    function relayoutTextboxColor() {
      if (!textboxActive() || !boxOffsetX) return;
      boxOffsetX.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(refreshTextboxColorUi);
    }

    colorInput.addEventListener('input', () => {
      if (colorText) colorText.textContent = colorInput.value;
      relayoutTextboxColor();
    });

    const observer = new MutationObserver(() => requestAnimationFrame(refreshTextboxColorUi));
    observer.observe(textboxState, { childList: true, subtree: true, characterData: true });
    document.addEventListener('pointerup', () => requestAnimationFrame(refreshTextboxColorUi), true);
    document.addEventListener('click', () => requestAnimationFrame(refreshTextboxColorUi), true);
    requestAnimationFrame(refreshTextboxColorUi);
  });
})();
