'use strict';
(function () {
  const RANGE_IDS = new Set([
    'zoomInput','bgScale','bgOpacity','noiseAmount','sheenInput','noiseSize','noiseColor',
    'boxFontSize','boxPadding','boxCharGap','boxLineGap','boxOffsetX','boxOffsetY',
    'thicknessInput','sizeInput','opacityInput','brightnessInput','localToneInput','localStrokeInput'
  ]);

  function rafThrottle(fn, el) {
    let queued = false;
    let lastEvent = null;
    return function (event) {
      lastEvent = event;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const e = lastEvent;
        lastEvent = null;
        fn.call(el, e);
      });
    };
  }

  function installRangeThrottles() {
    for (const id of RANGE_IDS) {
      const el = document.getElementById(id);
      if (!el || typeof el.oninput !== 'function' || el.dataset.hwRafInput === '1') continue;
      el.oninput = rafThrottle(el.oninput, el);
      el.dataset.hwRafInput = '1';
    }
  }

  function installRangeFastPreview() {
    const ink = window.HandWriterInkVariation;
    if (!ink) return;
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'range') ink.interactive = true;
    }, true);
    const finish = () => {
      if (!ink.interactive) return;
      ink.interactive = false;
      const zoom = document.getElementById('zoomInput');
      if (zoom) zoom.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
  }

  function installCandidateDomFreeze() {
    const area = document.getElementById('candidateArea');
    const canvas = document.getElementById('canvas');
    if (!area || !canvas) return;

    const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const nativeAppend = area.appendChild.bind(area);
    let busy = false;

    if (innerHTML && innerHTML.get && innerHTML.set) {
      Object.defineProperty(area, 'innerHTML', {
        configurable: true,
        get() { return innerHTML.get.call(area); },
        set(value) {
          if (!busy) innerHTML.set.call(area, value);
        }
      });
    }

    area.appendChild = function (node) {
      if (busy) return node;
      return nativeAppend(node);
    };

    canvas.addEventListener('pointerdown', () => { busy = true; }, true);
    const release = () => { busy = false; };
    canvas.addEventListener('pointerup', release, true);
    canvas.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
  }

  function installTinyInkDetailSkip() {
    const ink = window.HandWriterInkVariation;
    if (!ink) return;
    const proto = CanvasRenderingContext2D.prototype;
    const nativeArc = proto.arc;
    proto.arc = function (x, y, radius, startAngle, endAngle, counterclockwise) {
      // Ink texture uses many sub-2px dots. They are visually irrelevant while
      // dragging but expensive across hundreds of glyphs. Handles are much larger.
      if (ink.interactive && radius < 2.25) return;
      return nativeArc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
    };
  }

  let coreInstalled = false;
  function install() {
    // Range handlers are assigned by mvp-ui, which can now be loaded asynchronously
    // through mvp-ui-loader. Re-running this part is intentional and idempotent.
    installRangeThrottles();
    if (coreInstalled) return;
    coreInstalled = true;
    installRangeFastPreview();
    installCandidateDomFreeze();
    installTinyInkDetailSkip();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  window.addEventListener('handwriter:editor-ready', install);
})();
