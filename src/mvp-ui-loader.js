'use strict';
(function () {
  const SOURCE = './src/mvp-ui.js';

  function fallback() {
    if (document.querySelector('script[data-hw-original-ui]')) return;
    const script = document.createElement('script');
    script.src = SOURCE;
    script.dataset.hwOriginalUi = '1';
    script.onload = () => window.dispatchEvent(new Event('handwriter:editor-ready'));
    document.body.appendChild(script);
  }

  function patch(source) {
    const ctxNeedle = "  const ctx = els.canvas.getContext('2d');";
    if (!source.includes(ctxNeedle)) throw new Error('mvp-ui ctx declaration changed');
    source = source.replace(ctxNeedle, "  let ctx = els.canvas.getContext('2d');");

    const drawStart = source.indexOf('  function draw() {');
    const nextFunction = source.indexOf('\n\n  function hitTextboxHandle', drawStart);
    if (drawStart < 0 || nextFunction < 0) throw new Error('mvp-ui draw boundary changed');

    const layeredDraw = `  function draw() {\n` +
`    const layered = window.HandWriterLayeredRenderer;\n` +
`    if (layered && layered.render && layered.render({\n` +
`      canvas: els.canvas, doc, font, selectedGlyphIds, selectedTextboxId, interaction,\n` +
`      getContext: () => ctx, setContext: value => { ctx = value; },\n` +
`      drawBackground, drawGlyph, drawSelectionOverlay, drawDraftTextbox, drawRectOverlay\n` +
`    })) return;\n` +
`    drawBackground();\n` +
`    for (const g of doc.glyphs) drawGlyph(g);\n` +
`    drawSelectionOverlay();\n` +
`    for (const tb of doc.draftTextboxes) drawDraftTextbox(tb);\n` +
`    if (interaction.mode === 'marqueeSelect' && interaction.selectionRect) drawRectOverlay(interaction.selectionRect, 'rgba(0,0,0,.05)', 'rgba(0,0,0,.45)');\n` +
`    if (interaction.mode === 'createTextbox' && interaction.previewRect) drawRectOverlay(interaction.previewRect, 'rgba(0,0,0,.03)', 'rgba(0,0,0,.55)');\n` +
`  }`;

    return source.slice(0, drawStart) + layeredDraw + source.slice(nextFunction) + '\n//# sourceURL=handwriter-mvp-ui-layered.js\n';
  }

  fetch(SOURCE, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .then(source => {
      const patched = patch(source);
      (0, eval)(patched);
      window.dispatchEvent(new Event('handwriter:editor-ready'));
    })
    .catch(error => {
      console.warn('[HandWriter] layered renderer unavailable; falling back to original UI:', error);
      fallback();
    });
})();
