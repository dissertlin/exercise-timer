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
