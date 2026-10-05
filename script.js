/* ==============================================================
   - Fonts must be loaded by the <link> in <head>. Ready to use:
Fraunces, Instrument Sans, Playfair Display, Caveat,
Bebas Neue, Pacifico, Space Mono.
   - logo: a data: URI (data:image/png;base64,...). Remote image
URLs are blocked on the published page. '' means no image.
   - style: optional per-text overrides by key, for example
subtitle:{font:'Caveat', size:'20px', color:'#7a5cff'}
   ============================================================== */
const SITE={
  fonts:{ title:'Fraunces', body:'Instrument Sans' },
  logo:'',
  logoHeight:56,
  text:{
    title:'Chromaline',
    subtitle:'',
    scale:'Scale',
    pitchRange:'Pitch range', low:'Low', mid:'Mid', high:'High',
    playhead:'Playhead',
    playheadHint:'A line sweeps across and plays the drawing for you.',
    sweepTime:'Sweep time',
    strokeSettings:'Stroke Settings',
    penSize:'Pen size',
    sizeVariation:'Size variation',
    glowRange:'Line glow',
    penShape:'Pen shape', round:'Round', square:'Square', pixelMode:'Pixel mode',
    drift:'Drift color',
    driftHint:'The hue cycles as you draw.',
    replay:'Replay', replayStop:'Stop', undo:'Undo', redo:'Redo', clear:'Clear',
    import:'Import', export:'Export',
    exportPicture:'Picture (.png)', exportReplay:'Replay (.chro)'
  },
  style:{
    title:{}, subtitle:{}
  }
};

const PAINTER_QUOTES=[
  '“Art is not what you see, but what you make others see.” - Edgar Degas',
  '“The purpose of art is washing the dust of daily life off our souls.” - Pablo Picasso',
  '“I dream of painting and then I paint my dream.” - Vincent van Gogh',
  '“Damn, this site is so unfinished as heck.” - Mendukusai',
  '“Creativity takes courage.” - Henri Matisse',
  '“If you hear a voice within you say ‘you cannot paint,’ then by all means paint.” - Vincent van Gogh',
  '“A line is a dot that went for a walk.” - Paul Klee',
  '“Great art is horsed by the soul.” - Georgia O’Keeffe',
  '“Every canvas is a journey all its own.” - Joan Miró',
  '“I am seeking. I am striving. I am in it with all my heart.” - Vincent van Gogh',
  '“The more constraints one imposes, the more one frees one’s self.” - Frida Kahlo',
  '“There is no must in art because art is free.” - Charles Camoin',
  '“Painting is just another way of keeping a diary.” - Pablo Picasso',
  '“We don’t make mistakes, just happy accidents.” - Bob Ross'
];

function randomizePainterHint(){
  const quoteEl=document.getElementById('quote');
  if(!quoteEl)return;
  const quote=PAINTER_QUOTES[Math.floor(Math.random()*PAINTER_QUOTES.length)];
  quoteEl.textContent=quote;
}

(function(){
const SCALES={'Pentatonic':[0,2,4,7,9],'Major':[0,2,4,5,7,9,11],'Minor':[0,2,3,5,7,8,10],'Whole tone':[0,2,4,6,8,10],'Chromatic':[0,1,2,3,4,5,6,7,8,9,10,11]};
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const LIGHT=[40,57,74];
const $=id=>document.getElementById(id);
const cv=$('cv'),ctx=cv.getContext('2d'),fx=$('fx'),fctx=fx.getContext('2d'),ph=$('ph'),wheel=$('wheel'),marker=$('marker'),hint=$('hint'),creditsBtn=$('creditsBtn'),creditsModal=$('creditsModal'),creditsClose=$('creditsClose');
let hue=210,sat=.85,oct=1,scaleName='Pentatonic',drift=false;
const redoStack=[];
let penSize=10,penVar=.6,glowIntensity=11,penShape='round',pixelMode=false,sid=0,phOn=false,sweep=8,pts=[],drawing=false,replaying=false,lastMove=0,sp=0,voice=null,tick=null,W=0,H=0;

/* ---------- audio ---------- */
let AC=null,master=null;
function audio(){
  if(AC){if(AC.state==='suspended')AC.resume();return AC}
  AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain();master.gain.value=.8;
  const dl=AC.createDelay(1),fb=AC.createGain(),wet=AC.createGain();
  dl.delayTime.value=.3;fb.gain.value=.38;wet.gain.value=.3;
  master.connect(AC.destination);master.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(wet);wet.connect(AC.destination);
  return AC;
}
class Voice{
  constructor(f,soft){
    this.soft=!!soft;
    const a=audio();
    this.o=a.createOscillator();this.o.type='triangle';this.o.frequency.value=f;
    this.f=a.createBiquadFilter();this.f.type='lowpass';this.f.Q.value=2;
    this.g=a.createGain();this.g.gain.value=0;
    this.p=a.createStereoPanner?a.createStereoPanner():null;
    this.o.connect(this.f);this.f.connect(this.g);
    if(this.p){this.g.connect(this.p);this.p.connect(master)}else this.g.connect(master);
    this.o.start();
  }
  set(freq,vol,pan,s,tc){
    const t=AC.currentTime;
    this.o.frequency.setTargetAtTime(freq,t,this.soft?.07:.025);
    this.g.gain.setTargetAtTime(vol,t,tc||.04);
    if(this.p)this.p.pan.setTargetAtTime(pan,t,.05);
    this.f.frequency.setTargetAtTime(this.soft?300+s*1800:450+s*3600,t,.05);
  }
  quiet(tc){this.g.gain.setTargetAtTime(.0001,AC.currentTime,tc||.12)}
  stop(){const t=AC.currentTime;this.g.gain.setTargetAtTime(0,t,.08);try{this.o.stop(t+.6)}catch(e){}}}
function note(h,o){
  const sc=SCALES[scaleName],i=Math.floor(((h%360+360)%360)/360*sc.length)%sc.length;
  const midi=48+12*o+sc[i];
  return{midi,freq:440*Math.pow(2,(midi-69)/12),name:NAMES[midi%12]+(Math.floor(midi/12)-1)};
}
const color=(h,s,o)=>`hsl(${h} ${Math.round(30+70*s)}% ${LIGHT[o]}%)`;

/* ---------- wheel ---------- */
(function(){
  let st=[];for(let i=0;i<=12;i++)st.push(`hsl(${i*30%360} 100% 50%) ${i*30}deg`);
  wheel.style.background=`radial-gradient(circle closest-side,#fff 0,rgba(255,255,255,0) 100%),conic-gradient(${st.join(',')})`;
  const sel=$('scale');
  Object.keys(SCALES).forEach(k=>{const o=document.createElement('option');o.textContent=k;sel.appendChild(o)});
})();
function buildTicks(){
  wheel.querySelectorAll('.tick').forEach(n=>n.remove());
  const sc=SCALES[scaleName],n=sc.length;
  sc.forEach((s,i)=>{
    const a=(i+.5)/n*2*Math.PI,el=document.createElement('div');
    el.className='tick';el.textContent=NAMES[s%12];
    el.style.left=(50+39*Math.sin(a))+'%';el.style.top=(50-39*Math.cos(a))+'%';
    wheel.appendChild(el);
  });
}
function paintUI(){
  const a=hue*Math.PI/180,r=Math.max(.2,sat)*50;
  marker.style.left=(50+r*Math.sin(a))+'%';marker.style.top=(50-r*Math.cos(a))+'%';
  marker.style.background=color(hue,sat,oct);
  document.documentElement.style.setProperty('--pen',color(hue,sat,oct));
  const n=note(hue,oct);
  $('readout').innerHTML=`${n.name}<small>hue ${Math.round(hue)}°</small>`;
}
function pickWheel(e){
  const r=wheel.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
  hue=(Math.atan2(dx,-dy)*180/Math.PI+360)%360;
  sat=Math.min(1,Math.hypot(dx,dy)/(r.width/2));
  paintUI();
}
let wdown=false;
wheel.addEventListener('pointerdown',e=>{wdown=true;wheel.setPointerCapture(e.pointerId);pickWheel(e);preview()});
wheel.addEventListener('pointermove',e=>{if(wdown){pickWheel(e);preview()}});
wheel.addEventListener('pointerup',()=>{wdown=false});
wheel.addEventListener('keydown',e=>{
  const n=SCALES[scaleName].length,step=360/n;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){hue=(hue+(e.key==='ArrowRight'?step:-step)+360)%360}
  else if(e.key==='ArrowUp'){sat=Math.min(1,sat+.1)}
  else if(e.key==='ArrowDown'){sat=Math.max(.2,sat-.1)}
  else return;
  e.preventDefault();paintUI();preview();
});
/* short note preview when choosing a color */
let pv=null,pvT=null;
function preview(){
  if(replaying||drawing)return;
  const n=note(hue,oct);
  if(!pv){pv=new Voice(n.freq)}
  pv.set(n.freq,.16,0,sat);
  clearTimeout(pvT);pvT=setTimeout(()=>{pv.stop();pv=null},260);
}
$('scale').addEventListener('change',e=>{scaleName=e.target.value;buildTicks();paintUI();preview()});
$('range').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  oct=+b.dataset.o;
  [...$('range').children].forEach(c=>c.setAttribute('aria-pressed',c===b));
  paintUI();preview();
});
$('drift').addEventListener('change',e=>{drift=e.target.checked});

/* ---------- canvas ---------- */
function resize(){
  const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;
  W=r.width;H=r.height;cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0);
  fx.width=W*d;fx.height=H*d;fctx.setTransform(d,0,0,d,0,0);
  drawAll();
}
function clearStage(){ctx.fillStyle='#13111b';ctx.fillRect(0,0,W,H)}
function seg(i){
  const p=pts[i],q=pts[i-1],c=color(p.h,p.s,p.o);
  ctx.lineCap=p.shape==='square'?'square':'round';ctx.lineJoin=p.shape==='square'?'miter':'round';
  ctx.shadowColor=c;ctx.shadowBlur=p.g??14;ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=p.w;
  if(p.pixel){
    const pixelSize=Math.max(1,Math.round(p.w));
    let x0=Math.floor(p.x/pixelSize),y0=Math.floor(p.y/pixelSize);
    const stamp=(x,y)=>ctx.fillRect(x*pixelSize,y*pixelSize,pixelSize,pixelSize);
    if(!q||p.m)stamp(x0,y0);
    else{
      const x1=Math.floor(q.x/pixelSize),y1=Math.floor(q.y/pixelSize);
      const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
      let error=dx+dy;
      while(true){
        stamp(x0,y0);
        if(x0===x1&&y0===y1)break;
        const twice=2*error;
        if(twice>=dy){error+=dy;x0+=sx}
        if(twice<=dx){error+=dx;y0+=sy}
      }
    }
  }else if(!q||p.m){
    if(p.shape==='square')ctx.fillRect(p.x-p.w/2,p.y-p.w/2,p.w,p.w);
    else{ctx.beginPath();ctx.arc(p.x,p.y,p.w/2,0,7);ctx.fill()}
  }else{ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke()}
  ctx.shadowBlur=0;
}
function drawAll(){clearStage();for(let i=0;i<pts.length;i++)seg(i);hint.hidden=pts.length>0||replaying}
window.addEventListener('resize',resize);

function addPoint(x,y,m){
  if(pixelMode){const pixelSize=Math.max(1,Math.round(penSize));x=Math.floor(x/pixelSize)*pixelSize+pixelSize/2;y=Math.floor(y/pixelSize)*pixelSize+pixelSize/2}
  const now=performance.now(),q=pts[pts.length-1];
  if(!m&&q){
    const d=Math.hypot(x-q.x,y-q.y),dt=Math.max(1,now-q.t);
    if(d<1.2)return;
    sp=sp*.7+(d/dt)*.3;
    if(drift)hue=(hue+d*.22)%360;
  }
  if(m)sp=0;
  if(m){sid++;redoStack.length=0}
  const v=.04+Math.min(sp,2)/2*.22;
  const w=pixelMode?penSize:Math.max(1.5,penSize*(1-penVar*.75*Math.min(1,sp/1.5)));
  const p={id:sid,x,y,t:now,h:hue,s:sat,o:oct,m:m?1:0,w,v,g:glowIntensity,shape:penShape,pixel:pixelMode};
  pts.push(p);seg(pts.length-1);hint.hidden=true;
  if(drift)paintUI();
  const n=note(p.h,p.o);
  if(voice)voice.set(n.freq,m?.06:p.v,Math.max(-1,Math.min(1,x/W*2-1))*.8,p.s);
  lastMove=now;
}
cv.addEventListener('pointerdown',e=>{
  if(replaying)return;
  e.preventDefault();cv.setPointerCapture(e.pointerId);audio();
  drawing=true;
  const n=note(hue,oct);
  voice=new Voice(n.freq);
  const r=cv.getBoundingClientRect();
  addPoint(e.clientX-r.left,e.clientY-r.top,true);
  tick=setInterval(()=>{if(performance.now()-lastMove>100&&voice)voice.quiet()},60);
});
cv.addEventListener('pointermove',e=>{
  if(!drawing)return;
  const r=cv.getBoundingClientRect();
  addPoint(e.clientX-r.left,e.clientY-r.top,false);
});
function endDraw(){
  if(!drawing)return;drawing=false;clearInterval(tick);
  if(voice){voice.stop();voice=null}
}
cv.addEventListener('pointerup',endDraw);
cv.addEventListener('pointercancel',endDraw);

/* ---------- replay ---------- */
let rv=null;
function stopReplay(){
  replaying=false;if(rv){rv.stop();rv=null}
  $('replay').textContent=SITE.text.replay;drawAll();
}
$('replay').addEventListener('click',()=>{
  if(replaying){stopReplay();return}
  if(!pts.length)return;
  audio();replaying=true;$('replay').textContent=SITE.text.replayStop;
  clearStage();hint.hidden=true;
  const rts=[];let shift=0;
  for(let i=0;i<pts.length;i++){
    if(i&&pts[i].m){const gap=pts[i].t-pts[i-1].t;if(gap>300)shift+=gap-300}
    rts.push(pts[i].t-pts[0].t-shift);
  }
  let i=0,last=0;const start=performance.now();
  (function frame(now){
    if(!replaying)return;
    const e=now-start;
    while(i<pts.length&&rts[i]<=e){
      const p=pts[i],n=note(p.h,p.o);
      if(p.m){if(rv)rv.stop();rv=new Voice(n.freq)}
      seg(i);
      rv.set(n.freq,p.m?.06:p.v,Math.max(-1,Math.min(1,p.x/W*2-1))*.8,p.s);
      last=e;i++;
    }
    if(rv&&e-last>100)rv.quiet();
    if(i>=pts.length){setTimeout(()=>{if(replaying)stopReplay()},500);return}
    requestAnimationFrame(frame);
  })(start);
});
function doUndo(){
  if(drawing)return;
  if(replaying)stopReplay();
  if(!pts.length)return;
  let k=pts.length-1;while(k>0&&!pts[k].m)k--;
  redoStack.push(pts.splice(k));
  drawAll();
}
function doRedo(){
  if(drawing)return;
  if(replaying)stopReplay();
  const st=redoStack.pop();if(!st)return;
  for(const q of st)pts.push(q);
  drawAll();
}
$('undo').addEventListener('click',doUndo);
$('redo').addEventListener('click',doRedo);
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  const k=e.key.toLowerCase();
  if(k==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo()}
  else if(k==='y'){e.preventDefault();doRedo()}
});
$('clear').addEventListener('click',()=>{
  if(replaying)stopReplay();
  pts=[];redoStack.length=0;
  randomizePainterHint();
  drawAll();
});

/* ---------- playhead ---------- */
function updateStrokeControls(){
  const setting=$('strokeSetting');
  document.querySelectorAll('#strokeSetting option[data-hide-in-pixel]').forEach(option=>{option.hidden=pixelMode});
  if(pixelMode&&(setting.value==='pvar'||setting.value==='shape'))setting.value='psize';
  document.querySelectorAll('.stroke-control').forEach(control=>{
    const name=control.dataset.strokeControl;
    control.hidden=name!==setting.value||(pixelMode&&(name==='pvar'||name==='shape'));
  });
}
$('strokeSetting').addEventListener('change',updateStrokeControls);
$('psize').addEventListener('input',e=>{penSize=+e.target.value;$('psizev').textContent=penSize});
$('pvar').addEventListener('input',e=>{penVar=e.target.value/100;$('pvarv').textContent=e.target.value});
$('glowIntensity').addEventListener('input',e=>setGlowIntensity(+e.target.value));
$('penShape').addEventListener('change',e=>{penShape=e.target.value});
$('pixelMode').addEventListener('change',e=>{pixelMode=e.target.checked;updateStrokeControls()});
$('phon').addEventListener('change',e=>{
  phOn=e.target.checked;
  if(phOn){
    pos=0;
    prevT=0;
  }
});
$('sweep').addEventListener('input',e=>{sweep=+e.target.value;$('sweepv').textContent=sweep});
function setGlowIntensity(value){
  glowIntensity=Math.max(0,Math.min(40,Math.round(value)));
  $('glowIntensity').value=glowIntensity;
  $('glowValue').textContent=glowIntensity;
  $('glowIntensity').setAttribute('aria-valuetext',glowIntensity+' pixels');
}
let pos=0,prevT=0,pvs=new Map();
const HOLD=450;
function scan(a,b,hits){
  for(let i=0;i<pts.length;i++){
    const p=pts[i],q=pts[i-1];let hit=false,x=p.x,y=p.y,angle=0;
    if(p.m||!q){hit=p.x>=a&&p.x<=b}
    else{
      const lo=Math.min(p.x,q.x),hi=Math.max(p.x,q.x);
      if(hi>=a&&lo<=b){hit=true;x=Math.min(hi,Math.max(lo,b));y=p.x===q.x?p.y:q.y+(p.y-q.y)*(x-q.x)/(p.x-q.x);angle=Math.atan2(p.y-q.y,p.x-q.x)}
    }
    if(hit)hits.set(i,{id:p.id,p,x,y,angle});
  }
}
function loop(now){
  requestAnimationFrame(loop);
  const dt=prevT?Math.min(100,now-prevT):0;prevT=now;
  fctx.clearRect(0,0,W,H);
  const hits=new Map();
  if(phOn&&!replaying&&W){
    const prev=pos;pos+=dt/(sweep*1000)*W;
    if(pos>=W){scan(prev,W,hits);pos-=W;scan(0,pos,hits)}else scan(prev,pos,hits);
    ph.hidden=false;ph.style.transform=`translateX(${pos}px)`;
  }else ph.hidden=true;
  const sound=AC&&AC.state==='running',count=hits.size;
  hits.forEach(h=>{
    const c=color(h.p.h,h.p.s,h.p.o);
    if(sound){
      const nt=note(h.p.h,h.p.o),pan=Math.max(-1,Math.min(1,h.x/W*2-1))*.8;
      let v=pvs.get(h.id);
      if(!v&&pvs.size<8){v={voice:new Voice(nt.freq,true),last:now};pvs.set(h.id,v)}
      if(v){v.last=now;v.rel=false;v.voice.set(nt.freq,.12/Math.sqrt(count),pan,h.p.s,.12)}
    }
    fctx.shadowColor=c;fctx.shadowBlur=Math.max(18,(h.p.g??0)*2);fctx.strokeStyle='#fff';fctx.fillStyle='#fff';
    if(h.p.pixel){
      const size=Math.max(1,Math.round(h.p.w));
      fctx.fillRect(Math.floor(h.x/size)*size,Math.floor(h.y/size)*size,size,size);
    }else{
      const half=3,dx=Math.cos(h.angle)*half,dy=Math.sin(h.angle)*half;
      fctx.lineCap=h.p.shape==='square'?'square':'round';
      fctx.lineWidth=Math.max(2,Math.min(h.p.w*.55,5));
      fctx.beginPath();fctx.moveTo(h.x-dx,h.y-dy);fctx.lineTo(h.x+dx,h.y+dy);fctx.stroke();
    }
    fctx.shadowBlur=0;
  });
  pvs.forEach((v,id)=>{
    const age=now-v.last;
    if(age>HOLD&&!v.rel){v.voice.quiet(.18);v.rel=true}
    if(age>HOLD+1800){v.voice.stop();pvs.delete(id)}
  });
  fctx.globalAlpha=1;
}
requestAnimationFrame(loop);

/* ---------- import / export ---------- */
const statusEl=$('status'),expBtn=$('exp'),expMenu=$('expmenu');
const say=m=>{statusEl.textContent=m};
const stamp=()=>new Date().toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-');
function save(name,data,type){
  let url;
  try{
    const link=document.createElement('a');
    if(data instanceof Blob){
      url=URL.createObjectURL(data);
      link.href=url;
    }else{
      link.href=data;
    }
    link.download=name;
    link.style.position='fixed';
    link.style.left='-10000px';
    document.body.appendChild(link);
    link.click();
    link.remove();
    if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);
    say('Downloaded '+name);
  }catch(e){
    if(url)URL.revokeObjectURL(url);
    say('Couldn’t download the file.');
  }
}
function makeChromalineDoc(){
  const t0=pts[0].t,r=n=>Math.round(n*10)/10;
  return {format:'chromaline',version:1,width:Math.round(W),height:Math.round(H),scale:scaleName,glowMin:glowIntensity,glowMax:glowIntensity,
    pts:pts.map(p=>[r(p.x),r(p.y),Math.round(p.t-t0),r(p.h),Math.round(p.s*100)/100,p.o,r(p.w),Math.round(p.v*1000)/1000,p.m,p.id,r(p.g??14),p.shape||'round',p.pixel?1:0])};
}
expBtn.addEventListener('click',()=>{expMenu.hidden=!expMenu.hidden;expBtn.setAttribute('aria-expanded',!expMenu.hidden)});
$('exppng').addEventListener('click',()=>{
  expMenu.hidden=true;expBtn.setAttribute('aria-expanded','false');
  if(!pts.length){say('Draw something first.');return}
  if(replaying)stopReplay();
  try{save('chromaline-'+stamp()+'.png',cv.toDataURL('image/png'),'image/png')}
  catch(e){say('Couldn’t make the picture.')}
});
$('expchro').addEventListener('click',()=>{
  expMenu.hidden=true;expBtn.setAttribute('aria-expanded','false');
  if(!pts.length){say('Draw something first.');return}
  if(replaying)stopReplay();
  save('chromaline-'+stamp()+'.chro',new Blob([JSON.stringify(makeChromalineDoc())],{type:'application/json'}));
});
function parseText(txt){
  const L=txt.split(/\r?\n/);
  if(!/^CHROMALINE\b/.test(L[0]))return JSON.parse(txt);
  const doc={format:'chromaline',pts:[]};
  for(let i=1;i<L.length;i++){
    const l=L[i].trim();if(!l||l.startsWith('points'))continue;
    if(l.startsWith('size ')){const z=l.split(/\s+/);doc.width=+z[1];doc.height=+z[2]}
    else if(l.startsWith('scale '))doc.scale=l.slice(6).trim();
    else doc.pts.push(l.split(/\s+/).map(Number));
  }
  return doc;
}
$('imp').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    if(f.size>30e6)throw 0;
    if(!/\.chro$/i.test(f.name))throw 0;
    const doc=parseText(await f.text());
    if(!doc||doc.format!=='chromaline'||!Array.isArray(doc.pts)||doc.pts.length>300000)throw 0;
    const fw=+doc.width||W,fh=+doc.height||H,k=Math.min(W/fw,H/fh),ox=(W-fw*k)/2,oy=(H-fh*k)/2;
    const num=(v,d)=>Number.isFinite(+v)?+v:d,base=performance.now(),out=[];
    const savedGlowMin=Number.isFinite(+doc.glowMin)?Math.max(0,Math.min(40,+doc.glowMin)):14;
    const savedGlowMax=Math.max(savedGlowMin,Number.isFinite(+doc.glowMax)?Math.max(0,Math.min(40,+doc.glowMax)):14);
    let maxId=0;
    for(const a of doc.pts){
      if(!Array.isArray(a)||a.length<10)throw 0;
      const id=Math.max(0,Math.floor(num(a[9],0)));if(id>maxId)maxId=id;
      const v=Math.min(.4,Math.max(0,num(a[7],.1)));
      const glowProgress=Math.min(1,Math.max(0,(v-.04)/.22));
      const g=Math.max(0,Math.min(40,num(a[10],savedGlowMin+(savedGlowMax-savedGlowMin)*glowProgress)));
      out.push({id,x:num(a[0],0)*k+ox,y:num(a[1],0)*k+oy,t:base+num(a[2],0),h:((num(a[3],0)%360)+360)%360,
        s:Math.min(1,Math.max(0,num(a[4],.8))),o:(a[5]===0||a[5]===1||a[5]===2)?a[5]:1,
        w:Math.max(1,Math.min(80,num(a[6],6)*k)),v,g,m:a[8]?1:0,shape:a[11]==='square'?'square':'round',pixel:a[12]===1});
    }
    if(!out.length)throw 0;
    out[0].m=1;
    if(replaying)stopReplay();
    if(SCALES[doc.scale]){scaleName=doc.scale;$('scale').value=scaleName;buildTicks();paintUI()}
    setGlowIntensity((savedGlowMin+savedGlowMax)/2);
    pts=out;sid=maxId;redoStack.length=0;drawAll();
    say('Imported '+f.name+'. Press Replay to watch it.');
  }catch(err){say('That file isn’t a Chromaline drawing.')}
});

/* ---------- apply SITE config (see the EDIT ME block above) ---------- */
(function(){
  const root=document.documentElement.style,logo=$('logo');
  root.setProperty('--font-title','"'+SITE.fonts.title+'",Georgia,serif');
  root.setProperty('--font-body','"'+SITE.fonts.body+'",system-ui,sans-serif');
  document.title=SITE.text.title;
  document.querySelectorAll('[data-t]').forEach(e=>{
    const k=e.dataset.t,v=SITE.text[k],st=(SITE.style&&SITE.style[k])||{};
    if(typeof v==='string')e.textContent=v;
    if(st.font)e.style.fontFamily='"'+st.font+'",system-ui,sans-serif';
    if(st.size)e.style.fontSize=st.size;
    if(st.color)e.style.color=st.color;
  });
  if(SITE.logo){logo.src=SITE.logo;logo.alt=SITE.text.title;logo.style.height=SITE.logoHeight+'px';logo.hidden=false}
})();

function openCredits() {
  if (!creditsModal) return;
  creditsModal.hidden = false;
  creditsModal.setAttribute('aria-hidden', 'false');
}

function closeCredits() {
  if (!creditsModal) return;
  creditsModal.hidden = true;
  creditsModal.setAttribute('aria-hidden', 'true');
}

creditsBtn?.addEventListener('click', openCredits);
creditsClose?.addEventListener('click', closeCredits);
creditsModal?.addEventListener('click', e => {
  if (e.target === creditsModal) closeCredits();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && creditsModal && !creditsModal.hidden) closeCredits();
});

randomizePainterHint();
buildTicks();paintUI();setGlowIntensity(glowIntensity);resize();
})();
