/* Pure timer logic (no DOM). Loaded as a classic script in the browser (window.ETCore)
   and via require() in Node for the unit tests. */
(function(root){
'use strict';
const KEYS=['warm','train','rest','per','cycles','between'];
const LIM={warm:[0,3600],train:[1,3600],rest:[0,3600],per:[1,99],cycles:[1,99],between:[0,3600]};
const MAX_TOTAL=3*3600;
const SR=8000;

/* raw: {key: string|number}. Invalid/empty -> lower bound; out of range -> clamped. */
function clampConfig(raw){
  const c={};
  KEYS.forEach(k=>{
    const[lo,hi]=LIM[k],n=parseInt(raw&&raw[k],10);
    c[k]=Math.min(hi,Math.max(lo,Number.isFinite(n)?n:lo));
  });
  return c;
}

function buildPlan(c){
  const p=[];
  if(c.warm)p.push({t:'warm',d:c.warm});
  for(let i=1;i<=c.cycles;i++){
    for(let j=1;j<=c.per;j++){
      p.push({t:'train',d:c.train,i,j});
      const final=i===c.cycles&&j===c.per;
      if(!final&&c.rest)p.push({t:'rest',d:c.rest,i,j});
    }
    if(i<c.cycles&&c.between)p.push({t:'between',d:c.between,i});
  }
  let t=0;p.forEach(x=>{x.s=t;t+=x.d});
  return p;
}
const planTotal=p=>p.reduce((a,s)=>a+s.d,0);

/* Index of the segment containing time e (seconds), or plan.length when finished. */
function segAt(plan,e){
  for(let i=0;i<plan.length;i++)if(e<plan[i].s+plan[i].d)return i;
  return plan.length;
}

function beepList(p,tot){
  const L=[];
  p.forEach(x=>{
    const tr=x.t==='train',th=(tr||x.t==='rest')?5:3;
    L.push({at:x.s,f:tr?1600:600,ms:300});
    for(let left=Math.min(th,x.d-1);left>=1;left--)
      L.push({at:x.s+x.d-left,f:tr?(left===1?2200:1500):(left===1?1000:700),ms:left===1?250:120});
  });
  L.push({at:tot,f:1200,ms:600});
  return L;
}

/* Whole workout as a mono 16-bit PCM WAV (ArrayBuffer). */
function wavBytes(p,tot){
  const n=Math.ceil((tot+1.5)*SR),pcm=new Int16Array(n);
  const tone=(at,f,ms)=>{
    const a=Math.round(at*SR),len=Math.round(ms/1000*SR),h=3*f<SR/2,w=2*Math.PI*f/SR;
    for(let k=0;k<len&&a+k<n;k++){
      const env=Math.min(1,k/40,(len-k)/40);
      let v=Math.sin(w*k);if(h)v=(v+.35*Math.sin(3*w*k))/1.2;
      pcm[a+k]=v*env*30000;
    }
  };
  beepList(p,tot).forEach(b=>tone(b.at,b.f,b.ms));
  const buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,SR,true);v.setUint32(28,SR*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  w(36,'data');v.setUint32(40,n*2,true);
  new Int16Array(buf,44,n).set(pcm); // little-endian platforms; same as per-sample setInt16(...,true)
  return buf;
}

/* 75 -> "1:15", 3725 -> "1:02:05" */
function fmtTime(s){
  s=Math.max(0,Math.round(s));
  const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60,p2=x=>String(x).padStart(2,'0');
  return h?`${h}:${p2(m)}:${p2(r)}`:`${m}:${p2(r)}`;
}

root.KEYS=KEYS;root.LIM=LIM;root.MAX_TOTAL=MAX_TOTAL;root.SR=SR;
root.clampConfig=clampConfig;root.buildPlan=buildPlan;root.planTotal=planTotal;
root.segAt=segAt;root.beepList=beepList;root.wavBytes=wavBytes;root.fmtTime=fmtTime;
})(typeof module==='object'&&module.exports?module.exports:(window.ETCore={}));
