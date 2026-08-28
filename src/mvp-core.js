'use strict';
const GRID = 4;
const DEFAULT_COLOR = '#161616';
const PRESET_FONTS = window.HANDWRITER_FONT_PRESETS || {};
const FONT_BASE = window.HANDWRITER_FONT_REMOTE_BASE || '';
const SIZE_PRESETS = {
  custom: null,
  a4p: { width: 2480, height: 3508 },
  a4l: { width: 3508, height: 2480 },
  letter: { width: 2550, height: 3300 },
  square: { width: 2048, height: 2048 },
  hd: { width: 1920, height: 1080 }
};
const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 28;

const els = {
  canvas: document.getElementById('canvas'),
  presetSelect: document.getElementById('presetSelect'), fontInput: document.getElementById('fontInput'), fontName: document.getElementById('fontName'),
  text: document.getElementById('textInput'), fontSize: document.getElementById('fontSize'), fontSizeVal: document.getElementById('fontSizeVal'),
  strength: document.getElementById('strength'), strengthVal: document.getElementById('strengthVal'), diversity: document.getElementById('diversity'), diversityVal: document.getElementById('diversityVal'),
  sizePreset: document.getElementById('sizePreset'), canvasWidthInput: document.getElementById('canvasWidthInput'), canvasHeightInput: document.getElementById('canvasHeightInput'), applyCanvasBtn: document.getElementById('applyCanvasBtn'),
  bgInput: document.getElementById('bgInput'), bgMode: document.getElementById('bgMode'), bgScale: document.getElementById('bgScale'), bgScaleText: document.getElementById('bgScaleText'), bgOpacity: document.getElementById('bgOpacity'), bgOpacityText: document.getElementById('bgOpacityText'), clearBgBtn: document.getElementById('clearBgBtn'),
  zoomInput: document.getElementById('zoomInput'), zoomText: document.getElementById('zoomText'), newTextboxBtn: document.getElementById('newTextboxBtn'),
  selectedCount: document.getElementById('selectedCount'), selectionInfo: document.getElementById('selectionInfo'), textboxState: document.getElementById('textboxState'), overflowInfo: document.getElementById('overflowInfo'), textboxInfo: document.getElementById('textboxInfo'),
  boxFontSize: document.getElementById('boxFontSize'), boxFontSizeText: document.getElementById('boxFontSizeText'), boxPadding: document.getElementById('boxPadding'), boxPaddingText: document.getElementById('boxPaddingText'), boxCharGap: document.getElementById('boxCharGap'), boxCharGapText: document.getElementById('boxCharGapText'), boxLineGap: document.getElementById('boxLineGap'), boxLineGapText: document.getElementById('boxLineGapText'), boxOffsetX: document.getElementById('boxOffsetX'), boxOffsetXText: document.getElementById('boxOffsetXText'), boxOffsetY: document.getElementById('boxOffsetY'), boxOffsetYText: document.getElementById('boxOffsetYText'), regenerateBoxBtn: document.getElementById('regenerateBoxBtn'), deleteTextboxBtn: document.getElementById('deleteTextboxBtn'),
  colorInput: document.getElementById('colorInput'), colorText: document.getElementById('colorText'), thicknessInput: document.getElementById('thicknessInput'), thicknessText: document.getElementById('thicknessText'), sizeInput: document.getElementById('sizeInput'), sizeText: document.getElementById('sizeText'), applyStyleBtn: document.getElementById('applyStyleBtn'), styleScope: document.getElementById('styleScope'), styleHint: document.getElementById('styleHint'),
  candidateArea: document.getElementById('candidateArea'), rerollBtn: document.getElementById('rerollBtn'),
  undoBtn: document.getElementById('undoBtn'), redoBtn: document.getElementById('redoBtn'), deleteBtn: document.getElementById('deleteBtn'), exportBtn: document.getElementById('exportBtn')
};
const ctx = els.canvas.getContext('2d');

let font = null;
let doc = createDocument(1240, 1754);
let selectedGlyphIds = new Set();
let selectedTextboxId = null;
let past = [];
let future = [];
let candidateNonce = 0;
let candidateState = { glyphId: null, nonce: -1, list: [] };
let interaction = { mode: null };

function createDocument(width, height) {
  return {
    width, height, zoom: 0.35,
    background: { image: null, mode: 'contain', opacity: 1, scale: 1, fileName: '' },
    textboxes: []
  };
}
function cloneDoc(source) {
  const plain = JSON.parse(JSON.stringify(source));
  if (source.background.image) plain.background.image = source.background.image;
  return plain;
}
function snapshot() {
  past.push(cloneDoc(doc));
  if (past.length > 80) past.shift();
  future = [];
}
function undo() {
  if (!past.length) return;
  future.unshift(cloneDoc(doc));
  doc = past.pop();
  clearSelection();
  draw();
  syncUI();
}
function redo() {
  if (!future.length) return;
  past.push(cloneDoc(doc));
  doc = future.shift();
  clearSelection();
  draw();
  syncUI();
}
function clearSelection() {
  selectedGlyphIds = new Set();
  selectedTextboxId = null;
  resetCandidateState();
}
function activeTextbox() { return doc.textboxes.find(t => t.id === selectedTextboxId) || null; }
function selectedGlyphs() { return doc.textboxes.flatMap(t => t.glyphs.filter(g => selectedGlyphIds.has(g.id))); }

function setCanvasSize(width, height) {
  doc.width = Math.max(300, Math.round(width));
  doc.height = Math.max(300, Math.round(height));
  els.canvas.width = doc.width;
  els.canvas.height = doc.height;
  els.canvas.style.width = Math.round(doc.width * doc.zoom) + 'px';
  els.canvas.style.height = Math.round(doc.height * doc.zoom) + 'px';
}
function updateZoom(value) {
  doc.zoom = Math.max(0.1, Math.min(1, +value || 0.35));
  els.zoomInput.value = String(doc.zoom);
  els.zoomText.textContent = Math.round(doc.zoom * 100) + '%';
  els.canvas.style.width = Math.round(doc.width * doc.zoom) + 'px';
  els.canvas.style.height = Math.round(doc.height * doc.zoom) + 'px';
}
function applySizePreset(name) {
  const p = SIZE_PRESETS[name];
  if (!p) return;
  els.canvasWidthInput.value = p.width;
  els.canvasHeightInput.value = p.height;
}
function commitCanvasSize(width, height) {
  snapshot();
  setCanvasSize(width, height);
  draw();
  syncUI();
}

function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function hashString(text){let h=2166136261>>>0;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function mixSeed(a,b,c){let h=(a^Math.imul(b,2246822519)^Math.imul(c,3266489917))>>>0;h^=h>>>16;h=Math.imul(h,2246822507)>>>0;h^=h>>>13;h=Math.imul(h,3266489909)>>>0;h^=h>>>16;return h>>>0}
function normal(rng){const u=Math.max(rng(),1e-6),v=Math.max(rng(),1e-6);return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function commandPoints(c){if(c.type==='M'||c.type==='L')return[['x','y']];if(c.type==='Q')return[['x1','y1'],['x','y']];if(c.type==='C')return[['x1','y1'],['x2','y2'],['x','y']];return[]}
function bounds(commands){const xs=[],ys=[];for(const c of commands){for(const [xk,yk] of commandPoints(c)){if(Number.isFinite(c[xk])&&Number.isFinite(c[yk])){xs.push(c[xk]);ys.push(c[yk])}}}if(!xs.length)return{minX:0,minY:0,maxX:1,maxY:1,width:1,height:1};const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);return{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY}}
function warpModel(seed,strengthPx,diversityBoost){const rng=mulberry32(seed),grid=[],signature=[],boost=1+diversityBoost*.65;for(let gy=0;gy<GRID;gy++){const row=[];for(let gx=0;gx<GRID;gx++){const edge=gx===0||gx===GRID-1||gy===0||gy===GRID-1,factor=edge?.38:1,dx=normal(rng)*strengthPx*factor*.72*boost,dy=normal(rng)*strengthPx*factor*.72*boost;row.push({dx,dy});signature.push(dx,dy)}grid.push(row)}const widthScale=1+normal(rng)*(0.010+diversityBoost*0.010),heightScale=1+normal(rng)*(0.010+diversityBoost*0.010),shearX=normal(rng)*(0.007+diversityBoost*0.006),shearY=normal(rng)*(0.004+diversityBoost*0.004);signature.push((widthScale-1)*100,(heightScale-1)*100,shearX*100,shearY*100);return{grid,widthScale,heightScale,shearX,shearY,signature}}
function displacement(grid,u,v){u=Math.max(0,Math.min(.999999,u));v=Math.max(0,Math.min(.999999,v));const x=u*(GRID-1),y=v*(GRID-1),gx=Math.floor(x),gy=Math.floor(y),tx=x-gx,ty=y-gy,p00=grid[gy][gx],p10=grid[gy][Math.min(gx+1,GRID-1)],p01=grid[Math.min(gy+1,GRID-1)][gx],p11=grid[Math.min(gy+1,GRID-1)][Math.min(gx+1,GRID-1)];return{dx:(1-tx)*(1-ty)*p00.dx+tx*(1-ty)*p10.dx+(1-tx)*ty*p01.dx+tx*ty*p11.dx,dy:(1-tx)*(1-ty)*p00.dy+tx*(1-ty)*p10.dy+(1-tx)*ty*p01.dy+tx*ty*p11.dy}}
function warpPoint(p,b,model){const u=(p.x-b.minX)/Math.max(b.width,1e-6),v=(p.y-b.minY)/Math.max(b.height,1e-6),d=displacement(model.grid,u,v),cx=b.minX+b.width/2,cy=b.minY+b.height/2,lx=p.x-cx,ly=p.y-cy;return{x:cx+lx*model.widthScale+ly*model.shearX+d.dx,y:cy+ly*model.heightScale+lx*model.shearY+d.dy}}
function svg(commands){const f=n=>Number.isFinite(n)?n.toFixed(2):'0';return commands.map(c=>c.type==='M'?`M ${f(c.x)} ${f(c.y)}`:c.type==='L'?`L ${f(c.x)} ${f(c.y)}`:c.type==='Q'?`Q ${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`:c.type==='C'?`C ${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`:c.type==='Z'?'Z':'').join(' ')}
function geometry(char,fontSize,seed,strength,diversityBias){const glyph=font.charToGlyph(char),units=font.unitsPerEm||1000,ascent=(font.ascender||units*.8)/units*fontSize,descent=Math.abs(font.descender||units*.2)/units*fontSize,pad=Math.max(2,fontSize*.06),baseY=ascent+pad,commands=glyph.getPath(0,baseY,fontSize).commands.map(c=>({...c})),b=bounds(commands),model=warpModel(seed,strength*fontSize,diversityBias||0);for(const c of commands){for(const [xk,yk] of commandPoints(c)){const p=warpPoint({x:c[xk],y:c[yk]},b,model);c[xk]=p.x;c[yk]=p.y}}let wb=bounds(commands),shiftX=pad-wb.minX,shiftY=Math.max(0,pad-wb.minY);for(const c of commands){for(const [xk,yk] of commandPoints(c)){c[xk]+=shiftX;c[yk]+=shiftY}}wb=bounds(commands);const baselineYLocal=baseY+shiftY,adv=((glyph.advanceWidth||units)/units)*fontSize,width=Math.max(adv+pad*2,wb.maxX+pad,4),height=Math.max(baselineYLocal+descent+pad,wb.maxY+pad,ascent+descent+pad*2,4),pathData=svg(commands);return{pathData,path:new Path2D(pathData),width,height,advance:adv,glyphIndex:glyph.index,signature:model.signature,baselineYLocal}}
function ensureGeo(g){if(!g.geo||g.geoSeed!==g.variantSeed||g.geoStrength!==g.warpStrength||g.geoBias!==g.instanceBias||g.geoSize!==g.fontSize){g.geo=geometry(g.char,g.fontSize,g.variantSeed,g.warpStrength,g.instanceBias);g.geoSeed=g.variantSeed;g.geoStrength=g.warpStrength;g.geoBias=g.instanceBias;g.geoSize=g.fontSize}return g.geo}
function preserveBaselineY(g,newGeo){const oldGeo=ensureGeo(g),baseline=g.y-(oldGeo.height/2-oldGeo.baselineYLocal);return baseline+(newGeo.height/2-newGeo.baselineYLocal)}
function glyphBox(g){ensureGeo(g);return{x:g.x-g.geo.width/2,y:g.y-g.geo.height/2,w:g.geo.width,h:g.geo.height}}
function sigDist(a,b){let s=0,n=Math.min(a.length,b.length);for(let i=0;i<n;i++){const d=a[i]-b[i];s+=d*d}return Math.sqrt(s/Math.max(1,n))}
function candidates(g,count=6){const rng=mulberry32((g.variantSeed+candidateNonce*2654435761)^0x9e3779b9),pool=[];for(let i=0;i<36;i++){const seed=Math.floor(rng()*0xffffffff)>>>0,geo=geometry(g.char,g.fontSize,seed,g.warpStrength,g.instanceBias+.25);pool.push({seed,geo})}const out=[pool[0]];while(out.length<count){let best=null,score=-1;for(const c of pool){if(out.includes(c))continue;const d=Math.min(...out.map(o=>sigDist(c.geo.signature,o.geo.signature)));if(d>score){score=d;best=c}}if(!best)break;out.push(best)}return out}
function resetCandidateState(){candidateState={glyphId:null,nonce:-1,list:[]}}

function createTextbox(rect) {
  const tb = {
    id: 'tb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    x: rect.x, y: rect.y, width: Math.max(120, rect.w), height: Math.max(80, rect.h),
    text: els.text.value,
    fontSize: +els.fontSize.value,
    warpStrength: +els.strength.value,
    diversity: +els.diversity.value,
    padding: 16,
    charGap: 0,
    lineGap: 1.55,
    offsetX: 0,
    offsetY: 0,
    glyphs: [],
    overflowCount: 0
  };
  layoutTextbox(tb);
  return tb;
}
function textboxInnerRect(tb){return{x:tb.x+tb.padding+tb.offsetX,y:tb.y+tb.padding+tb.offsetY,w:Math.max(10,tb.width-tb.padding*2),h:Math.max(10,tb.height-tb.padding*2)}}
function layoutTextbox(tb){
  if (!font) return tb;
  const inner = textboxInnerRect(tb);
  const text = tb.text;
  const size = tb.fontSize;
  const strength = tb.warpStrength;
  const diversity = tb.diversity;
  const rng = mulberry32(hashString(text + ':' + size + ':' + strength + ':' + diversity + ':' + tb.id));
  const units = font.unitsPerEm || 1000;
  const ascent = (font.ascender || units * 0.8) / units * size;
  const lineHeight = size * tb.lineGap;
  const left = inner.x;
  const top = inner.y;
  const repeatCount = new Map();
  let x = left;
  let lineIndex = 0;
  let baseline = top + ascent;
  let idx = 0;
  const result = [];
  let overflowCount = 0;

  for (const ch of Array.from(text)) {
    if (ch === '\n') {
      x = left;
      lineIndex++;
      baseline = top + lineIndex * lineHeight + ascent;
      continue;
    }
    const glyph = font.charToGlyph(ch);
    const adv = ((glyph.advanceWidth || units) / units) * size + tb.charGap;
    if (x + adv > left + inner.w && x > left) {
      x = left;
      lineIndex++;
      baseline = top + lineIndex * lineHeight + ascent;
    }
    if (baseline + size * 0.35 > top + inner.h) { overflowCount++; continue; }
    const occ = repeatCount.get(ch) || 0;
    repeatCount.set(ch, occ + 1);
    const instanceBias = Math.min(1.15, diversity * (0.22 + occ * 0.28));
    const baseSeed = Math.floor(rng() * 0xffffffff) >>> 0;
    const seed = mixSeed(baseSeed, hashString(ch), occ + idx * 17);
    const geo = geometry(ch, size, seed, strength, instanceBias);
    const y = baseline + (geo.height / 2 - geo.baselineYLocal);
    const xJitter = (rng() - 0.5) * size * 0.02;
    const rotation = (rng() - 0.5) * (1.5 + diversity * 1.2 + occ * 0.25);
    const scaleX = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
    const scaleY = 1 + (rng() - 0.5) * 0.012 * (1 + instanceBias * 0.7);
    const strokeWidth = Math.max(0, 0.22 + occ * 0.03 + (rng() - 0.5) * 0.10);
    result.push({id:'g_'+tb.id+'_'+idx++,textboxId:tb.id,char:ch,x:x+geo.width/2+xJitter,y,rotation,scaleX,scaleY,fontSize:size,variantSeed:seed,warpStrength:strength,instanceBias,fill:DEFAULT_COLOR,strokeWidth,geo,geoSeed:seed,geoStrength:strength,geoBias:instanceBias,geoSize:size});
    x += adv;
  }
  tb.glyphs = normalizeTopMargin(result, tb.y + tb.padding + tb.offsetY);
  tb.overflowCount = overflowCount;
  return tb;
}
function normalizeTopMargin(items, topPadding){if(!items||!items.length)return items||[];let minY=Infinity;for(const g of items){ensureGeo(g);const box=glyphBox(g);if(box.y<minY)minY=box.y}if(!Number.isFinite(minY))return items;const dy=topPadding-minY;if(Math.abs(dy)<.5)return items;for(const g of items)g.y+=dy;return items}

function drawBackground() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, doc.width, doc.height);
  const bg = doc.background;
  if (!bg.image) return;
  ctx.save();
  ctx.globalAlpha = bg.opacity;
  if (bg.mode === 'stretch') {
    ctx.drawImage(bg.image, 0, 0, doc.width, doc.height);
  } else {
    const iw = bg.image.width, ih = bg.image.height;
    const scale = bg.mode === 'cover' ? Math.max(doc.width / iw, doc.height / ih) : Math.min(doc.width / iw, doc.height / ih);
    const finalScale = scale * bg.scale;
    const dw = iw * finalScale, dh = ih * finalScale;
    const dx = (doc.width - dw) / 2, dy = (doc.height - dh) / 2;
    ctx.drawImage(bg.image, dx, dy, dw, dh);
  }
  ctx.restore();
}
function drawTextbox(tb) {
  ctx.save();
  ctx.strokeStyle = tb.id === selectedTextboxId ? 'rgba(34,34,34,.65)' : 'rgba(0,0,0,.18)';
  ctx.setLineDash(tb.id === selectedTextboxId ? [6, 4] : [4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(tb.x, tb.y, tb.width, tb.height);
  ctx.restore();
  for (const g of tb.glyphs) drawGlyph(g);
  if (tb.id === selectedTextboxId) drawTextboxHandles(tb);
}
function drawGlyph(g) {
  ensureGeo(g);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.rotation * Math.PI / 180);
  ctx.scale(g.scaleX, g.scaleY);
  ctx.translate(-g.geo.width / 2, -g.geo.height / 2);
  ctx.fillStyle = g.fill || DEFAULT_COLOR;
  ctx.fill(g.geo.path);
  if ((g.strokeWidth || 0) > 0.001) {
    ctx.strokeStyle = g.fill || DEFAULT_COLOR;
    ctx.lineWidth = g.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(g.geo.path);
  }
  if (selectedGlyphIds.has(g.id)) {
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(0, 0, g.geo.width, g.geo.height);
  }
  ctx.restore();
}
