'use strict';
let canvas = null;
let ctx = null;

function ensureCanvas(width, height) {
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(Math.max(1, width | 0), Math.max(1, height | 0));
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  }
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type !== 'cache-base' || !data.base) return;
  const width = Math.max(1, data.width | 0);
  const height = Math.max(1, data.height | 0);
  ensureCanvas(width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(data.base, 0, 0);
  if (typeof data.base.close === 'function') data.base.close();
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ type: 'cached-base', version: data.version, key: data.key, bitmap }, [bitmap]);
};
