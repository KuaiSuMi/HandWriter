export class BackgroundLayer {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.image = null;
    this.sourceName = null;
    this.objectUrl = null;
    this.fit = 'contain';
    this.opacity = 1;
  }

  async loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.src = this.objectUrl;
    await image.decode();
    this.image = image;
    this.sourceName = file.name;
    this.onChange(this.serialize());
  }

  clear() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.image = null;
    this.sourceName = null;
    this.onChange(this.serialize());
  }

  setFit(fit) {
    if (!['contain', 'cover', 'stretch'].includes(fit)) return;
    this.fit = fit;
    this.onChange(this.serialize());
  }

  setOpacity(opacity) {
    this.opacity = Math.max(0, Math.min(1, Number(opacity)));
    this.onChange(this.serialize());
  }

  draw(targetCtx = this.ctx) {
    const { width, height } = targetCtx.canvas;
    targetCtx.save();
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.fillStyle = '#fff';
    targetCtx.fillRect(0, 0, width, height);
    if (!this.image) {
      targetCtx.restore();
      return;
    }

    const iw = this.image.naturalWidth || this.image.width;
    const ih = this.image.naturalHeight || this.image.height;
    let dx = 0, dy = 0, dw = width, dh = height;
    if (this.fit !== 'stretch') {
      const scale = this.fit === 'cover'
        ? Math.max(width / iw, height / ih)
        : Math.min(width / iw, height / ih);
      dw = iw * scale;
      dh = ih * scale;
      dx = (width - dw) / 2;
      dy = (height - dh) / 2;
    }

    targetCtx.globalAlpha = this.opacity;
    targetCtx.drawImage(this.image, dx, dy, dw, dh);
    targetCtx.restore();
  }

  serialize() {
    return {
      sourceName: this.sourceName,
      fit: this.fit,
      opacity: this.opacity,
      hasImage: Boolean(this.image)
    };
  }

  destroy() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}
