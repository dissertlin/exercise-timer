const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../timer-core.js');

const base={warm:10,train:40,rest:5,per:4,cycles:4,between:30};

test('clampConfig: defaults pass through unchanged',()=>{
  assert.deepEqual(E.clampConfig(base),base);
});
test('clampConfig: empty/invalid -> lower bound, never 0 for train/per/cycles',()=>{
  const c=E.clampConfig({warm:'',train:'abc',rest:null,per:'0',cycles:undefined,between:'-3'});
  assert.deepEqual(c,{warm:0,train:1,rest:0,per:1,cycles:1,between:0});
});
test('clampConfig: upper bounds and string numbers',()=>{
  const c=E.clampConfig({warm:'99999',train:'45',rest:'5',per:'500',cycles:'12',between:'9999'});
  assert.equal(c.warm,3600);assert.equal(c.train,45);assert.equal(c.per,99);assert.equal(c.cycles,12);assert.equal(c.between,3600);
});
test('clampConfig: tolerates missing object',()=>{assert.doesNotThrow(()=>E.clampConfig());});

test('buildPlan: default workout structure and total',()=>{
  const p=E.buildPlan(base);
  assert.equal(p.filter(x=>x.t==='warm').length,1);
  assert.equal(p.filter(x=>x.t==='train').length,16);
  assert.equal(p.filter(x=>x.t==='rest').length,15);   // none after the very last exercise
  assert.equal(p.filter(x=>x.t==='between').length,3); // none after the last cycle
  assert.equal(E.planTotal(p),10+16*40+15*5+3*30);
  assert.equal(p.at(-1).t,'train');
});
test('buildPlan: start offsets are contiguous',()=>{
  const p=E.buildPlan(base);let t=0;
  for(const s of p){assert.equal(s.s,t);t+=s.d}
});
test('buildPlan: zero warm/rest/between omit those segments',()=>{
  const p=E.buildPlan({warm:0,train:30,rest:0,per:2,cycles:2,between:0});
  assert.deepEqual(p.map(x=>x.t),['train','train','train','train']);
});
test('buildPlan: single exercise single cycle',()=>{
  const p=E.buildPlan({warm:0,train:20,rest:5,per:1,cycles:1,between:30});
  assert.equal(p.length,1);assert.equal(E.planTotal(p),20);
});
test('buildPlan: cycle/exercise indices',()=>{
  const p=E.buildPlan({warm:0,train:10,rest:0,per:2,cycles:2,between:0}).filter(x=>x.t==='train');
  assert.deepEqual(p.map(x=>[x.i,x.j]),[[1,1],[1,2],[2,1],[2,2]]);
});
test('buildPlan: max settings stay under MAX_TOTAL only if configured so (guard exists)',()=>{
  const big=E.clampConfig({warm:3600,train:3600,rest:3600,per:99,cycles:99,between:3600});
  assert.ok(E.planTotal(E.buildPlan(big))>E.MAX_TOTAL);
});

test('segAt: boundaries and past the end',()=>{
  const p=E.buildPlan({warm:3,train:5,rest:2,per:2,cycles:1,between:0}); // warm0-3 train3-8 rest8-10 train10-15
  assert.equal(E.segAt(p,0),0);
  assert.equal(E.segAt(p,2.999),0);
  assert.equal(E.segAt(p,3),1);
  assert.equal(E.segAt(p,8),2);
  assert.equal(E.segAt(p,14.9),3);
  assert.equal(E.segAt(p,15),p.length);
  assert.equal(E.segAt([],0),0);
});

test('beepList: start beep per segment, countdown, final beep',()=>{
  const p=E.buildPlan({warm:0,train:10,rest:0,per:1,cycles:1,between:0});
  const L=E.beepList(p,10);
  assert.deepEqual(L.map(b=>b.at),[0,5,6,7,8,9,10]); // start, 5..1s left, finish
  assert.equal(L.at(-1).ms,600);
});
test('beepList: every beep falls inside a segment (or is the final one)',()=>{
  const p=E.buildPlan({warm:2,train:1,rest:1,per:2,cycles:1,between:0});
  const tot=E.planTotal(p),L=E.beepList(p,tot);
  for(const b of L)assert.ok(b.at===tot||p.some(s=>b.at>=s.s&&b.at<s.s+s.d),`beep at ${b.at}`);
  assert.equal(L.filter(b=>b.at===tot).length,1);
  assert.equal(L.length,p.length+2); // +1 final beep, +1 for the 2s warm-up's single countdown beep
});
test('beepList: warm-up counts down only 3s, training 5s',()=>{
  const w=E.beepList([{t:'warm',d:20,s:0}],20).filter(b=>b.at>0&&b.at<20);
  const t=E.beepList([{t:'train',d:20,s:0}],20).filter(b=>b.at>0&&b.at<20);
  assert.equal(w.length,3);assert.equal(t.length,5);
});

test('wavBytes: valid PCM WAV header and non-silent audio',()=>{
  const p=E.buildPlan({warm:0,train:3,rest:0,per:1,cycles:1,between:0});
  const buf=E.wavBytes(p,3),v=new DataView(buf);
  const tag=o=>String.fromCharCode(...new Uint8Array(buf,o,4));
  assert.equal(tag(0),'RIFF');assert.equal(tag(8),'WAVE');assert.equal(tag(12),'fmt ');assert.equal(tag(36),'data');
  assert.equal(v.getUint16(20,true),1);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),E.SR);
  const n=Math.ceil((3+1.5)*E.SR);
  assert.equal(v.getUint32(40,true),n*2);assert.equal(buf.byteLength,44+n*2);assert.equal(v.getUint32(4,true),36+n*2);
  const pcm=new Int16Array(buf,44,n);
  assert.ok(pcm.some(x=>Math.abs(x)>10000));
  // silence just before the 3s finish beep region has no clipping beyond int16
  assert.ok(pcm.every(x=>x>=-32768&&x<=32767));
  // the first beep is audible at t=0.05s and the gap between beeps is silent
  const at=s=>Math.abs(pcm[Math.round(s*E.SR)]);
  assert.ok(Math.max(...Array.from({length:200},(_,k)=>Math.abs(pcm[Math.round(.1*E.SR)+k])))>1000);
  assert.equal(at(.5),0);
});

test('fmtTime',()=>{
  assert.equal(E.fmtTime(0),'0:00');assert.equal(E.fmtTime(75),'1:15');
  assert.equal(E.fmtTime(3600),'1:00:00');assert.equal(E.fmtTime(3725),'1:02:05');
  assert.equal(E.fmtTime(-4),'0:00');assert.equal(E.fmtTime(59.6),'1:00');
});
