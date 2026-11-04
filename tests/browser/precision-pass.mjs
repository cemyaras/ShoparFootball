// Optional Playwright flow; PLAYWRIGHT_MODULE may point to an external playwright/index.mjs.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium,webkit,devices}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.GAME_URL||new URL('../../index.html',import.meta.url).href;
const artifacts=await mkdtemp(join(tmpdir(),'shopar-precision-'));
const checks=[],errors=[];
const check=(pass,label,details)=>checks.push({pass:Boolean(pass),label,...(pass?{}:{details})});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function read(page){return page.evaluate(()=>{
  const g=footballGame,c=g.controller,r=g.canvas.getBoundingClientRect();
  return JSON.parse(JSON.stringify({state:g.state,phase:c.phase,power:c.power,holding:c.holding,target:c.target,finger:c.finger,
    ball:g.ball,mates:g.mates,defenders:g.defenders,elapsed:c.elapsed,pointer:g.pointer,captured:g.pointer&&g.canvas.hasPointerCapture(g.pointer.id),
    view:g.view,rect:{left:r.left,top:r.top}}));
});}
const screen=(s,p)=>({x:Math.round(s.rect.left+s.view.x+p.x*s.view.scale),y:Math.round(s.rect.top+s.view.y+p.y*s.view.scale)});
async function observe(page){await page.evaluate(()=>{
  window.precisionEvents=[];
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchend','click','dblclick','contextmenu','selectstart'])document.addEventListener(type,e=>precisionEvents.push({type,x:e.clientX,y:e.clientY,trusted:e.isTrusted,pointerType:e.pointerType,prevented:e.defaultPrevented}));
});}
async function setup(page){await page.goto(url);await page.waitForFunction(()=>window.footballGame);await page.evaluate(()=>{footballGame.startPractice(11);footballGame.update(.9);});await observe(page);await page.clock.runFor(32);return read(page);}
async function driver(page,touch,isSafari){
  // WebKit's native protocol supplements Playwright's public tap-only touch API.
  const session=touch?(isSafari?page._connection.toImpl(page).delegate._pageProxySession:await page.context().newCDPSession(page)):null;
  let point;
  return async(type,p)=>{
    if(p)point={x:Math.round(p.x),y:Math.round(p.y),id:1};
    if(touch)await session.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'}[type],touchPoints:['up','cancel'].includes(type)&&!isSafari?[]:[point]});
    else if(type==='down'){await page.mouse.move(point.x,point.y);await page.mouse.down();}
    else if(type==='move')await page.mouse.move(point.x,point.y);
    else if(type==='up')await page.mouse.up();
    else{await page.evaluate(()=>footballGame.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:footballGame.pointer.id,bubbles:true})));await page.mouse.up();}
    for(let i=0;i<125;i++){
      const ready=await page.evaluate(({type,point})=>{
        if(type==='cancel'||type==='up')return !footballGame.pointer;
        const event=precisionEvents.filter(e=>e.type==={down:'pointerdown',move:'pointermove'}[type]).at(-1);
        return event&&Math.abs(event.x-point.x)<.1&&Math.abs(event.y-point.y)<.1;
      },{type,point});
      if(ready)return;await sleep(8);
    }
    throw Error(`Native ${type} did not arrive`);
  };
}
const chrome=await chromium.launch({channel:'chrome',headless:true}),safari=await webkit.launch({headless:true});
try{
  for(const [name,browser,touch,isSafari]of[['Desktop Chrome',chrome,false,false],['Pixel 7',chrome,true,false],['iPhone 13',safari,true,true]]){
    const context=await browser.newContext({...devices[name]}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
    await page.clock.install({time:new Date('2026-11-05T00:00:00Z')});await page.clock.pauseAt(new Date('2026-11-05T00:00:01Z'));
    const pointer=await driver(page,touch,isSafari),tap=selector=>touch?page.locator(selector).tap({force:true}):page.locator(selector).click({force:true});
    await page.goto(url);await page.waitForFunction(()=>window.footballGame);
    check(await page.locator('[data-highlight]').count()===12,`${name}: twelve practice entries`);
    check((await page.locator('#play-button').textContent()).includes('10'),`${name}: Play All still contains ten highlights`);
    await tap('#select-highlight-button');await page.locator('[data-highlight="11"]').evaluate(e=>e.scrollIntoView({block:'nearest'}));await tap('[data-highlight="11"]');await page.clock.runFor(1000);
    check(await page.evaluate(()=>footballGame.index===11&&footballGame.state==='DEFENDING'&&footballGame.controller.phase==='aiming'),`${name}: native picker opens Precision Pass`);
    for(const [kind,target,hold,expected]of[['normal',{x:650,y:450},600,'pass_complete'],['through',{x:700,y:410},600,'pass_complete'],
      ['short',{x:650,y:450},32,'pass_short'],['overhit',{x:650,y:450},1200,'pass_missed'],['interception',{x:650,y:450},300,'pass_intercepted']]){
      const start=await setup(page),point=screen(start,target);
      await pointer('down',point);await page.clock.runFor(hold);const aim=await read(page);
      check(aim.captured&&aim.holding&&aim.phase==='aiming',`${name}/${kind}: target captured`);
      check(Math.abs(aim.power-Math.min(hold/1200,1))<.02,`${name}/${kind}: time-based pass power`,aim.power);
      check(Math.abs(aim.target.x-target.x)*aim.view.scale<1.1&&Math.abs(aim.target.y-target.y)*aim.view.scale<1.1,`${name}/${kind}: selected target has no hidden coordinate shift`);
      if(hold>=300)check([...aim.mates,...aim.defenders].every((a,i)=>Math.hypot(a.x-[...start.mates,...start.defenders][i].x,a.y-[...start.mates,...start.defenders][i].y)>3),`${name}/${kind}: teammates and defenders move while holding`);
      if(kind==='normal'){await page.evaluate(()=>footballGame.render());await page.screenshot({path:join(artifacts,`${name.replaceAll(' ','-')}-aim.png`)});}
      await pointer('up');const flight=await read(page);
      check(!flight.pointer&&flight.phase==='flight'&&flight.power===aim.power,`${name}/${kind}: release uses the displayed power and target`);
      const result=await page.evaluate(()=>{
        const g=footballGame,c=g.controller;for(let i=0;i<800&&!g.pendingResult;i++)g.update(1/120);
        const contact=c.owner?{ball:{x:g.ball.x,y:g.ball.y},foot:g.possessionPosition(c.owner)}:null;
        const kind=g.resolution?.kind;for(let i=0;i<800&&g.state!=='RESULT';i++)g.update(1/120);g.render();
        return{kind,contact,state:g.state,passes:g.stats.passes,misses:g.stats.misses};
      });
      check(result.kind===expected&&result.state==='RESULT',`${name}/${kind}: physical outcome`,result);
      check(result.passes===(expected==='pass_complete'?1:0)&&result.misses===(expected==='pass_complete'?0:1),`${name}/${kind}: statistics count once`);
      if(result.contact)check(Math.hypot(result.contact.ball.x-result.contact.foot.x,result.contact.ball.y-result.contact.foot.y)<19,`${name}/${kind}: reception/interception follows physical contact`,result.contact);
      check((await page.locator('#next-button').textContent()).includes('RETRY'),`${name}/${kind}: practice result retries`);
    }
    await tap('#next-button');await page.clock.runFor(1000);check((await read(page)).phase==='aiming',`${name}: native retry resets the pass`);
    const start=await setup(page);await pointer('down',screen(start,{x:700,y:410}));await page.clock.runFor(400);
    await pointer('move',screen(start,{x:730,y:380}));const before=(await read(page)).power;await page.clock.runFor(200);
    check((await read(page)).power>before,`${name}: dragging adjusts aim while power keeps charging`);
    await pointer('cancel');const cancelled=await read(page);check(!cancelled.pointer&&!cancelled.holding&&!cancelled.target&&cancelled.phase==='aiming',`${name}: pointer cancellation never passes`);
    await tap('#help-button');check((await page.locator('#help-detail').textContent()).includes('physically reach'),`${name}: help explains physical reception`);await page.keyboard.press('Escape');
    await page.evaluate(()=>{precisionEvents.length=0;});
    await pointer('down',screen(start,{x:650,y:450}));await pointer('up');await pointer('down',screen(start,{x:650,y:450}));await pointer('up');
    check(await page.evaluate(()=>String(getSelection())===''&&visualViewport.scale===1&&!precisionEvents.some(e=>['contextmenu','selectstart','pointercancel'].includes(e.type)&&e.trusted&&!e.prevented)),`${name}: rapid taps do not invoke browser gestures`);
    if(touch)check(await page.evaluate(()=>{const events=precisionEvents.filter(e=>['touchstart','touchend'].includes(e.type));return events.length===4&&events.every(e=>e.prevented);}),`${name}: existing touch guards protect the new highlight`);
    check(await page.evaluate(()=>footballGame.session.seriesIndices.length===10&&!footballGame.session.seriesIndices.includes(11)),`${name}: Precision Pass remains practice-only`);
    await context.close();
  }
  check(errors.length===0,'No application exceptions',errors);
}finally{await chrome.close();await safari.close();await writeFile(join(artifacts,'results.json'),JSON.stringify({checks,errors},null,2));}
assert.equal(checks.filter(c=>!c.pass).length,0,JSON.stringify(checks.filter(c=>!c.pass),null,2));
console.log(`${checks.length} Playwright checks passed. Artifacts: ${artifacts}`);
