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
  if (data.type !== 'compose' || !data.background || !data.staticText) return;
  const width = Math.max(1, data.width | 0);
  const height = Math.max(1, data.height | 0);
  ensureCanvas(width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(data.background, 0, 0);
  ctx.drawImage(data.staticText, 0, 0);
  if (typeof data.background.close === 'function') data.background.close();
  if (typeof data.staticText.close === 'function') data.staticText.close();
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ type: 'composed', version: data.version, key: data.key, bitmap }, [bitmap]);
};
