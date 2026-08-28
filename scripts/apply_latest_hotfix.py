from pathlib import Path
import re

root = Path('.')
ui_path = root / 'src' / 'mvp-ui.js'
html_path = root / 'standalone.html'
ui = ui_path.read_text(encoding='utf-8')
html = html_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing patch target: {label}')
    return text.replace(old, new, 1)

# Stable seed for glyph-local noise.
ui = re.sub(r"noise:\s*\{\s*amount:\s*0,\s*size:\s*1,\s*colorful:\s*false(?:,\s*seed:\s*305419896)?\s*\}",
            "noise: { amount: 0, size: 1, colorful: false, seed: 305419896 }", ui, count=1)

# Textbox rotation model and preview re-application.
marker = "  function textboxInnerRect(tb) {"
helpers = """  function getTextboxRenderBox(tb) {\n    return { cx: tb.x + tb.width / 2, cy: tb.y + tb.height / 2, w: tb.width, h: tb.height, angle: (tb.rotation || 0) * Math.PI / 180 };\n  }\n\n  function applyTextboxRotation(tb) {\n    const box = getTextboxRenderBox(tb);\n    const angleDeg = tb.rotation || 0;\n    const angle = angleDeg * Math.PI / 180;\n    const baseList = (tb.basePreviewGlyphs || []).map(g => createGlyphObject({ ...g, id: g.id }));\n    tb.previewGlyphs = baseList.map(src => {\n      const q = Core.rotatePoint(src.x, src.y, box.cx, box.cy, angle);\n      return createGlyphObject({ ...src, id: src.id, x: q.x, y: q.y, rotation: (src.rotation || 0) + angleDeg });\n    });\n    return tb;\n  }\n\n"""
if 'function getTextboxRenderBox(tb)' not in ui:
    ui = ui.replace(marker, helpers + marker, 1)

ui = replace_once(ui,
"""    tb.previewGlyphs = Core.normalizeGlyphTop(font, result, tb.y + tb.padding + tb.offsetY);\n    tb.overflowCount = overflowCount;\n    return tb;\n""",
"""    tb.basePreviewGlyphs = Core.normalizeGlyphTop(font, result, tb.y + tb.padding + tb.offsetY).map(g => createGlyphObject({ ...g, id: g.id }));\n    tb.overflowCount = overflowCount;\n    applyTextboxRotation(tb);\n    return tb;\n""", 'textbox layout rotation')

ui = replace_once(ui,
"""      padding: 16, charGap: 0, lineGap: 1.55, offsetX: 0, offsetY: 0,\n      previewGlyphs: [], overflowCount: 0\n""",
"""      padding: 16, charGap: 0, lineGap: 1.55, offsetX: 0, offsetY: 0, rotation: 0,\n      basePreviewGlyphs: [], previewGlyphs: [], overflowCount: 0\n""", 'textbox state')

# Global noise becomes glyph-local blending only.
start = ui.index('  function drawNoise() {')
end = ui.index('  function drawInkTexture(g) {', start)
ui = ui[:start] + """  function drawNoise() {\n    // Global canvas noise is intentionally disabled. Noise is applied to glyphs only.\n  }\n\n""" + ui[end:]

blend_fn = """  function drawGlyphBlendNoise(g) {\n    const noise = doc.noise;\n    if (!noise.amount) return;\n    const amount = noise.amount;\n    const size = Math.max(1, noise.size | 0);\n    const seed = Core.mixSeed(noise.seed || 305419896, g.inkSeed || g.variantSeed, g.char.charCodeAt(0));\n    const rng = Core.mulberry32(seed);\n    const baseHex = g.fill || DEFAULT_COLOR;\n    const baseRgb = Core.hexToRgb(baseHex);\n\n    const fuzzPasses = 1 + Math.round(amount * 4 + size * 0.4);\n    for (let i = 0; i < fuzzPasses; i++) {\n      const dx = (rng() - 0.5) * size * (0.5 + amount);\n      const dy = (rng() - 0.5) * size * (0.5 + amount);\n      const delta = (rng() - 0.5) * (noise.colorful ? 40 : 22);\n      ctx.save();\n      ctx.translate(dx, dy);\n      ctx.globalAlpha = 0.025 + amount * 0.05;\n      ctx.fillStyle = Core.rgbaString(noise.colorful ? { r: baseRgb.r + delta, g: baseRgb.g - delta * 0.25, b: baseRgb.b + delta * 0.6 } : Core.hexToRgb(Core.offsetColor(baseHex, delta)), 1);\n      ctx.fill(g.geo.path);\n      ctx.restore();\n    }\n\n    ctx.save();\n    ctx.clip(g.geo.path);\n    const speckles = Math.max(10, Math.round((g.geo.width * g.geo.height / 1800) * (0.4 + amount * 1.8)));\n    for (let i = 0; i < speckles; i++) {\n      const x = rng() * g.geo.width, y = rng() * g.geo.height;\n      const r = (0.15 + rng() * 0.75) * size;\n      const delta = (rng() - 0.5) * (noise.colorful ? 48 : 26);\n      ctx.beginPath();\n      ctx.fillStyle = Core.rgbaString(noise.colorful ? { r: baseRgb.r + delta, g: baseRgb.g + delta * 0.2, b: baseRgb.b - delta * 0.35 } : Core.hexToRgb(Core.offsetColor(baseHex, delta)), 0.035 + rng() * (0.06 + amount * 0.06));\n      ctx.arc(x, y, r, 0, Math.PI * 2);\n      ctx.fill();\n    }\n    ctx.restore();\n\n    ctx.save();\n    ctx.globalAlpha = 0.03 + amount * 0.08;\n    ctx.lineWidth = Math.max(0.35, (g.strokeWidth || 0.1) + size * 0.35);\n    ctx.lineCap = 'round';\n    ctx.lineJoin = 'round';\n    const edgeDelta = (rng() - 0.5) * (noise.colorful ? 38 : 20);\n    ctx.strokeStyle = Core.rgbaString(noise.colorful ? { r: baseRgb.r + edgeDelta, g: baseRgb.g - edgeDelta * 0.2, b: baseRgb.b + edgeDelta * 0.25 } : Core.hexToRgb(Core.offsetColor(baseHex, edgeDelta)), 1);\n    ctx.stroke(g.geo.path);\n    ctx.restore();\n  }\n\n"""
if 'function drawGlyphBlendNoise(g)' not in ui:
    ui = ui.replace('  function drawGlyph(g) {', blend_fn + '  function drawGlyph(g) {', 1)
ui = replace_once(ui, '    drawInkTexture(g);\n', '    drawInkTexture(g);\n    drawGlyphBlendNoise(g);\n', 'glyph blend call')

# Rotated textbox frame + handles.
start = ui.index('  function textboxHandles(tb) {')
end = ui.index('  function drawRectOverlay(', start)
textbox_render = """  function textboxHandles(tb) {\n    const box = getTextboxRenderBox(tb);\n    const locals = [\n      { kind: 'nw', x: box.cx - box.w / 2, y: box.cy - box.h / 2 },\n      { kind: 'ne', x: box.cx + box.w / 2, y: box.cy - box.h / 2 },\n      { kind: 'sw', x: box.cx - box.w / 2, y: box.cy + box.h / 2 },\n      { kind: 'se', x: box.cx + box.w / 2, y: box.cy + box.h / 2 },\n      { kind: 'rotate', x: box.cx, y: box.cy - box.h / 2 - ROTATE_OFFSET }\n    ];\n    return locals.map(h => ({ ...h, ...Core.rotatePoint(h.x, h.y, box.cx, box.cy, box.angle) }));\n  }\n\n  function drawRotatedRect(box, strokeStyle, dash) {\n    const corners = Core.rotatedRectCorners(box);\n    ctx.save();\n    ctx.strokeStyle = strokeStyle;\n    ctx.setLineDash(dash || []);\n    ctx.lineWidth = 1.2;\n    ctx.beginPath();\n    ctx.moveTo(corners[0].x, corners[0].y);\n    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);\n    ctx.closePath();\n    ctx.stroke();\n    ctx.restore();\n  }\n\n  function drawTextboxHandles(tb) {\n    const handles = textboxHandles(tb);\n    const box = getTextboxRenderBox(tb);\n    const topMid = Core.rotatePoint(box.cx, box.cy - box.h / 2, box.cx, box.cy, box.angle);\n    const rotateHandle = handles.find(h => h.kind === 'rotate');\n    ctx.save();\n    ctx.fillStyle = '#fff';\n    ctx.strokeStyle = '#111';\n    ctx.lineWidth = 1.2;\n    if (rotateHandle) {\n      ctx.beginPath();\n      ctx.moveTo(topMid.x, topMid.y);\n      ctx.lineTo(rotateHandle.x, rotateHandle.y);\n      ctx.stroke();\n    }\n    for (const h of handles) {\n      if (h.kind === 'rotate') {\n        ctx.beginPath();\n        ctx.arc(h.x, h.y, HANDLE_VISUAL / 2, 0, Math.PI * 2);\n        ctx.fill();\n        ctx.stroke();\n      } else {\n        ctx.fillRect(h.x - HANDLE_VISUAL / 2, h.y - HANDLE_VISUAL / 2, HANDLE_VISUAL, HANDLE_VISUAL);\n        ctx.strokeRect(h.x - HANDLE_VISUAL / 2, h.y - HANDLE_VISUAL / 2, HANDLE_VISUAL, HANDLE_VISUAL);\n      }\n    }\n    ctx.restore();\n  }\n\n  function drawDraftTextbox(tb) {\n    drawRotatedRect(getTextboxRenderBox(tb), tb.id === selectedTextboxId ? 'rgba(34,34,34,.8)' : 'rgba(0,0,0,.22)', tb.id === selectedTextboxId ? [8, 4] : [5, 4]);\n    for (const g of tb.previewGlyphs) drawGlyph(g);\n    if (tb.id === selectedTextboxId) drawTextboxHandles(tb);\n  }\n\n"""
ui = ui[:start] + textbox_render + ui[end:]

# Rotated textbox hit testing.
start = ui.index('  function hitDraftTextbox(p) {')
end = ui.index('  function syncTextboxPanel()', start)
ui = ui[:start] + """  function hitDraftTextbox(p) {\n    for (let i = doc.draftTextboxes.length - 1; i >= 0; i--) {\n      const tb = doc.draftTextboxes[i];\n      if (Core.pointInRotatedRect(p, getTextboxRenderBox(tb))) return tb;\n    }\n    return null;\n  }\n\n""" + ui[end:]

old_down = """      if (handle) {\n        snapshot();\n        interaction = { mode: handle.kind === 'rotate' ? 'rotateTextbox' : 'resizeTextbox', handle, start: p, textboxId: tb.id,\n          orig: { x: tb.x, y: tb.y, w: tb.width, h: tb.height }, center: { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 },\n          startAngle: Math.atan2(p.y - (tb.y + tb.height / 2), p.x - (tb.x + tb.width / 2)), glyphSnapshot: tb.previewGlyphs.map(g => ({ ...g })) };\n        return;\n      }\n      if (Core.pointInRect(p, { x: tb.x, y: tb.y, w: tb.width, h: tb.height })) {\n        snapshot();\n        interaction = { mode: 'moveTextbox', start: p, textboxId: tb.id, orig: { x: tb.x, y: tb.y }, glyphSnapshot: tb.previewGlyphs.map(g => ({ id: g.id, x: g.x, y: g.y })) };\n        draw(); return;\n      }\n"""
new_down = """      if (handle) {\n        snapshot();\n        const box = getTextboxRenderBox(tb);\n        interaction = { mode: handle.kind === 'rotate' ? 'rotateTextbox' : 'resizeTextbox', handle, start: p, textboxId: tb.id,\n          orig: { x: tb.x, y: tb.y, w: tb.width, h: tb.height }, origRotation: tb.rotation || 0, center: { x: box.cx, y: box.cy }, boxAngle: box.angle,\n          startAngle: Math.atan2(p.y - box.cy, p.x - box.cx) };\n        return;\n      }\n      if (Core.pointInRotatedRect(p, getTextboxRenderBox(tb))) {\n        snapshot();\n        interaction = { mode: 'moveTextbox', start: p, textboxId: tb.id, orig: { x: tb.x, y: tb.y },\n          glyphSnapshot: tb.previewGlyphs.map(g => ({ id: g.id, x: g.x, y: g.y })), baseGlyphSnapshot: (tb.basePreviewGlyphs || []).map(g => ({ id: g.id, x: g.x, y: g.y })) };\n        draw(); return;\n      }\n"""
ui = replace_once(ui, old_down, new_down, 'textbox pointerdown')

old_move = """      for (const s of interaction.glyphSnapshot) {\n        const g = tb.previewGlyphs.find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }\n      }\n      draw(); syncUI(); return;\n"""
new_move = """      for (const s of interaction.glyphSnapshot) {\n        const g = tb.previewGlyphs.find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }\n      }\n      for (const s of interaction.baseGlyphSnapshot || []) {\n        const g = (tb.basePreviewGlyphs || []).find(x => x.id === s.id); if (g) { g.x = s.x + dx; g.y = s.y + dy; }\n      }\n      draw(); syncUI(); return;\n"""
ui = replace_once(ui, old_move, new_move, 'textbox move')

old_resize = """      const r = { ...interaction.orig };\n      if (interaction.handle.kind.includes('n')) { r.y = Math.min(interaction.orig.y + interaction.orig.h - 40, p.y); r.h = interaction.orig.y + interaction.orig.h - r.y; }\n      if (interaction.handle.kind.includes('s')) { r.h = Math.max(40, p.y - interaction.orig.y); }\n      if (interaction.handle.kind.includes('w')) { r.x = Math.min(interaction.orig.x + interaction.orig.w - 60, p.x); r.w = interaction.orig.x + interaction.orig.w - r.x; }\n      if (interaction.handle.kind.includes('e')) { r.w = Math.max(60, p.x - interaction.orig.x); }\n"""
new_resize = """      const center = { x: interaction.orig.x + interaction.orig.w / 2, y: interaction.orig.y + interaction.orig.h / 2 };\n      const lp = Core.rotatePoint(p.x, p.y, center.x, center.y, -(interaction.boxAngle || 0));\n      const r = { ...interaction.orig };\n      if (interaction.handle.kind.includes('n')) { r.y = Math.min(interaction.orig.y + interaction.orig.h - 40, lp.y); r.h = interaction.orig.y + interaction.orig.h - r.y; }\n      if (interaction.handle.kind.includes('s')) { r.h = Math.max(40, lp.y - interaction.orig.y); }\n      if (interaction.handle.kind.includes('w')) { r.x = Math.min(interaction.orig.x + interaction.orig.w - 60, lp.x); r.w = interaction.orig.x + interaction.orig.w - r.x; }\n      if (interaction.handle.kind.includes('e')) { r.w = Math.max(60, lp.x - interaction.orig.x); }\n"""
ui = replace_once(ui, old_resize, new_resize, 'textbox resize')

old_rotate = """      const angle = Math.atan2(p.y - interaction.center.y, p.x - interaction.center.x) - interaction.startAngle;\n      tb.previewGlyphs.forEach((g, i) => {\n        const old = interaction.glyphSnapshot[i];\n        const q = Core.rotatePoint(old.x, old.y, interaction.center.x, interaction.center.y, angle);\n        g.x = q.x; g.y = q.y; g.rotation = old.rotation + angle * 180 / Math.PI;\n      });\n      draw(); syncUI(); return;\n"""
new_rotate = """      const angle = Math.atan2(p.y - interaction.center.y, p.x - interaction.center.x) - interaction.startAngle;\n      tb.rotation = interaction.origRotation + angle * 180 / Math.PI;\n      applyTextboxRotation(tb);\n      draw(); syncUI(); return;\n"""
ui = replace_once(ui, old_rotate, new_rotate, 'textbox rotate')

# UI wording: noise is now text/background blending, not full-canvas grain.
html = html.replace('画布 / 背景 / 噪点', '画布 / 背景 / 文字融合')
html = html.replace('噪点强度', '文字融合强度')

ui_path.write_text(ui, encoding='utf-8')
html_path.write_text(html, encoding='utf-8')

# Clean temporary sync probes and this one-shot automation after it runs.
for rel in ['__sync_probe__.txt', '__sync_probe_2__.txt', 'scripts/apply_latest_hotfix.py', '.github/workflows/apply-latest-hotfix.yml']:
    p = root / rel
    if p.exists():
        p.unlink()
