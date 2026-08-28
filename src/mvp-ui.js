'use strict';
function drawTextboxHandles(tb) {
  const handles = textboxHandles(tb);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  for (const h of handles) {
    if (h.kind === 'rotate') {
      ctx.beginPath();
      ctx.moveTo(tb.x + tb.width / 2, tb.y);
      ctx.lineTo(h.x, h.y + HANDLE_SIZE / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
  }
  ctx.restore();
}
function drawSelectionRect(rect){ctx.save();ctx.fillStyle='rgba(0,0,0,.055)';ctx.strokeStyle='rgba(0,0,0,.45)';ctx.setLineDash([5,4]);ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);ctx.restore()}
function drawCreationRect(rect){ctx.save();ctx.fillStyle='rgba(0,0,0,.03)';ctx.strokeStyle='rgba(0,0,0,.5)';ctx.setLineDash([6,4]);ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);ctx.restore()}
function draw() { drawBackground(); for (const tb of doc.textboxes) drawTextbox(tb); if (interaction.selectionRect) drawSelectionRect(interaction.selectionRect); if (interaction.mode === 'createTextbox' && interaction.previewRect) drawCreationRect(interaction.previewRect); }

function textboxHandles(tb) { return [
  { kind: 'nw', x: tb.x, y: tb.y }, { kind: 'ne', x: tb.x + tb.width, y: tb.y }, { kind: 'sw', x: tb.x, y: tb.y + tb.height }, { kind: 'se', x: tb.x + tb.width, y: tb.y + tb.height },
  { kind: 'rotate', x: tb.x + tb.width / 2, y: tb.y - ROTATE_OFFSET }
]; }
function pointInRect(p,r){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h}
function rectNorm(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)}}
function hitGlyph(p) { for (let ti = doc.textboxes.length - 1; ti >= 0; ti--) { const tb = doc.textboxes[ti]; for (let i = tb.glyphs.length - 1; i >= 0; i--) { const g = tb.glyphs[i]; ensureGeo(g); const local = { x: p.x - (g.x - g.geo.width / 2), y: p.y - (g.y - g.geo.height / 2) }; if (ctx.isPointInPath(g.geo.path, local.x, local.y) || ((g.strokeWidth||0)>0.01&&ctx.isPointInStroke(g.geo.path, local.x, local.y))) return { textbox: tb, glyph: g }; }} return null; }
function hitTextbox(p) { for (let i = doc.textboxes.length - 1; i >= 0; i--) { const tb = doc.textboxes[i]; if (pointInRect(p, { x: tb.x, y: tb.y, w: tb.width, h: tb.height })) return tb; } return null; }
function hitHandle(tb,p){for(const h of textboxHandles(tb)){if(Math.hypot(p.x-h.x,p.y-h.y)<=HANDLE_SIZE)return h}return null}
function toCanvasPoint(evt){const r=els.canvas.getBoundingClientRect();return{x:(evt.clientX-r.left)/doc.zoom,y:(evt.clientY-r.top)/doc.zoom}}
function rotatePoint(x, y, cx, cy, a){const dx=x-cx,dy=y-cy;return{x:cx+dx*Math.cos(a)-dy*Math.sin(a),y:cy+dx*Math.sin(a)+dy*Math.cos(a)}}

function syncTextboxPanel() {
  const tb = activeTextbox();
  const disabled = !tb;
  ['boxFontSize','boxPadding','boxCharGap','boxLineGap','boxOffsetX','boxOffsetY','regenerateBoxBtn','deleteTextboxBtn'].forEach(id => els[id].disabled = disabled);
  if (!tb) {
    els.textboxState.textContent = '未选择';
    els.overflowInfo.textContent = '未选择文本框';
    els.textboxInfo.textContent = '使用拖拽手柄缩放';
    return;
  }
  els.textboxState.textContent = `#${doc.textboxes.indexOf(tb)+1} 文本框`;
  els.boxFontSize.value = String(Math.round(tb.fontSize)); els.boxFontSizeText.textContent = Math.round(tb.fontSize) + 'px';
  els.boxPadding.value = String(Math.round(tb.padding)); els.boxPaddingText.textContent = Math.round(tb.padding) + 'px';
  els.boxCharGap.value = String(Math.round(tb.charGap)); els.boxCharGapText.textContent = Math.round(tb.charGap) + 'px';
  els.boxLineGap.value = String(tb.lineGap); els.boxLineGapText.textContent = tb.lineGap.toFixed(2) + '×';
  els.boxOffsetX.value = String(Math.round(tb.offsetX)); els.boxOffsetXText.textContent = Math.round(tb.offsetX) + 'px';
  els.boxOffsetY.value = String(Math.round(tb.offsetY)); els.boxOffsetYText.textContent = Math.round(tb.offsetY) + 'px';
  els.overflowInfo.textContent = tb.overflowCount ? `有 ${tb.overflowCount} 个字符未放入文本框` : '文本框内文字已全部放下';
  els.textboxInfo.textContent = `${Math.round(tb.width)}×${Math.round(tb.height)} px`;
}
function syncGlyphPanel() {
  const arr = selectedGlyphs();
  const disabled = !arr.length;
  els.colorInput.disabled = disabled; els.thicknessInput.disabled = disabled; els.sizeInput.disabled = disabled; els.applyStyleBtn.disabled = disabled;
  if (!arr.length) {
    els.styleScope.textContent = '未选择'; els.styleHint.textContent = '先选择字符';
    els.colorInput.value = DEFAULT_COLOR; els.colorText.textContent = DEFAULT_COLOR; els.thicknessInput.value = '0.30'; els.thicknessText.textContent = '0.30px'; els.sizeInput.value = els.fontSize.value; els.sizeText.textContent = els.fontSize.value + 'px';
    return;
  }
  const first = arr[0];
  els.styleScope.textContent = arr.length === 1 ? '单字编辑' : '批量编辑';
  els.styleHint.textContent = arr.length === 1 ? '当前修改仅作用于该字' : '当前修改会作用于所有已选字';
  els.colorInput.value = first.fill || DEFAULT_COLOR; els.colorText.textContent = els.colorInput.value;
  els.thicknessInput.value = (first.strokeWidth || 0).toFixed(2); els.thicknessText.textContent = Number(els.thicknessInput.value).toFixed(2)+'px';
  els.sizeInput.value = String(Math.round(first.fontSize)); els.sizeText.textContent = Math.round(first.fontSize)+'px';
}
function updateCandidates() {
  els.candidateArea.innerHTML = '';
  const arr = selectedGlyphs();
  if (arr.length !== 1) {
    els.rerollBtn.hidden = true;
    els.candidateArea.className = 'muted';
    els.candidateArea.textContent = arr.length > 1 ? '多选状态下不生成单字候选。' : '单击字符后显示 6 个候选。';
    if (!arr.length) resetCandidateState();
    return;
  }
  const g = arr[0];
  if (candidateState.glyphId !== g.id || candidateState.nonce !== candidateNonce || !candidateState.list.length) candidateState = { glyphId: g.id, nonce: candidateNonce, list: candidates(g) };
  const cs = candidateState.list;
  els.rerollBtn.hidden = false; els.candidateArea.className = 'cands';
  for (const c of cs) {
    const btn = document.createElement('button'); btn.className='cand'; btn.title='seed '+c.seed; btn.style.color=g.fill||DEFAULT_COLOR;
    if (c.seed === g.variantSeed) { btn.style.borderColor='#111'; btn.style.background='#fff'; }
    btn.innerHTML=`<svg viewBox="0 0 ${Math.max(1,c.geo.width)} ${Math.max(1,c.geo.height)}"><path d="${c.geo.pathData}" fill="currentColor"></path></svg>`;
    btn.onclick = () => {
      snapshot();
      const tb = doc.textboxes.find(t => t.id === g.textboxId); if (!tb) return;
      const target = tb.glyphs.find(x => x.id === g.id); if (!target) return;
      target.variantSeed = c.seed; target.geo = c.geo; target.geoSeed = c.seed; target.geoStrength = target.warpStrength; target.geoBias = target.instanceBias; target.geoSize = target.fontSize; target.y = preserveBaselineY(target, c.geo);
      candidateState = { glyphId:g.id, nonce:candidateNonce, list:cs };
      draw(); syncUI();
    };
    els.candidateArea.appendChild(btn);
  }
}
function syncSelectionInfo() {
  const arr = selectedGlyphs();
  els.selectedCount.textContent = arr.length + ' 个字符';
  if (arr.length) {
    els.selectionInfo.innerHTML = `<div class="selectedText">${arr.map(g=>g.char).join('')}</div><p class="muted">当前为单字编辑模式。可改颜色、粗细、大小，并从候选面板选变体。</p>`;
  } else if (selectedTextboxId) {
    els.selectionInfo.innerHTML = `<div class="selectedText">文本框</div><p class="muted">拖动文本框可整体移动；拖角点可缩放；旋转手柄可旋转框内所有文字。</p>`;
  } else {
    els.selectionInfo.textContent = '默认选择文本框。点击字符进入单字编辑。空白处取消选择；文本框模式下可拖动/缩放文本框。';
  }
}
function syncUI() { syncSelectionInfo(); syncTextboxPanel(); syncGlyphPanel(); updateCandidates(); els.undoBtn.disabled=!past.length; els.redoBtn.disabled=!future.length; els.deleteBtn.disabled=!selectedGlyphIds.size; }

function applyTextboxControls() {
  const tb = activeTextbox(); if (!tb) return;
  tb.fontSize = +els.boxFontSize.value; tb.padding = +els.boxPadding.value; tb.charGap = +els.boxCharGap.value; tb.lineGap = +els.boxLineGap.value; tb.offsetX = +els.boxOffsetX.value; tb.offsetY = +els.boxOffsetY.value; tb.text = els.text.value; tb.warpStrength=+els.strength.value; tb.diversity=+els.diversity.value;
  layoutTextbox(tb); draw(); syncUI();
}
function applyGlyphStyles() {
  const arr = selectedGlyphs(); if (!arr.length) return; snapshot();
  const fill = els.colorInput.value, strokeWidth = Math.max(0, +els.thicknessInput.value || 0), size = Math.max(16, +els.sizeInput.value || 16);
  for (const g of arr) { g.fill=fill; g.strokeWidth=strokeWidth; if (size !== g.fontSize) { const newGeo=geometry(g.char,size,g.variantSeed,g.warpStrength,g.instanceBias); g.fontSize=size; g.geo=newGeo; g.geoSeed=g.variantSeed; g.geoStrength=g.warpStrength; g.geoBias=g.instanceBias; g.geoSize=size; g.y=preserveBaselineY(g,newGeo); }}
  draw(); syncUI();
}

function loadPreset(id){const preset=PRESET_FONTS[id]; if(!preset) return; els.fontName.textContent='正在加载：'+preset.name+'…'; const encoded=encodeURIComponent(preset.file); const sources=['./fonts/'+encoded,FONT_BASE+'/'+encoded]; return (async()=>{ for(const url of sources){ try{ const res=await fetch(url,{mode:'cors'}); if(!res.ok) throw new Error('HTTP '+res.status); font=opentype.parse(await res.arrayBuffer()); els.fontName.textContent='已加载：'+preset.name; return; }catch(err){} } els.fontName.textContent='预设字体加载失败，请使用本地字体'; })() }

els.presetSelect.onchange=()=>{loadPreset(els.presetSelect.value)};
els.fontInput.onchange=async e=>{const file=e.target.files&&e.target.files[0]; if(!file) return; try{ font=opentype.parse(await file.arrayBuffer()); els.fontName.textContent='已加载：'+file.name; }catch(err){ alert('字体解析失败：'+err.message) }};
els.fontSize.oninput=()=>els.fontSizeVal.textContent=els.fontSize.value+'px';
els.strength.oninput=()=>els.strengthVal.textContent=(+els.strength.value*100).toFixed(1)+'%';
els.diversity.oninput=()=>els.diversityVal.textContent=Math.round(+els.diversity.value*100)+'%';
els.sizePreset.onchange=()=>applySizePreset(els.sizePreset.value);
els.applyCanvasBtn.onclick=()=>commitCanvasSize(+els.canvasWidthInput.value,+els.canvasHeightInput.value);
els.zoomInput.oninput=()=>{updateZoom(els.zoomInput.value); draw();};
els.bgMode.onchange=()=>{doc.background.mode=els.bgMode.value; draw();};
els.bgScale.oninput=()=>{doc.background.scale=+els.bgScale.value; els.bgScaleText.textContent=Math.round(doc.background.scale*100)+'%'; draw();};
els.bgOpacity.oninput=()=>{doc.background.opacity=+els.bgOpacity.value; els.bgOpacityText.textContent=Math.round(doc.background.opacity*100)+'%'; draw();};
els.bgInput.onchange=async e=>{const file=e.target.files&&e.target.files[0]; if(!file) return; const img=new Image(); img.onload=()=>{ snapshot(); doc.background.image=img; doc.background.fileName=file.name; setCanvasSize(img.width,img.height); els.canvasWidthInput.value=img.width; els.canvasHeightInput.value=img.height; els.sizePreset.value='custom'; clearSelection(); draw(); syncUI(); }; img.src=URL.createObjectURL(file); };
els.clearBgBtn.onclick=()=>{snapshot(); doc.background.image=null; doc.background.fileName=''; draw(); syncUI();};
els.newTextboxBtn.onclick=()=>{interaction={mode:'createTextbox'}; selectedTextboxId=null; selectedGlyphIds=new Set(); syncUI();};
els.regenerateBoxBtn.onclick=()=>{const tb=activeTextbox(); if(!tb) return; snapshot(); applyTextboxControls(); };
els.deleteTextboxBtn.onclick=()=>{if(!selectedTextboxId) return; snapshot(); doc.textboxes=doc.textboxes.filter(t=>t.id!==selectedTextboxId); clearSelection(); draw(); syncUI();};
els.boxFontSize.oninput=()=>{els.boxFontSizeText.textContent=els.boxFontSize.value+'px'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.boxPadding.oninput=()=>{els.boxPaddingText.textContent=els.boxPadding.value+'px'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.boxCharGap.oninput=()=>{els.boxCharGapText.textContent=els.boxCharGap.value+'px'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.boxLineGap.oninput=()=>{els.boxLineGapText.textContent=Number(els.boxLineGap.value).toFixed(2)+'×'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.boxOffsetX.oninput=()=>{els.boxOffsetXText.textContent=els.boxOffsetX.value+'px'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.boxOffsetY.oninput=()=>{els.boxOffsetYText.textContent=els.boxOffsetY.value+'px'; const tb=activeTextbox(); if(tb) applyTextboxControls();};
els.colorInput.oninput=()=>els.colorText.textContent=els.colorInput.value;
els.thicknessInput.oninput=()=>els.thicknessText.textContent=Number(els.thicknessInput.value).toFixed(2)+'px';
els.sizeInput.oninput=()=>els.sizeText.textContent=els.sizeInput.value+'px';
els.applyStyleBtn.onclick=applyGlyphStyles;
els.rerollBtn.onclick=()=>{candidateNonce++; resetCandidateState(); updateCandidates();};
els.undoBtn.onclick=undo; els.redoBtn.onclick=redo;
els.deleteBtn.onclick=()=>{if(!selectedGlyphIds.size)return; snapshot(); for(const tb of doc.textboxes){tb.glyphs=tb.glyphs.filter(g=>!selectedGlyphIds.has(g.id));} selectedGlyphIds=new Set(); draw(); syncUI();};
els.exportBtn.onclick=()=>{const out=document.createElement('canvas'); out.width=doc.width; out.height=doc.height; const c=out.getContext('2d'); c.drawImage(els.canvas,0,0); const a=document.createElement('a'); a.download='HandWriter.png'; a.href=out.toDataURL('image/png'); a.click();};
window.addEventListener('keydown',e=>{const tag=(e.target.tagName||'').toLowerCase(); if(tag==='input'||tag==='textarea'||tag==='select') return; const key=e.key.toLowerCase(); if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault(); e.shiftKey?redo():undo();} else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault(); redo();} else if(e.key==='Delete'||e.key==='Backspace'){if(selectedGlyphIds.size){e.preventDefault(); els.deleteBtn.click();} else if(selectedTextboxId){e.preventDefault(); els.deleteTextboxBtn.click();}}});

els.canvas.addEventListener('dblclick',evt=>{const p=toCanvasPoint(evt); snapshot(); const tb=createTextbox({x:p.x,y:p.y,w:Math.min(420,doc.width-p.x-20),h:220}); doc.textboxes.push(tb); clearSelection(); selectedTextboxId=tb.id; draw(); syncUI();});
els.canvas.addEventListener('pointerdown',evt=>{
  const p=toCanvasPoint(evt); els.canvas.setPointerCapture(evt.pointerId);
  if (interaction.mode === 'createTextbox') { interaction.start=p; interaction.previewRect={x:p.x,y:p.y,w:1,h:1}; draw(); return; }
  const glyphHit = hitGlyph(p);
  if (glyphHit) { clearSelection(); selectedTextboxId=glyphHit.textbox.id; selectedGlyphIds=new Set([glyphHit.glyph.id]); interaction={mode:'none'}; draw(); syncUI(); return; }
  const tb = selectedTextboxId ? activeTextbox() : null;
  if (tb) {
    const handle = hitHandle(tb,p);
    if (handle) { interaction={mode:handle.kind==='rotate'?'rotateTextbox':'resizeTextbox',handle,start:p,orig:{x:tb.x,y:tb.y,w:tb.width,h:tb.height},textboxId:tb.id, center:{x:tb.x+tb.width/2,y:tb.y+tb.height/2}, startAngle:Math.atan2(p.y-(tb.y+tb.height/2),p.x-(tb.x+tb.width/2)), glyphSnapshot:tb.glyphs.map(g=>({...g}))}; return; }
  }
  const boxHit = hitTextbox(p);
  if (boxHit) { clearSelection(); selectedTextboxId=boxHit.id; interaction={mode:'moveTextbox',start:p,orig:{x:boxHit.x,y:boxHit.y},textboxId:boxHit.id,glyphSnapshot:boxHit.glyphs.map(g=>({id:g.id,x:g.x,y:g.y}))}; draw(); syncUI(); return; }
  clearSelection(); interaction={mode:'none'}; draw(); syncUI();
});
els.canvas.addEventListener('pointermove',evt=>{
  const p=toCanvasPoint(evt);
  if (interaction.mode === 'createTextbox' && interaction.start) { interaction.previewRect=rectNorm(interaction.start,p); draw(); return; }
  if (interaction.mode === 'moveTextbox') { const tb=doc.textboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const dx=p.x-interaction.start.x,dy=p.y-interaction.start.y; tb.x=interaction.orig.x+dx; tb.y=interaction.orig.y+dy; for(const s of interaction.glyphSnapshot){const g=tb.glyphs.find(x=>x.id===s.id); if(g){g.x=s.x+dx; g.y=s.y+dy}} draw(); syncUI(); return; }
  if (interaction.mode === 'resizeTextbox') { const tb=doc.textboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const r={...interaction.orig}; if(interaction.handle.includes('n')){r.y=Math.min(interaction.orig.y+interaction.orig.h-40,p.y); r.h=interaction.orig.y+interaction.orig.h-r.y} if(interaction.handle.includes('s')){r.h=Math.max(40,p.y-interaction.orig.y)} if(interaction.handle.includes('w')){r.x=Math.min(interaction.orig.x+interaction.orig.w-60,p.x); r.w=interaction.orig.x+interaction.orig.w-r.x} if(interaction.handle.includes('e')){r.w=Math.max(60,p.x-interaction.orig.x)} tb.x=r.x; tb.y=r.y; tb.width=r.w; tb.height=r.h; layoutTextbox(tb); draw(); syncUI(); return; }
  if (interaction.mode === 'rotateTextbox') { const tb=doc.textboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const angle=Math.atan2(p.y-interaction.center.y,p.x-interaction.center.x)-interaction.startAngle; tb.glyphs.forEach((g,i)=>{const old=interaction.glyphSnapshot[i]; const q=rotatePoint(old.x,old.y,interaction.center.x,interaction.center.y,angle); g.x=q.x; g.y=q.y; g.rotation=old.rotation+angle*180/Math.PI}); draw(); syncUI(); return; }
});
els.canvas.addEventListener('pointerup',evt=>{
  const p=toCanvasPoint(evt);
  if (interaction.mode === 'createTextbox' && interaction.start) { const rect=rectNorm(interaction.start,p); interaction={mode:null}; if(rect.w>20&&rect.h>20){ snapshot(); const tb=createTextbox(rect); doc.textboxes.push(tb); clearSelection(); selectedTextboxId=tb.id; } draw(); syncUI(); return; }
  if (['moveTextbox','resizeTextbox','rotateTextbox'].includes(interaction.mode)) { snapshot(); interaction={mode:null}; draw(); syncUI(); return; }
  interaction={mode:null};
});

setCanvasSize(doc.width, doc.height);
updateZoom(doc.zoom);
applySizePreset('a4p');
els.canvasWidthInput.value=doc.width;
els.canvasHeightInput.value=doc.height;
els.fontSizeVal.textContent=els.fontSize.value+'px';
els.strengthVal.textContent=(+els.strength.value*100).toFixed(1)+'%';
els.diversityVal.textContent=Math.round(+els.diversity.value*100)+'%';
els.bgScaleText.textContent='100%';
els.bgOpacityText.textContent='100%';
syncUI();
draw();
loadPreset('yunyan');
