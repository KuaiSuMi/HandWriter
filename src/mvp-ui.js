'use strict';
(function(){
  const Core = window.HandWriterCore;
  const DEFAULT_COLOR = Core.DEFAULT_COLOR;
  const SIZE_PRESETS = Core.SIZE_PRESETS;
  const FONT_BASE = Core.FONT_BASE;
  const HANDLE_VISUAL = 14;
  const HANDLE_HIT = 18;
  const ROTATE_OFFSET = 34;
  const els = {
    canvas: document.getElementById('canvas'), presetSelect: document.getElementById('presetSelect'), fontInput: document.getElementById('fontInput'), fontName: document.getElementById('fontName'),
    textInput: document.getElementById('textInput'), fontSize: document.getElementById('fontSize'), fontSizeVal: document.getElementById('fontSizeVal'), strength: document.getElementById('strength'), strengthVal: document.getElementById('strengthVal'), diversity: document.getElementById('diversity'), diversityVal: document.getElementById('diversityVal'),
    sizePreset: document.getElementById('sizePreset'), canvasWidthInput: document.getElementById('canvasWidthInput'), canvasHeightInput: document.getElementById('canvasHeightInput'), applyCanvasBtn: document.getElementById('applyCanvasBtn'),
    bgInput: document.getElementById('bgInput'), bgMode: document.getElementById('bgMode'), bgScale: document.getElementById('bgScale'), bgScaleText: document.getElementById('bgScaleText'), bgOpacity: document.getElementById('bgOpacity'), bgOpacityText: document.getElementById('bgOpacityText'), clearBgBtn: document.getElementById('clearBgBtn'),
    zoomInput: document.getElementById('zoomInput'), zoomText: document.getElementById('zoomText'), newTextboxBtn: document.getElementById('newTextboxBtn'), clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    selectedCount: document.getElementById('selectedCount'), selectionInfo: document.getElementById('selectionInfo'),
    textboxState: document.getElementById('textboxState'), overflowInfo: document.getElementById('overflowInfo'), textboxInfo: document.getElementById('textboxInfo'),
    boxFontSize: document.getElementById('boxFontSize'), boxFontSizeText: document.getElementById('boxFontSizeText'), boxPadding: document.getElementById('boxPadding'), boxPaddingText: document.getElementById('boxPaddingText'), boxCharGap: document.getElementById('boxCharGap'), boxCharGapText: document.getElementById('boxCharGapText'), boxLineGap: document.getElementById('boxLineGap'), boxLineGapText: document.getElementById('boxLineGapText'), boxOffsetX: document.getElementById('boxOffsetX'), boxOffsetXText: document.getElementById('boxOffsetXText'), boxOffsetY: document.getElementById('boxOffsetY'), boxOffsetYText: document.getElementById('boxOffsetYText'), regenerateBoxBtn: document.getElementById('regenerateBoxBtn'), confirmTextboxBtn: document.getElementById('confirmTextboxBtn'), deleteTextboxBtn: document.getElementById('deleteTextboxBtn'),
    colorInput: document.getElementById('colorInput'), colorText: document.getElementById('colorText'), thicknessInput: document.getElementById('thicknessInput'), thicknessText: document.getElementById('thicknessText'), sizeInput: document.getElementById('sizeInput'), sizeText: document.getElementById('sizeText'), applyStyleBtn: document.getElementById('applyStyleBtn'), styleScope: document.getElementById('styleScope'), styleHint: document.getElementById('styleHint'),
    candidateArea: document.getElementById('candidateArea'), rerollBtn: document.getElementById('rerollBtn'),
    undoBtn: document.getElementById('undoBtn'), redoBtn: document.getElementById('redoBtn'), deleteBtn: document.getElementById('deleteBtn'), exportBtn: document.getElementById('exportBtn')
  };
  const ctx = els.canvas.getContext('2d');
  let font = null;
  let doc = createDocument(1240,1754);
  let selectedGlyphIds = new Set();
  let selectedTextboxId = null;
  let interaction = { mode: null };
  let past = [];
  let future = [];
  let candidateNonce = 0;
  let candidateState = { glyphId: null, nonce: -1, list: [] };

  function createDocument(width,height){return{width,height,zoom:0.35,background:{image:null,mode:'contain',opacity:1,scale:1,fileName:''},glyphs:[],draftTextboxes:[]}}
  function cloneDoc(source){const plain=JSON.parse(JSON.stringify(source)); if(source.background.image) plain.background.image=source.background.image; return plain}
  function snapshot(){past.push(cloneDoc(doc)); if(past.length>80)past.shift(); future=[]}
  function restoreHistory(target){doc=target; selectedGlyphIds=new Set(); selectedTextboxId=null; candidateState={glyphId:null,nonce:-1,list:[]}; interaction={mode:null}; draw(); syncUI()}
  function undo(){if(!past.length)return; future.unshift(cloneDoc(doc)); restoreHistory(past.pop())}
  function redo(){if(!future.length)return; past.push(cloneDoc(doc)); restoreHistory(future.shift())}
  function clearSelection(){selectedGlyphIds=new Set(); selectedTextboxId=null; candidateState={glyphId:null,nonce:-1,list:[]}}
  function activeTextbox(){return doc.draftTextboxes.find(t=>t.id===selectedTextboxId)||null}
  function selectedGlyphs(){return doc.glyphs.filter(g=>selectedGlyphIds.has(g.id))}
  function nextId(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6)}

  function setCanvasSize(width,height){doc.width=Math.max(300,Math.round(width)); doc.height=Math.max(300,Math.round(height)); els.canvas.width=doc.width; els.canvas.height=doc.height; els.canvas.style.width=Math.round(doc.width*doc.zoom)+'px'; els.canvas.style.height=Math.round(doc.height*doc.zoom)+'px'}
  function updateZoom(value){doc.zoom=Math.max(0.1,Math.min(1,+value||0.35)); els.zoomInput.value=String(doc.zoom); els.zoomText.textContent=Math.round(doc.zoom*100)+'%'; els.canvas.style.width=Math.round(doc.width*doc.zoom)+'px'; els.canvas.style.height=Math.round(doc.height*doc.zoom)+'px'}
  function applySizePreset(name){const p=SIZE_PRESETS[name]; if(!p)return; els.canvasWidthInput.value=p.width; els.canvasHeightInput.value=p.height}
  function commitCanvasSize(width,height){snapshot(); setCanvasSize(width,height); draw(); syncUI()}
  function toCanvasPoint(evt){const r=els.canvas.getBoundingClientRect(); return {x:(evt.clientX-r.left)/doc.zoom,y:(evt.clientY-r.top)/doc.zoom}}

  function textboxInnerRect(tb){return{x:tb.x+tb.padding+tb.offsetX,y:tb.y+tb.padding+tb.offsetY,w:Math.max(10,tb.width-tb.padding*2),h:Math.max(10,tb.height-tb.padding*2)}}
  function layoutTextbox(tb){
    if(!font)return tb;
    const inner=textboxInnerRect(tb), text=tb.text, size=tb.fontSize, strength=tb.warpStrength, diversity=tb.diversity;
    const rng=Core.mulberry32(Core.hashString(text+':'+size+':'+strength+':'+diversity+':'+tb.id));
    const units=font.unitsPerEm||1000, ascent=(font.ascender||units*0.8)/units*size, lineHeight=size*tb.lineGap;
    const left=inner.x, top=inner.y; const repeatCount=new Map(); let x=left, lineIndex=0, baseline=top+ascent, idx=0; const result=[]; let overflowCount=0;
    for(const ch of Array.from(text)){
      if(ch==='\n'){x=left; lineIndex++; baseline=top+lineIndex*lineHeight+ascent; continue}
      const glyph=font.charToGlyph(ch); const adv=((glyph.advanceWidth||units)/units)*size+tb.charGap;
      if(x+adv>left+inner.w && x>left){x=left; lineIndex++; baseline=top+lineIndex*lineHeight+ascent}
      if(baseline+size*0.35>top+inner.h){overflowCount++; continue}
      const occ=repeatCount.get(ch)||0; repeatCount.set(ch,occ+1); const instanceBias=Math.min(1.15, diversity*(0.22+occ*0.28));
      const baseSeed=Math.floor(rng()*0xffffffff)>>>0; const seed=Core.mixSeed(baseSeed,Core.hashString(ch),occ+idx*17);
      const geo=Core.geometry(font,ch,size,seed,strength,instanceBias); const y=baseline+(geo.height/2-geo.baselineYLocal);
      const xJitter=(rng()-0.5)*size*0.02; const rotation=(rng()-0.5)*(1.5+diversity*1.2+occ*0.25); const scaleX=1+(rng()-0.5)*0.012*(1+instanceBias*0.7); const scaleY=1+(rng()-0.5)*0.012*(1+instanceBias*0.7); const strokeWidth=Math.max(0,0.22+occ*0.03+(rng()-0.5)*0.10);
      result.push({id:nextId('dg'),char:ch,x:x+geo.width/2+xJitter,y,rotation,scaleX,scaleY,fontSize:size,variantSeed:seed,warpStrength:strength,instanceBias,fill:DEFAULT_COLOR,strokeWidth,geo,geoSeed:seed,geoStrength:strength,geoBias:instanceBias,geoSize:size});
      x+=adv; idx++;
    }
    tb.previewGlyphs=Core.normalizeGlyphTop(font,result,tb.y+tb.padding+tb.offsetY); tb.overflowCount=overflowCount; return tb;
  }
  function createDraftTextbox(rect){const tb={id:nextId('tb'),x:rect.x,y:rect.y,width:Math.max(120,rect.w),height:Math.max(80,rect.h),text:els.textInput.value,fontSize:+els.fontSize.value,warpStrength:+els.strength.value,diversity:+els.diversity.value,padding:16,charGap:0,lineGap:1.55,offsetX:0,offsetY:0,previewGlyphs:[],overflowCount:0}; return layoutTextbox(tb)}
  function applyTextboxControls(){const tb=activeTextbox(); if(!tb) return; tb.text=els.textInput.value; tb.fontSize=+els.boxFontSize.value; tb.padding=+els.boxPadding.value; tb.charGap=+els.boxCharGap.value; tb.lineGap=+els.boxLineGap.value; tb.offsetX=+els.boxOffsetX.value; tb.offsetY=+els.boxOffsetY.value; tb.warpStrength=+els.strength.value; tb.diversity=+els.diversity.value; layoutTextbox(tb); draw(); syncUI()}
  function confirmTextbox(){const tb=activeTextbox(); if(!tb) return; snapshot(); const committed=tb.previewGlyphs.map(g=>({...g,id:nextId('g')})); doc.glyphs.push(...committed); doc.draftTextboxes=doc.draftTextboxes.filter(x=>x.id!==tb.id); selectedTextboxId=null; selectedGlyphIds=new Set(committed.map(g=>g.id)); draw(); syncUI()}

  function drawBackground(){ctx.fillStyle='#fff'; ctx.fillRect(0,0,doc.width,doc.height); const bg=doc.background; if(!bg.image)return; ctx.save(); ctx.globalAlpha=bg.opacity; if(bg.mode==='stretch'){ctx.drawImage(bg.image,0,0,doc.width,doc.height)} else {const iw=bg.image.width, ih=bg.image.height; const scale=bg.mode==='cover'?Math.max(doc.width/iw,doc.height/ih):Math.min(doc.width/iw,doc.height/ih); const finalScale=scale*bg.scale; const dw=iw*finalScale, dh=ih*finalScale; const dx=(doc.width-dw)/2, dy=(doc.height-dh)/2; ctx.drawImage(bg.image,dx,dy,dw,dh)} ctx.restore()}
  function drawGlyph(g,selected){Core.ensureGeo(font,g); ctx.save(); ctx.translate(g.x,g.y); ctx.rotate(g.rotation*Math.PI/180); ctx.scale(g.scaleX,g.scaleY); ctx.translate(-g.geo.width/2,-g.geo.height/2); ctx.fillStyle=g.fill||DEFAULT_COLOR; ctx.fill(g.geo.path); if((g.strokeWidth||0)>0.001){ctx.strokeStyle=g.fill||DEFAULT_COLOR; ctx.lineWidth=g.strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(g.geo.path)} if(selected){ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=1; ctx.setLineDash([4,3]); ctx.strokeRect(0,0,g.geo.width,g.geo.height)} ctx.restore()}
  function draftTextboxHandles(tb){return[{kind:'nw',x:tb.x,y:tb.y},{kind:'ne',x:tb.x+tb.width,y:tb.y},{kind:'sw',x:tb.x,y:tb.y+tb.height},{kind:'se',x:tb.x+tb.width,y:tb.y+tb.height},{kind:'rotate',x:tb.x+tb.width/2,y:tb.y-ROTATE_OFFSET}]}
  function drawHandles(handles,box){ctx.save(); ctx.fillStyle='#fff'; ctx.strokeStyle='#111'; ctx.lineWidth=1.2; for(const h of handles){ if(h.kind==='rotate'){ctx.beginPath(); ctx.moveTo(box.cx, box.y); ctx.lineTo(h.x, h.y + HANDLE_VISUAL/2); ctx.stroke(); ctx.beginPath(); ctx.arc(h.x,h.y,HANDLE_VISUAL/2,0,Math.PI*2); ctx.fill(); ctx.stroke()} else {ctx.fillRect(h.x-HANDLE_VISUAL/2,h.y-HANDLE_VISUAL/2,HANDLE_VISUAL,HANDLE_VISUAL); ctx.strokeRect(h.x-HANDLE_VISUAL/2,h.y-HANDLE_VISUAL/2,HANDLE_VISUAL,HANDLE_VISUAL)} } ctx.restore()}
  function drawDraftTextbox(tb){ctx.save(); ctx.strokeStyle=tb.id===selectedTextboxId?'rgba(34,34,34,.8)':'rgba(0,0,0,.22)'; ctx.setLineDash(tb.id===selectedTextboxId?[8,4]:[5,4]); ctx.lineWidth=1.2; ctx.strokeRect(tb.x,tb.y,tb.width,tb.height); ctx.restore(); for(const g of tb.previewGlyphs) drawGlyph(g,false); if(tb.id===selectedTextboxId) drawHandles(draftTextboxHandles(tb), {cx:tb.x+tb.width/2,y:tb.y})}
  function drawGroupSelection(){const arr=selectedGlyphs(); if(!arr.length) return; const box=Core.groupSelectionBox(font,arr); ctx.save(); ctx.setLineDash([6,4]); ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=1.2; ctx.strokeRect(box.x,box.y,box.w,box.h); ctx.restore(); drawHandles([{kind:'rotate',x:box.cx,y:box.y-ROTATE_OFFSET}], box)}
  function drawRectOverlay(rect,fill,stroke){ctx.save(); ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.setLineDash([6,4]); ctx.fillRect(rect.x,rect.y,rect.w,rect.h); ctx.strokeRect(rect.x,rect.y,rect.w,rect.h); ctx.restore()}
  function draw(){drawBackground(); if(font){for(const g of doc.glyphs) drawGlyph(g,selectedGlyphIds.has(g.id)); if(selectedGlyphIds.size) drawGroupSelection(); for(const tb of doc.draftTextboxes) drawDraftTextbox(tb)} if(interaction.mode==='marqueeSelect'&&interaction.selectionRect) drawRectOverlay(interaction.selectionRect,'rgba(0,0,0,.05)','rgba(0,0,0,.45)'); if(interaction.mode==='createTextbox'&&interaction.previewRect) drawRectOverlay(interaction.previewRect,'rgba(0,0,0,.03)','rgba(0,0,0,.55)')}

  function hitDraftTextboxHandle(tb,p){for(const h of draftTextboxHandles(tb)){if(Math.hypot(p.x-h.x,p.y-h.y)<=HANDLE_HIT) return h}return null}
  function hitSelectedGlyphGroupHandle(p){const arr=selectedGlyphs(); if(!arr.length) return null; const box=Core.groupSelectionBox(font,arr); const h={kind:'rotate',x:box.cx,y:box.y-ROTATE_OFFSET}; return Math.hypot(p.x-h.x,p.y-h.y)<=HANDLE_HIT ? {handle:h,box} : null}
  function hitGlyph(p){for(let i=doc.glyphs.length-1;i>=0;i--){const g=doc.glyphs[i]; Core.ensureGeo(font,g); const local={x:p.x-(g.x-g.geo.width/2),y:p.y-(g.y-g.geo.height/2)}; if(ctx.isPointInPath(g.geo.path,local.x,local.y)||((g.strokeWidth||0)>0.01&&ctx.isPointInStroke(g.geo.path,local.x,local.y))) return g} return null}
  function hitDraftTextbox(p){for(let i=doc.draftTextboxes.length-1;i>=0;i--){const tb=doc.draftTextboxes[i]; if(Core.pointInRect(p,{x:tb.x,y:tb.y,w:tb.width,h:tb.height})) return tb} return null}
  function hitGlyphGroupBody(p){const arr=selectedGlyphs(); if(!arr.length) return false; const box=Core.groupSelectionBox(font,arr); return Core.pointInRect(p,box)}

  function syncTextboxPanel(){const tb=activeTextbox(); const disabled=!tb; ['boxFontSize','boxPadding','boxCharGap','boxLineGap','boxOffsetX','boxOffsetY','regenerateBoxBtn','confirmTextboxBtn','deleteTextboxBtn'].forEach(id=>els[id].disabled=disabled); if(!tb){els.textboxState.textContent='未选择'; els.overflowInfo.textContent='未选择文本框'; els.textboxInfo.textContent='角点可拖拽，旋转手柄已放大'; return} els.textboxState.textContent='排版中'; els.boxFontSize.value=String(Math.round(tb.fontSize)); els.boxFontSizeText.textContent=Math.round(tb.fontSize)+'px'; els.boxPadding.value=String(Math.round(tb.padding)); els.boxPaddingText.textContent=Math.round(tb.padding)+'px'; els.boxCharGap.value=String(Math.round(tb.charGap)); els.boxCharGapText.textContent=Math.round(tb.charGap)+'px'; els.boxLineGap.value=String(tb.lineGap); els.boxLineGapText.textContent=tb.lineGap.toFixed(2)+'×'; els.boxOffsetX.value=String(Math.round(tb.offsetX)); els.boxOffsetXText.textContent=Math.round(tb.offsetX)+'px'; els.boxOffsetY.value=String(Math.round(tb.offsetY)); els.boxOffsetYText.textContent=Math.round(tb.offsetY)+'px'; els.overflowInfo.textContent=tb.overflowCount?`有 ${tb.overflowCount} 个字符未放入文本框`:'文本框内文字已全部放下'; els.textboxInfo.textContent=`${Math.round(tb.width)}×${Math.round(tb.height)} px`}
  function syncGlyphPanel(){const arr=selectedGlyphs(); const disabled=!arr.length; els.colorInput.disabled=disabled; els.thicknessInput.disabled=disabled; els.sizeInput.disabled=disabled; els.applyStyleBtn.disabled=disabled; if(!arr.length){els.styleScope.textContent='未选择'; els.styleHint.textContent='先选择字符'; els.colorInput.value=DEFAULT_COLOR; els.colorText.textContent=DEFAULT_COLOR; els.thicknessInput.value='0.30'; els.thicknessText.textContent='0.30px'; els.sizeInput.value=els.fontSize.value; els.sizeText.textContent=els.fontSize.value+'px'; return} const first=arr[0]; els.styleScope.textContent=arr.length===1?'单字编辑':'临时编组批量编辑'; els.styleHint.textContent=arr.length===1?'当前修改仅作用于该字':'当前修改会作用于所有已选字'; els.colorInput.value=first.fill||DEFAULT_COLOR; els.colorText.textContent=els.colorInput.value; els.thicknessInput.value=(first.strokeWidth||0).toFixed(2); els.thicknessText.textContent=Number(els.thicknessInput.value).toFixed(2)+'px'; els.sizeInput.value=String(Math.round(first.fontSize)); els.sizeText.textContent=Math.round(first.fontSize)+'px'}
  function updateCandidates(){els.candidateArea.innerHTML=''; const arr=selectedGlyphs(); if(arr.length!==1){els.rerollBtn.hidden=true; els.candidateArea.className='muted'; els.candidateArea.textContent=arr.length>1?'多选状态下不显示单字候选。':'单击单个字符后显示 6 个候选。'; if(!arr.length) candidateState={glyphId:null,nonce:-1,list:[]}; return} const g=arr[0]; if(candidateState.glyphId!==g.id||candidateState.nonce!==candidateNonce||!candidateState.list.length){candidateState={glyphId:g.id,nonce:candidateNonce,list:Core.candidates(font,g,candidateNonce)}} const cs=candidateState.list; els.rerollBtn.hidden=false; els.candidateArea.className='cands'; for(const c of cs){const btn=document.createElement('button'); btn.className='cand'; btn.title='seed '+c.seed; btn.style.color=g.fill||DEFAULT_COLOR; if(c.seed===g.variantSeed){btn.style.borderColor='#111'; btn.style.background='#fff'} btn.innerHTML=`<svg viewBox="0 0 ${Math.max(1,c.geo.width)} ${Math.max(1,c.geo.height)}"><path d="${c.geo.pathData}" fill="currentColor"></path></svg>`; btn.onclick=()=>{snapshot(); const target=doc.glyphs.find(x=>x.id===g.id); if(!target) return; target.variantSeed=c.seed; target.geo=c.geo; target.geoSeed=c.seed; target.geoStrength=target.warpStrength; target.geoBias=target.instanceBias; target.geoSize=target.fontSize; target.y=Core.preserveBaselineY(font,target,c.geo); candidateState={glyphId:g.id,nonce:candidateNonce,list:cs}; draw(); syncUI()}; els.candidateArea.appendChild(btn)}}
  function syncSelectionInfo(){const glyphs=selectedGlyphs(); els.selectedCount.textContent=glyphs.length+' 个字符'; if(selectedTextboxId){els.selectionInfo.innerHTML='<div class="selectedText">文本框排版中</div><p class="muted">当前在文本框内预览排版。可以拖动、缩放、旋转文本框；点“确认并解除编组”后，字符会变成独立对象。</p>'} else if(glyphs.length===1){els.selectionInfo.innerHTML=`<div class="selectedText">${glyphs[0].char}</div><p class="muted">当前为单字编辑模式。可改颜色、粗细、大小，并从候选面板选择不同字形。</p>`} else if(glyphs.length>1){els.selectionInfo.innerHTML=`<div class="selectedText">临时编组</div><p class="muted">已框选 ${glyphs.length} 个字符。可拖动整体移动，或使用上方旋转手柄整体旋转。</p>`} else {els.selectionInfo.textContent='单击字符可编辑单字；空白处拖拽可框选多个字形成临时编组；双击空白处可快速创建文本框。'}}
  function syncUI(){syncSelectionInfo(); syncTextboxPanel(); syncGlyphPanel(); updateCandidates(); els.undoBtn.disabled=!past.length; els.redoBtn.disabled=!future.length; els.deleteBtn.disabled=!selectedGlyphIds.size}

  function applyGlyphStyles(){const arr=selectedGlyphs(); if(!arr.length) return; snapshot(); const fill=els.colorInput.value, strokeWidth=Math.max(0,+els.thicknessInput.value||0), size=Math.max(16,+els.sizeInput.value||16); for(const g of arr){g.fill=fill; g.strokeWidth=strokeWidth; if(size!==g.fontSize){const newGeo=Core.geometry(font,g.char,size,g.variantSeed,g.warpStrength,g.instanceBias); const newY=Core.preserveBaselineY(font,g,newGeo); g.fontSize=size; g.geo=newGeo; g.geoSeed=g.variantSeed; g.geoStrength=g.warpStrength; g.geoBias=g.instanceBias; g.geoSize=size; g.y=newY}} draw(); syncUI()}
  async function loadPreset(id){const preset=window.HANDWRITER_FONT_PRESETS&&window.HANDWRITER_FONT_PRESETS[id]; if(!preset) return; els.fontName.textContent='正在加载：'+preset.name+'…'; const encoded=encodeURIComponent(preset.file); const sources=['./fonts/'+encoded, FONT_BASE+'/'+encoded]; for(const url of sources){ try{ const res=await fetch(url,{mode:'cors'}); if(!res.ok) throw new Error('HTTP '+res.status); font=opentype.parse(await res.arrayBuffer()); els.fontName.textContent='已加载：'+preset.name; draw(); syncUI(); return; }catch(err){} } els.fontName.textContent='预设字体加载失败，请使用本地字体'; }

  els.presetSelect.onchange=()=>loadPreset(els.presetSelect.value);
  els.fontInput.onchange=async e=>{const file=e.target.files&&e.target.files[0]; if(!file) return; try{font=opentype.parse(await file.arrayBuffer()); els.fontName.textContent='已加载：'+file.name; draw(); syncUI()}catch(err){alert('字体解析失败：'+err.message)}};
  els.fontSize.oninput=()=>els.fontSizeVal.textContent=els.fontSize.value+'px';
  els.strength.oninput=()=>els.strengthVal.textContent=(+els.strength.value*100).toFixed(1)+'%';
  els.diversity.oninput=()=>els.diversityVal.textContent=Math.round(+els.diversity.value*100)+'%';
  els.sizePreset.onchange=()=>applySizePreset(els.sizePreset.value);
  els.applyCanvasBtn.onclick=()=>commitCanvasSize(+els.canvasWidthInput.value,+els.canvasHeightInput.value);
  els.zoomInput.oninput=()=>{updateZoom(els.zoomInput.value); draw()};
  els.bgMode.onchange=()=>{doc.background.mode=els.bgMode.value; draw()};
  els.bgScale.oninput=()=>{doc.background.scale=+els.bgScale.value; els.bgScaleText.textContent=Math.round(doc.background.scale*100)+'%'; draw()};
  els.bgOpacity.oninput=()=>{doc.background.opacity=+els.bgOpacity.value; els.bgOpacityText.textContent=Math.round(doc.background.opacity*100)+'%'; draw()};
  els.bgInput.onchange=async e=>{const file=e.target.files&&e.target.files[0]; if(!file) return; const img=new Image(); img.onload=()=>{snapshot(); doc.background.image=img; doc.background.fileName=file.name; setCanvasSize(img.width,img.height); els.canvasWidthInput.value=img.width; els.canvasHeightInput.value=img.height; els.sizePreset.value='custom'; clearSelection(); draw(); syncUI()}; img.src=URL.createObjectURL(file)};
  els.clearBgBtn.onclick=()=>{snapshot(); doc.background.image=null; doc.background.fileName=''; draw(); syncUI()};
  els.newTextboxBtn.onclick=()=>{clearSelection(); interaction={mode:'createTextbox'}; draw(); syncUI()};
  els.clearSelectionBtn.onclick=()=>{clearSelection(); interaction={mode:null}; draw(); syncUI()};
  els.regenerateBoxBtn.onclick=()=>{const tb=activeTextbox(); if(!tb) return; snapshot(); applyTextboxControls()};
  els.confirmTextboxBtn.onclick=confirmTextbox;
  els.deleteTextboxBtn.onclick=()=>{const tb=activeTextbox(); if(!tb) return; snapshot(); doc.draftTextboxes=doc.draftTextboxes.filter(x=>x.id!==tb.id); clearSelection(); draw(); syncUI()};
  els.boxFontSize.oninput=()=>{els.boxFontSizeText.textContent=els.boxFontSize.value+'px'; if(activeTextbox()) applyTextboxControls()};
  els.boxPadding.oninput=()=>{els.boxPaddingText.textContent=els.boxPadding.value+'px'; if(activeTextbox()) applyTextboxControls()};
  els.boxCharGap.oninput=()=>{els.boxCharGapText.textContent=els.boxCharGap.value+'px'; if(activeTextbox()) applyTextboxControls()};
  els.boxLineGap.oninput=()=>{els.boxLineGapText.textContent=Number(els.boxLineGap.value).toFixed(2)+'×'; if(activeTextbox()) applyTextboxControls()};
  els.boxOffsetX.oninput=()=>{els.boxOffsetXText.textContent=els.boxOffsetX.value+'px'; if(activeTextbox()) applyTextboxControls()};
  els.boxOffsetY.oninput=()=>{els.boxOffsetYText.textContent=els.boxOffsetY.value+'px'; if(activeTextbox()) applyTextboxControls()};
  els.colorInput.oninput=()=>els.colorText.textContent=els.colorInput.value; els.thicknessInput.oninput=()=>els.thicknessText.textContent=Number(els.thicknessInput.value).toFixed(2)+'px'; els.sizeInput.oninput=()=>els.sizeText.textContent=els.sizeInput.value+'px';
  els.applyStyleBtn.onclick=applyGlyphStyles; els.rerollBtn.onclick=()=>{candidateNonce++; candidateState={glyphId:null,nonce:-1,list:[]}; updateCandidates()};
  els.undoBtn.onclick=undo; els.redoBtn.onclick=redo; els.deleteBtn.onclick=()=>{if(!selectedGlyphIds.size) return; snapshot(); doc.glyphs=doc.glyphs.filter(g=>!selectedGlyphIds.has(g.id)); selectedGlyphIds=new Set(); draw(); syncUI()};
  els.exportBtn.onclick=()=>{const out=document.createElement('canvas'); out.width=doc.width; out.height=doc.height; out.getContext('2d').drawImage(els.canvas,0,0); const a=document.createElement('a'); a.download='HandWriter.png'; a.href=out.toDataURL('image/png'); a.click()};
  window.addEventListener('keydown',e=>{const tag=(e.target.tagName||'').toLowerCase(); if(tag==='input'||tag==='textarea'||tag==='select') return; const key=e.key.toLowerCase(); if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault(); e.shiftKey?redo():undo()} else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault(); redo()} else if(e.key==='Delete'||e.key==='Backspace'){if(selectedGlyphIds.size){e.preventDefault(); els.deleteBtn.click()} else if(selectedTextboxId){e.preventDefault(); els.deleteTextboxBtn.click()}}});

  els.canvas.addEventListener('dblclick',evt=>{if(!font)return; const p=toCanvasPoint(evt); snapshot(); const tb=createDraftTextbox({x:p.x,y:p.y,w:Math.min(420,Math.max(120,doc.width-p.x-20)),h:220}); doc.draftTextboxes.push(tb); clearSelection(); selectedTextboxId=tb.id; draw(); syncUI()});
  els.canvas.addEventListener('pointerdown',evt=>{
    if(!font) return;
    const p=toCanvasPoint(evt); els.canvas.setPointerCapture(evt.pointerId);
    if(interaction.mode==='createTextbox'){interaction.start=p; interaction.previewRect={x:p.x,y:p.y,w:1,h:1}; draw(); return}
    const tbSelected=activeTextbox();
    if(tbSelected){ const handle=hitDraftTextboxHandle(tbSelected,p); if(handle){snapshot(); interaction={mode:handle.kind==='rotate'?'rotateTextbox':'resizeTextbox',handle,start:p,textboxId:tbSelected.id,orig:{x:tbSelected.x,y:tbSelected.y,w:tbSelected.width,h:tbSelected.height},center:{x:tbSelected.x+tbSelected.width/2,y:tbSelected.y+tbSelected.height/2},startAngle:Math.atan2(p.y-(tbSelected.y+tbSelected.height/2),p.x-(tbSelected.x+tbSelected.width/2)),glyphSnapshot:tbSelected.previewGlyphs.map(g=>({...g}))}; return} if(Core.pointInRect(p,{x:tbSelected.x,y:tbSelected.y,w:tbSelected.width,h:tbSelected.height})){snapshot(); interaction={mode:'moveTextbox',start:p,textboxId:tbSelected.id,orig:{x:tbSelected.x,y:tbSelected.y},glyphSnapshot:tbSelected.previewGlyphs.map(g=>({id:g.id,x:g.x,y:g.y}))}; draw(); return} }
    const groupHandle=hitSelectedGlyphGroupHandle(p); if(groupHandle){snapshot(); interaction={mode:'rotateGlyphGroup',start:p,center:{x:groupHandle.box.cx,y:groupHandle.box.cy},startAngle:Math.atan2(p.y-groupHandle.box.cy,p.x-groupHandle.box.cx),glyphSnapshot:selectedGlyphs().map(g=>({...g}))}; return}
    if(hitGlyphGroupBody(p)&&selectedGlyphIds.size){snapshot(); interaction={mode:'moveGlyphGroup',start:p,glyphSnapshot:selectedGlyphs().map(g=>({id:g.id,x:g.x,y:g.y}))}; return}
    const glyph=hitGlyph(p); if(glyph){ selectedTextboxId=null; if(evt.shiftKey||evt.ctrlKey||evt.metaKey){ const next=new Set(selectedGlyphIds); if(next.has(glyph.id)) next.delete(glyph.id); else next.add(glyph.id); selectedGlyphIds=next; } else { selectedGlyphIds=new Set([glyph.id]); } draw(); syncUI(); return }
    const tb=hitDraftTextbox(p); if(tb){ clearSelection(); selectedTextboxId=tb.id; draw(); syncUI(); return }
    clearSelection(); interaction={mode:'marqueeSelect',start:p,selectionRect:{x:p.x,y:p.y,w:1,h:1}}; draw(); syncUI();
  });
  els.canvas.addEventListener('pointermove',evt=>{
    const p=toCanvasPoint(evt);
    if(interaction.mode==='createTextbox'&&interaction.start){interaction.previewRect=Core.rectNorm(interaction.start,p); draw(); return}
    if(interaction.mode==='marqueeSelect'&&interaction.start){interaction.selectionRect=Core.rectNorm(interaction.start,p); draw(); return}
    if(interaction.mode==='moveTextbox'){const tb=doc.draftTextboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const dx=p.x-interaction.start.x,dy=p.y-interaction.start.y; tb.x=interaction.orig.x+dx; tb.y=interaction.orig.y+dy; for(const s of interaction.glyphSnapshot){const g=tb.previewGlyphs.find(x=>x.id===s.id); if(g){g.x=s.x+dx; g.y=s.y+dy}} draw(); syncUI(); return}
    if(interaction.mode==='resizeTextbox'){const tb=doc.draftTextboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const r={...interaction.orig}; if(interaction.handle.kind.includes('n')){r.y=Math.min(interaction.orig.y+interaction.orig.h-40,p.y); r.h=interaction.orig.y+interaction.orig.h-r.y} if(interaction.handle.kind.includes('s')){r.h=Math.max(40,p.y-interaction.orig.y)} if(interaction.handle.kind.includes('w')){r.x=Math.min(interaction.orig.x+interaction.orig.w-60,p.x); r.w=interaction.orig.x+interaction.orig.w-r.x} if(interaction.handle.kind.includes('e')){r.w=Math.max(60,p.x-interaction.orig.x)} tb.x=r.x; tb.y=r.y; tb.width=r.w; tb.height=r.h; layoutTextbox(tb); draw(); syncUI(); return}
    if(interaction.mode==='rotateTextbox'){const tb=doc.draftTextboxes.find(t=>t.id===interaction.textboxId); if(!tb) return; const angle=Math.atan2(p.y-interaction.center.y,p.x-interaction.center.x)-interaction.startAngle; tb.previewGlyphs.forEach((g,i)=>{const old=interaction.glyphSnapshot[i]; const q=Core.rotatePoint(old.x,old.y,interaction.center.x,interaction.center.y,angle); g.x=q.x; g.y=q.y; g.rotation=old.rotation+angle*180/Math.PI}); draw(); syncUI(); return}
    if(interaction.mode==='moveGlyphGroup'){const dx=p.x-interaction.start.x,dy=p.y-interaction.start.y; for(const s of interaction.glyphSnapshot){const g=doc.glyphs.find(x=>x.id===s.id); if(g){g.x=s.x+dx; g.y=s.y+dy}} draw(); syncUI(); return}
    if(interaction.mode==='rotateGlyphGroup'){const angle=Math.atan2(p.y-interaction.center.y,p.x-interaction.center.x)-interaction.startAngle; for(const old of interaction.glyphSnapshot){const g=doc.glyphs.find(x=>x.id===old.id); if(g){const q=Core.rotatePoint(old.x,old.y,interaction.center.x,interaction.center.y,angle); g.x=q.x; g.y=q.y; g.rotation=old.rotation+angle*180/Math.PI}} draw(); syncUI(); return}
  });
  els.canvas.addEventListener('pointerup',evt=>{
    const p=toCanvasPoint(evt);
    if(interaction.mode==='createTextbox'&&interaction.start){const rect=Core.rectNorm(interaction.start,p); interaction={mode:null}; if(rect.w>20&&rect.h>20){snapshot(); const tb=createDraftTextbox(rect); doc.draftTextboxes.push(tb); clearSelection(); selectedTextboxId=tb.id} draw(); syncUI(); return}
    if(interaction.mode==='marqueeSelect'&&interaction.start){const rect=Core.rectNorm(interaction.start,p); selectedGlyphIds=new Set(doc.glyphs.filter(g=>Core.rectsIntersect(Core.glyphBox(font,g),rect)).map(g=>g.id)); selectedTextboxId=null; interaction={mode:null}; draw(); syncUI(); return}
    if(['moveTextbox','resizeTextbox','rotateTextbox','moveGlyphGroup','rotateGlyphGroup'].includes(interaction.mode)){interaction={mode:null}; draw(); syncUI(); return}
    interaction={mode:null}
  });

  setCanvasSize(doc.width,doc.height); updateZoom(doc.zoom); applySizePreset('a4p'); els.canvasWidthInput.value=doc.width; els.canvasHeightInput.value=doc.height; els.fontSizeVal.textContent=els.fontSize.value+'px'; els.strengthVal.textContent=(+els.strength.value*100).toFixed(1)+'%'; els.diversityVal.textContent=Math.round(+els.diversity.value*100)+'%'; els.bgScaleText.textContent='100%'; els.bgOpacityText.textContent='100%'; syncUI(); draw(); loadPreset('yunyan');
})();
