/* Browser tests (Playwright + fake clock). Skipped when Playwright/Chromium isn't installed. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let chromium=null;
try{({chromium}=require('playwright'))}catch{}

const URL_=pathToFileURL(path.join(__dirname,'..','index.html')).href;
let browser;
test.before(async()=>{if(chromium)try{browser=await chromium.launch()}catch{browser=null}});
test.after(async()=>{await browser?.close()});

async function open(settings){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(URL_);
  if(settings){
    for(const[k,v]of Object.entries(settings)){await page.fill('#'+k,String(v))}
    await page.dispatchEvent('#train','input');
  }
  return{ctx,page,errors,txt:s=>page.textContent(s)};
}
const guard=(name,fn)=>test(name,async t=>{if(!browser)return t.skip('playwright/chromium unavailable');await fn()});

guard('initial state shows default total time',async()=>{
  const{ctx,page,errors}=await open();
  assert.equal(await page.textContent('#sum'),'總時間 13分35秒'); // 10 + 16*40 + 15*5 + 3*30 = 815s
  assert.match(await page.textContent('#sum'),/總時間 \d+分\d+秒/);
  assert.deepEqual(errors,[]);await ctx.close();
});

guard('runs a full workout: phases, countdown, done',async()=>{
  const{ctx,page,errors,txt}=await open({warm:2,train:3,rest:2,per:2,cycles:1,between:0});
  await page.click('#start');
  assert.equal(await txt('#phase'),'熱身');assert.equal(await txt('#time'),'2');
  await page.clock.runFor(2100);
  assert.equal(await txt('#phase'),'訓練');
  assert.match(await txt('#info'),/循環 1\/1 · 動作 1\/2/);
  await page.clock.runFor(3000);
  assert.equal(await txt('#phase'),'休息');
  await page.clock.runFor(2000);
  assert.match(await txt('#info'),/動作 2\/2/);
  await page.clock.runFor(3500);
  assert.match(await txt('#phase'),/完成/);
  assert.equal(await txt('#start'),'開始');
  assert.equal(await page.isDisabled('#train'),false);
  assert.deepEqual(errors,[]);await ctx.close();
});

guard('pause freezes time and resume continues; settings stay locked while paused',async()=>{
  const{ctx,page}=await open({warm:0,train:10,rest:0,per:1,cycles:1,between:0});
  await page.click('#start');
  await page.clock.runFor(3100);
  await page.click('#start'); // pause
  assert.equal(await page.textContent('#start'),'繼續');
  const frozen=await page.textContent('#time');
  await page.clock.runFor(5000);
  assert.equal(await page.textContent('#time'),frozen);
  assert.equal(await page.isDisabled('#train'),true);
  await page.click('#start');
  await page.clock.runFor(2000);
  assert.notEqual(await page.textContent('#time'),frozen);
  await ctx.close();
});

guard('display keeps the original plan even if stored inputs change (no desync)',async()=>{
  const{ctx,page}=await open({warm:0,train:5,rest:0,per:2,cycles:3,between:0});
  await page.click('#start');
  await page.click('#start'); // pause
  await page.evaluate(()=>{document.getElementById('cycles').disabled=false;document.getElementById('cycles').value='9'});
  await page.click('#skip');
  assert.match(await page.textContent('#info'),/循環 1\/3/);
  await ctx.close();
});

guard('skip advances a segment; skipping the last one finishes with correct button label',async()=>{
  const{ctx,page}=await open({warm:5,train:5,rest:0,per:1,cycles:1,between:0});
  await page.click('#start');
  await page.click('#skip');
  assert.equal(await page.textContent('#phase'),'訓練');
  await page.click('#start'); // pause
  await page.click('#skip');  // skip last while paused
  assert.match(await page.textContent('#phase'),/完成/);
  assert.equal(await page.textContent('#start'),'開始');
  assert.equal(await page.isDisabled('#train'),false);
  await ctx.close();
});

guard('reset returns to idle and unlocks settings',async()=>{
  const{ctx,page}=await open({warm:0,train:10,rest:0,per:1,cycles:1,between:0});
  await page.click('#start');await page.clock.runFor(2000);
  await page.click('#reset');
  assert.equal(await page.textContent('#phase'),'準備好了');
  assert.equal(await page.textContent('#start'),'開始');
  assert.equal(await page.isDisabled('#train'),false);
  await ctx.close();
});

guard('invalid inputs (0 / empty) are clamped, never produce an empty or 0-second plan',async()=>{
  const{ctx,page,errors}=await open({warm:0,train:0,rest:0,per:0,cycles:0,between:0});
  assert.equal(await page.textContent('#sum'),'總時間 0分1秒');
  await page.click('#start');
  assert.equal(await page.textContent('#phase'),'訓練');
  assert.deepEqual(errors,[]);await ctx.close();
});

guard('over-long plans are refused with a warning',async()=>{
  const{ctx,page}=await open({warm:0,train:3600,rest:0,per:99,cycles:99,between:0});
  assert.match(await page.textContent('#sum'),/超過上限/);
  await page.click('#start');
  assert.equal(await page.textContent('#phase'),'準備好了');
  await ctx.close();
});

guard('settings persist across reloads',async()=>{
  const{ctx,page}=await open({train:33});
  await page.reload();
  assert.equal(await page.inputValue('#train'),'33');
  await ctx.close();
});

guard('a11y: roles, labels, live region and progressbar values',async()=>{
  const{ctx,page}=await open({warm:0,train:10,rest:0,per:1,cycles:1,between:0});
  assert.equal(await page.getAttribute('#time','role'),'timer');
  assert.equal(await page.getAttribute('#bar','role'),'progressbar');
  assert.equal(await page.getAttribute('#sr','aria-live'),'polite');
  await page.click('#start');
  assert.match(await page.textContent('#sr'),/訓練/);
  await page.clock.runFor(5100);
  assert.ok(Number(await page.getAttribute('#bar','aria-valuenow'))>=40);
  await page.click('#start');
  assert.equal(await page.textContent('#sr'),'已暫停');
  assert.equal(await page.isVisible('#lockhint'),true);
  await ctx.close();
});

guard('keyboard: Space starts/pauses, S skips, R only resets when not running',async()=>{
  const{ctx,page}=await open({warm:0,train:5,rest:0,per:2,cycles:1,between:0});
  await page.evaluate(()=>document.activeElement.blur()); // fill() leaves focus in the input
  await page.keyboard.press('Space');
  assert.equal(await page.textContent('#start'),'暫停');
  await page.keyboard.press('s');
  assert.match(await page.textContent('#info'),/動作 2\/2/);
  await page.keyboard.press('r'); // running: ignored
  assert.equal(await page.textContent('#phase'),'訓練');
  await page.keyboard.press('Space'); // pause
  assert.equal(await page.textContent('#start'),'繼續');
  await page.keyboard.press('r');
  assert.equal(await page.textContent('#phase'),'準備好了');
  await ctx.close();
});

guard('keyboard: Space inside an input does not start the timer; Space on the Start button toggles exactly once',async()=>{
  const{ctx,page}=await open();
  await page.focus('#train');await page.keyboard.press('Space');
  assert.equal(await page.textContent('#start'),'開始');
  await page.focus('#start');await page.keyboard.press('Space');
  assert.equal(await page.textContent('#start'),'暫停');
  await ctx.close();
});

guard('mobile layout: no horizontal overflow at 320px and all buttons >= 44px tall',async()=>{
  const ctx=await browser.newContext({viewport:{width:320,height:640}});
  const page=await ctx.newPage();await page.goto(URL_);
  const over=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(over<=0,`overflow ${over}px`);
  for(const id of['start','skip','reset']){
    const b=await page.locator('#'+id).boundingBox();assert.ok(b.height>=44&&b.width>=44,id);
  }
  await ctx.close();
});

guard('contrast: every phase background has >= 4.5:1 against white text',async()=>{
  const{ctx,page}=await open();
  const cols=await page.evaluate(()=>['warm','train','rest','between','done'].map(k=>getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim()));
  const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
  for(const c of cols)assert.ok(1.05/(lum(c)+.05)>=4.5,`${c} too light for white text`);
  await ctx.close();
});
