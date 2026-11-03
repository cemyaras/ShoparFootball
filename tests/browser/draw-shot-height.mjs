import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { open, size, evaluate, send, wait, errors, close, world } from './browser.mjs';
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
let checks = 0;
function check(pass, label) { assert.ok(pass, label); checks++; }
async function screen(name) {
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(new URL(`../../test-results/browser/${name}.png`,import.meta.url),Buffer.from(data,'base64'));
}
async function until(expression) {
  for (let i = 0; i < 800; i++) { if (await evaluate(expression)) return; await wait(10); }
  throw Error(`Timed out: ${expression}`);
}
async function pointer(type, p, mobile) {
  if (mobile) await send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ ...p, id: 1 }] });
  else await send('Input.dispatchMouseEvent', { type: { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[type], ...p, button: 'left', buttons: type === 'up' ? 0 : 1, clickCount: 1 });
}
async function tap(id, mobile) {
  const p = await evaluate(`(()=>{const e=document.getElementById('${id}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await pointer('down', p, mobile); await pointer('up', p, mobile);
}
const cases = [
  { x: 415, height: 90, kind: 'goal', bend: 40 }, { x: 500, height: 60, kind: 'save' },
  { x: 400, height: 90, kind: 'post' }, { x: 415, height: 112, kind: 'bar' },
  { x: 500, height: 140, kind: 'high' }, { x: 500, height: 90, chip: true, kind: 'goal' },
  { x: 500, height: 30, chip: true, kind: 'save' }, { x: 500, height: 140, chip: true, kind: 'high' }
];
try {
  for (const [width,height,mobile] of [[1280,900,false],[390,844,true],[568,320,true]]) {
    await size(width,height,mobile); await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1}); await open(url);
    for (const attempt of cases) {
      await evaluate('footballGame.startPractice(10)'); await until("footballGame.state==='AIMING'");
      check(await evaluate("document.getElementById('chip-button').getAttribute('aria-pressed')==='false'&&!document.getElementById('chip-button').disabled"), 'CHIP defaults off');
      check(await evaluate("(()=>{const r=document.getElementById('chip-button').getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth&&r.bottom<=innerHeight})()"), 'Touch control fits viewport');
      if (attempt.chip) await tap('chip-button',mobile);
      check(await evaluate(`footballGame.controller.chip===${Boolean(attempt.chip)}&&document.getElementById('chip-button').getAttribute('aria-pressed')==='${Boolean(attempt.chip)}'`), 'Native CHIP toggle');
      const start = await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y})'), endY = 84-attempt.height*.52;
      await pointer('down',await world(start.x,start.y),mobile);
      for(let i=1;i<=30;i++) {
        const t=i/30;
        await pointer('move',await world(start.x+(attempt.x-start.x)*t+(attempt.bend||0)*Math.sin(Math.PI*t),start.y+(endY-start.y)*t),mobile);
      }
      await wait(40);
      const planned = await evaluate("(()=>{const c=footballGame.controller,s=c.shot;return{end:s.target,peak:Math.max(...s.preview.map(p=>p.z)),disabled:document.getElementById('chip-button').disabled}})()");
      check(planned.disabled&&planned.peak>1, 'Height-aware preview with locked control');
      check(Math.abs(planned.end.y-planned.end.z*.52-endY)<.05, 'Projected endpoint matches drawn goal height');
      if(attempt.kind==='goal') await screen(`draw-shot-${attempt.chip?'chip':'high'}-preview-${width}`);
      await pointer('up',await world(attempt.x,endY),mobile);
      const released=await evaluate('({state:footballGame.state,contact:footballGame.contact,pointer:footballGame.pointer,points:footballGame.controller.points?.length,shot:!!footballGame.controller.shot,toast:document.getElementById("toast").textContent})');
      check(released.state==='BALL_IN_MOTION'&&released.contact===null&&!released.pointer, `Release shoots immediately ${width} ${JSON.stringify(attempt)} ${JSON.stringify(released)}`);
      const result = await evaluate(`(()=>{
        const g=footballGame,c=g.controller,preview=c.shot.preview;cancelAnimationFrame(g.raf);let maxError=0,samples=0;
        for(let i=0;i<3000&&g.state!=='RESULT';i++){
          g.update(1/120);
          if(g.state==='BALL_IN_MOTION'&&!g.pendingResult&&g.ball.age<=preview.at(-1).time){
            let index=1;while(index<preview.length-1&&preview[index].time<g.ball.age)index++;
            const a=preview[index-1],b=preview[index],t=(g.ball.age-a.time)/(b.time-a.time);
            const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
            maxError=Math.max(maxError,Math.hypot(g.ball.x-x,g.ball.y-y,g.ball.z-z));samples++;
          }
        }
        g.render();g.lastTime=null;g.raf=requestAnimationFrame(g.frame);
        return{kind:g.resolution?.kind,crossing:g.resolution?.crossing,cleared:g.flight?.clearedKeeper,maxError,samples};
      })()`);
      check(result.kind===attempt.kind, `Physical ${attempt.kind}, chip ${Boolean(attempt.chip)}`);
      check(result.samples>10&&result.maxError<.2, `Flight follows height preview, error ${result.maxError}`);
      if(['goal','bar','post','high'].includes(attempt.kind)) check(await evaluate('footballGame.controller.context.physics.goalLineOutcome('+result.crossing.x+','+result.crossing.z+')')===attempt.kind, 'Outcome follows real crossing geometry');
      if(attempt.chip&&attempt.kind==='goal') {
        check(result.cleared, 'Lob clears keeper below bar');
        await tap('next-button',mobile); await until("footballGame.state==='AIMING'");
        check(await evaluate('!footballGame.controller.chip&&!footballGame.controller.shot'), 'Retry resets CHIP');
      }
    }
    await evaluate('footballGame.startPractice(10)'); await until("footballGame.state==='AIMING'");
    await tap('help-button',mobile);
    check(await evaluate("document.getElementById('help-detail').textContent.includes('dashed line')&&document.getElementById('help-guide').textContent.includes('CHIP')"), 'Drawing help explains height and shadow');
    await tap('help-done',mobile);
    await evaluate('footballGame.startPractice(0)'); await until("footballGame.state==='AIMING'");
    check(await evaluate("getComputedStyle(document.getElementById('chip-button')).display==='none'"), 'CHIP absent from original highlight');
    await tap('help-button',mobile);
    check(await evaluate("document.getElementById('help-steps').textContent.includes('Tap the ball')&&!document.getElementById('help-guide').textContent.includes('CHIP')"), 'Original help restored');
    await tap('help-done',mobile);
  }
  check(errors.length===0,errors.join('\n')); console.log(`${checks} browser checks passed`);
} finally {close();}
