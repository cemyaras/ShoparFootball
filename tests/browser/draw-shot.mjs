import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {open,size,evaluate,send,wait,errors,close,world,click} from './browser.mjs';
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
let checks = 0;
function check(pass, label) { assert.ok(pass, label); checks++; }
async function screen(name) {
  const data=await evaluate("footballGame.canvas.toDataURL('image/png').split(',')[1]");
  await fs.writeFile(new URL(`../../test-results/browser/${name}.png`,import.meta.url),Buffer.from(data,'base64'));
}
async function until(expression) {
  for (let i=0;i<600;i++) { if(await evaluate(expression)) return; await wait(10); }
  throw Error(`Timed out: ${expression}`);
}
async function pointer(type, point, mobile) {
  if(mobile) await send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{...point,id:1}]});
  else await send('Input.dispatchMouseEvent',{type:{down:'mousePressed',move:'mouseMoved',up:'mouseReleased'}[type],...point,button:'left',buttons:type==='up'?0:1,clickCount:1});
}
async function select(mobile) {
  await evaluate('footballGame.openHighlightPicker()');
  const p=await evaluate("(()=>{const e=document.querySelector('[data-highlight=\"10\"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await pointer('down',p,mobile);await pointer('up',p,mobile);
  await until("footballGame.state==='AIMING'");
}
try {
  for(const [width,height,mobile] of [[1280,900,false],[390,844,true],[568,320,true]]) {
    await size(width,height,mobile);await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});await open(url);
    check(await evaluate("document.querySelectorAll('[data-highlight]').length===11&&document.getElementById('play-button').textContent.includes('10')"),'Catalog and Play All counts');
    for(const [x,bend,kind] of [[415,40,'goal'],[420,0,'save'],[530,0,'blocked'],[800,0,'wide']]) {
      await select(mobile);
      const start=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y})');
      await pointer('down',await world(start.x,start.y),mobile);
      for(let i=1;i<=20;i++) {const t=i/20;await pointer('move',await world(start.x+(x-start.x)*t+bend*Math.sin(Math.PI*t),start.y+(84-start.y)*t),mobile);}
      await wait(40); // Let coalesced native moves reach the displayed frame before comparing release.
      check(await evaluate('footballGame.controller.getPresentation().shotPreview?.length>2'),'Bounded route preview');
      if(bend) await screen(`draw-shot-preview-${width}`);
      const preview = await evaluate('JSON.stringify(footballGame.controller.route)');
      await pointer('up',await world(x,84),mobile);
      const difference=await evaluate(`(()=>{
        const before=${preview},after=footballGame.controller.route,C=ShoparFootball.DrawShotController;
        let error=Math.abs(before.length-after.length);
        for(let i=0;i<=64;i++){
          const a=C.pointAt(before,before.length*i/64),b=C.pointAt(after,after.length*i/64);
          error=Math.max(error,Math.hypot(a.x-b.x,a.y-b.y));
        }
        return error;
      })()`);
      check(difference<.001,`Release uses the displayed path at ${width}, ${kind}, difference ${difference}`);
      check(await evaluate("footballGame.state==='BALL_IN_MOTION'&&footballGame.contact===null&&!footballGame.pointer"),'Release directly shoots');
      const result=await evaluate("(()=>{const g=footballGame;cancelAnimationFrame(g.raf);for(let i=0;i<1800&&g.state!=='RESULT';i++)g.update(1/120);g.render();g.lastTime=null;g.raf=requestAnimationFrame(g.frame);return{kind:g.resolution?.kind,z:g.ball.z}})()");
      check(result.kind===kind&&result.z===0,`Physical ${kind}`);
      check(await evaluate("document.getElementById('next-button').textContent.includes('RETRY')"),'Practice retry');
    }
    await select(mobile);
    const origin=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y})');
    await pointer('down',await world(origin.x,origin.y),mobile);
    for(let i=1;i<=60;i++) {
      const t=i/60;
      await pointer('move',await world(origin.x+(500-origin.x)*t+45*Math.sin(2*Math.PI*t),origin.y+(84-origin.y)*t),mobile);
    }
    await wait(40);
    check(await evaluate(`(()=>{const r=footballGame.controller.route;return r&&r.preview.every(p=>p.x>=500-.01&&p.x<=${origin.x}+.01)})()`),'Balanced S drawing resolves to a straight interpreted preview');
    await screen(`draw-shot-s-curve-${width}`);
    await pointer('up',await world(500,84),mobile);
    await until("footballGame.state==='BALL_IN_MOTION'");
    const follows=await evaluate(`(()=>{
      const g=footballGame,c=g.controller,initial=g.state;cancelAnimationFrame(g.raf);let samples=0,error=0;
      for(let i=0;i<1800&&g.state!=='RESULT';i++){
        g.update(1/120);
        if(g.state==='BALL_IN_MOTION'&&!g.pendingResult){
          const p=ShoparFootball.DrawShotController.pointAt(c.route,c.travel);
          error=Math.max(error,Math.hypot(g.ball.x-p.x,g.ball.y-p.y));samples++;
        }
      }
      g.render();g.lastTime=null;g.raf=requestAnimationFrame(g.frame);
      return {samples,error,kind:g.resolution?.kind,initial};
    })()`);
    check(follows.samples>30&&follows.error<.00001,`Flight follows the interpreted preview ${width}: ${JSON.stringify(follows)}`);
    check(['goal','save','blocked','wide','post'].includes(follows.kind),'Curved shot resolves through physical contact');
    await select(mobile);
    const b=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y})');
    await pointer('down',await world(b.x,b.y),mobile);await pointer('move',await world(415,84),mobile);
    await evaluate('footballGame.openHighlightPicker()');await pointer('up',await world(415,84),mobile);
    check(await evaluate("footballGame.state==='AIMING'&&!footballGame.controller.route&&!footballGame.kick&&!footballGame.pointer"),'Modal cancels held stroke');
    await evaluate('footballGame.beginSession()');
    check(await evaluate("footballGame.session.seriesIndices.length===10&&!footballGame.session.match"),'Return to Play All');
    await until("footballGame.state==='AIMING'");
    const s=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y})');
    const p=await world(s.x,s.y);await pointer('down',p,mobile);await pointer('move',{x:p.x,y:p.y+65},mobile);await pointer('up',{x:p.x,y:p.y+65},mobile);
    check(await evaluate("footballGame.state==='BALL_CONTACT'"),'Original shot still enters contact');
  }
  check(errors.length===0,errors.join('\n'));console.log(`${checks} browser checks passed`);
} finally {close();}
