'use strict';
(function () {
  const states = new WeakMap(), imageIds = new WeakMap();
  const HOT = new Set(['moveTextbox','resizeTextbox','rotateTextbox','moveSingleGlyph','moveGlyphGroup','rotateSingleGlyph','rotateGlyphGroup','marqueeSelect','createTextbox']);
  let imageSeq = 1;
  const r = (v, p = 100) => Math.round((Number(v) || 0) * p) / p;

  function imageId(img) {
    if (!img) return 0;
    if (!imageIds.has(img)) imageIds.set(img, imageSeq++);
    return imageIds.get(img);
  }
  function surface(w, h) {
    const c = document.createElement('canvas'); c.width = Math.max(1,w|0); c.height = Math.max(1,h|0); return c;
  }
  function clear(ctx, w, h) {
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.filter='none'; ctx.clearRect(0,0,w,h); ctx.restore();
  }
  function workerInit(s) {
    if (s.workerTried) return; s.workerTried = true;
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) return;
    try {
      s.worker = new Worker('./src/render-worker.js');
      s.worker.onmessage = e => {
        const d=e.data||{}; if(d.type!=='cached-base'||!d.bitmap) return;
        if(d.version!==s.version){ d.bitmap.close?.(); s.workerBusy=false; return; }
        s.bitmap?.close?.(); s.bitmap=d.bitmap; s.bitmapKey=d.key||''; s.workerBusy=false;
      };
      s.worker.onerror = () => { s.workerFailed=true; s.workerBusy=false; try{s.worker.terminate();}catch(_){} };
    } catch (_) { s.workerFailed=true; }
  }
  function stateFor(canvas) {
    let s=states.get(canvas), w=Math.max(1,canvas.width|0), h=Math.max(1,canvas.height|0);
    if(!s){
      const bg=surface(w,h), base=surface(w,h);
      s={w,h,bg,base,bgCtx:bg.getContext('2d'),baseCtx:base.getContext('2d'),bgSig:'',staticSig:'',activeKey:'',stableInk:'',bitmap:null,bitmapKey:'',version:0,worker:null,workerBusy:false,workerTried:false,workerFailed:false,stats:{backgroundBuilds:0,staticBuilds:0,activeFrames:0}};
      states.set(canvas,s); workerInit(s);
    } else if(s.w!==w||s.h!==h){
      s.w=w; s.h=h; s.bg.width=s.base.width=w; s.bg.height=s.base.height=h; s.bgSig=s.staticSig=s.bitmapKey=''; s.version++; s.bitmap?.close?.(); s.bitmap=null;
    }
    return s;
  }
  function bgKey(doc){ const b=doc.background||{}; return [doc.width,doc.height,imageId(b.image),b.mode||'',r(b.scale,1000),r(b.opacity,1000),b.fileName||''].join('|'); }
  function glyphKey(g){ return [g.id,g.char,r(g.x),r(g.y),r(g.rotation),r(g.scaleX,1000),r(g.scaleY,1000),r(g.fontSize),g.variantSeed,g.geoSeed,g.inkSeed,g.fill,r(g.strokeWidth,1000),r(g.opacity==null?1:g.opacity,1000),r(g.brightness==null?1:g.brightness,1000)].join(','); }
  function inkKey(doc){
    const v=id=>document.getElementById(id)?.value||''; const n=doc.noise||{};
    return [r(n.amount),n.size,n.colorful?1:0,n.seed||0,v('sheenInput'),v('localToneInput'),v('localStrokeInput')].join('|');
  }
  function active(env){ const ids=env.selectedGlyphIds instanceof Set?env.selectedGlyphIds:new Set(), tb=env.selectedTextboxId||null; return {ids,tb,key:[...ids].sort().join(',')+'|'+(tb||'')}; }
  function staticKey(env,s,a,hot){
    if(hot&&s.staticSig&&a.key===s.activeKey) return s.staticSig;
    const ink=window.HandWriterInkVariation, now=inkKey(env.doc); if(!ink||!ink.interactive) s.stableInk=now;
    const out=[s.bgSig,a.key,ink?.interactive&&s.stableInk?s.stableInk:now];
    for(const g of env.doc.glyphs||[]) if(!a.ids.has(g.id)) out.push(glyphKey(g));
    for(const tb of env.doc.draftTextboxes||[]){ if(tb.id===a.tb) continue; out.push('tb:'+tb.id); for(const g of tb.previewGlyphs||[]) out.push(glyphKey(g)); }
    return out.join(';');
  }
  function withCtx(env,ctx,fn){ const old=env.getContext(); env.setContext(ctx); try{return fn();} finally{env.setContext(old);} }
  function buildBackground(env,s,key){
    clear(s.bgCtx,s.w,s.h); withCtx(env,s.bgCtx,env.drawBackground); s.bgSig=key; s.staticSig=''; s.bitmapKey=''; s.version++; s.stats.backgroundBuilds++;
  }
  function buildStatic(env,s,a,key){
    clear(s.baseCtx,s.w,s.h); s.baseCtx.drawImage(s.bg,0,0);
    withCtx(env,s.baseCtx,()=>{
      for(const g of env.doc.glyphs||[]) if(!a.ids.has(g.id)) env.drawGlyph(g);
      for(const tb of env.doc.draftTextboxes||[]) if(tb.id!==a.tb) for(const g of tb.previewGlyphs||[]) env.drawGlyph(g);
    });
    s.staticSig=key; s.activeKey=a.key; s.bitmapKey=''; s.version++; s.stats.staticBuilds++;
  }
  async function workerCache(s,key){
    if(!s.worker||s.workerFailed||s.workerBusy||!window.createImageBitmap) return;
    s.workerBusy=true; const version=s.version;
    try{
      const base=await createImageBitmap(s.base);
      if(version!==s.version){base.close();s.workerBusy=false;return;}
      s.worker.postMessage({type:'cache-base',version,key,width:s.w,height:s.h,base},[base]);
    }catch(_){s.workerBusy=false;s.workerFailed=true;}
  }
  function drawBase(env,s,key){
    const c=env.getContext(); c.save(); c.setTransform(1,0,0,1,0,0); c.globalAlpha=1; c.globalCompositeOperation='source-over'; c.filter='none'; c.clearRect(0,0,s.w,s.h); c.drawImage(s.bitmap&&s.bitmapKey===key?s.bitmap:s.base,0,0); c.restore();
  }
  function drawActive(env,s,a){
    withCtx(env,env.getContext(),()=>{
      for(const g of env.doc.glyphs||[]) if(a.ids.has(g.id)) env.drawGlyph(g);
      if(a.tb){ const tb=(env.doc.draftTextboxes||[]).find(x=>x.id===a.tb); if(tb) for(const g of tb.previewGlyphs||[]) env.drawGlyph(g); }
    }); s.stats.activeFrames++;
  }
  function drawOverlay(env){
    env.drawSelectionOverlay();
    for(const tb of env.doc.draftTextboxes||[]){ const glyphs=tb.previewGlyphs; tb.previewGlyphs=[]; try{env.drawDraftTextbox(tb);} finally{tb.previewGlyphs=glyphs;} }
    const i=env.interaction||{};
    if(i.mode==='marqueeSelect'&&i.selectionRect) env.drawRectOverlay(i.selectionRect,'rgba(0,0,0,.05)','rgba(0,0,0,.45)');
    if(i.mode==='createTextbox'&&i.previewRect) env.drawRectOverlay(i.previewRect,'rgba(0,0,0,.03)','rgba(0,0,0,.55)');
  }
  function render(env){
    if(!env?.canvas||!env.doc||!env.getContext||!env.setContext) return false;
    const s=stateFor(env.canvas), a=active(env), ink=window.HandWriterInkVariation, hot=HOT.has(env.interaction?.mode)||!!ink?.interactive;
    const bk=bgKey(env.doc); if(s.bgSig!==bk) buildBackground(env,s,bk);
    const sk=staticKey(env,s,a,hot); if(s.staticSig!==sk||s.activeKey!==a.key) buildStatic(env,s,a,sk);
    const baseKey=s.bgSig+'::'+s.staticSig; if(s.bitmapKey!==baseKey&&!s.workerBusy) workerCache(s,baseKey);
    drawBase(env,s,baseKey); drawActive(env,s,a); drawOverlay(env); return true;
  }
  function stats(canvas=document.getElementById('canvas')){ const s=states.get(canvas); return s?{...s.stats,worker:!!s.worker&&!s.workerFailed,baseCached:!!s.bitmap}:null; }
  window.HandWriterLayeredRenderer={render,stats};
})();
