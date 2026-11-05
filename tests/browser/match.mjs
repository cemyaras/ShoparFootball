// Focused Match Mode and new-highlight browser coverage using native pointer input.
import assert from 'node:assert/strict';
import { open, size, evaluate, send, wait, errors, close, world, shotPull, screen, click, drag } from './browser.mjs';
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
let checks = 0;
function check(pass, label) { assert.ok(pass, label); checks++; }
async function until(expression) {
  for (let i = 0; i < 800; i++) { if (await evaluate(expression)) return; await wait(10); }
  throw new Error(`Timed out: ${expression}`);
}
async function tap(id, mobile) {
  const p = await evaluate(`(()=>{const e=document.getElementById('${id}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (mobile) {
    await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...p,id:1}]});
    await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  } else await click(p.x,p.y);
}
try {
  for (const [width,height,mobile] of [[1280,900,false],[390,844,true],[568,320,true]]) {
    await size(width,height,mobile); await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1}); await open(url);
    check(await evaluate("(()=>{const r=document.getElementById('match-button').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"), 'Match entry fits');
    await tap('match-button',mobile);
    check(await evaluate('!!footballGame.session.match&&footballGame.session.match.score.home===0&&footballGame.session.match.score.away===0'), 'Native match entry');
    // Play a complete match through the real simulation; accelerate frame updates only.
    const match = await evaluate(`(()=>{
      const g=footballGame;cancelAnimationFrame(g.raf);g.startMatch(()=>.9);let scenes=0;
      while(g.state!=='SESSION_SUMMARY'&&scenes<9){
        g.update(.9);
        if(g.state==='INTERCEPTION'){g.interceptTarget={x:500,y:320};for(let i=0;i<1000&&g.state==='INTERCEPTION';i++)g.update(1/120);}
        if(g.state==='AIMING'){const dx=800-g.ball.x,dy=84-g.ball.y,d=Math.hypot(dx,dy);g.kick={dx:dx/d,dy:dy/d,power:1};g.contact={x:0,y:0,age:1,timedOut:false};g.executeKick();}
        for(let i=0;i<3000&&g.state!=='RESULT';i++)g.update(1/120);
        if(g.state!=='RESULT')throw Error('Unresolved '+g.state);scenes++;g.nextHighlight();
      }
      g.render();return{scenes,state:g.state,result:document.getElementById('summary-title').textContent,score:g.session.match.score};
    })()`);
    check(match.scenes===8&&match.state==='SESSION_SUMMARY'&&match.result==='DEFEAT', 'Eight-scene physical match');
    check(await evaluate("(()=>{const r=document.getElementById('again-button').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"), 'Replay fits');
    await screen(`match-summary-${width}`); await tap('again-button',mobile);
    check(await evaluate('footballGame.session.match.history.length===0&&footballGame.session.match.score.away===0'), 'Replay resets match');
    // Resume normal animation and win the new keeper highlight with native input.
    await evaluate("footballGame.session.memoryFor('save-the-shot').variant=0;footballGame.startPractice(8);footballGame.lastTime=null;footballGame.raf=requestAnimationFrame(footballGame.frame)");
    await until("footballGame.controller.phase==='flight'"); await wait(100);
    const p=await world(500,240), end={x:p.x-65,y:p.y};
    if(mobile){
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else await drag(p.x,p.y,end.x,end.y);
    await until("footballGame.state==='RESULT'");
    check(await evaluate("footballGame.resolution.kind==='shot_saved'&&!footballGame.session.match"), 'Native open-play save');
    await evaluate('footballGame.startPractice(9)'); await until("footballGame.state==='AIMING'");
    const b=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y,pull:footballGame.maxDrag()*footballGame.view.scale})');
    const {start,end:target}=await shotPull(b,420,84);
    if(mobile){
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
      for(let i=1;i<=8;i++)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(target.x-start.x)*i/8,y:start.y+(target.y-start.y)*i/8,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else await drag(start.x,start.y,target.x,target.y);
    await until("footballGame.state==='BALL_CONTACT'");
    const cg=await evaluate('footballGame.contactGeometry()'),contact=await world(cg.x,cg.y);
    if(mobile){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...contact,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await click(contact.x,contact.y);
    await until("footballGame.state==='RESULT'");
    check(await evaluate("footballGame.resolution.kind==='goal'"), 'Native penalty goal');
    await evaluate('footballGame.beginSession()'); check(await evaluate('!footballGame.session.match&&footballGame.practiceIndex===null&&footballGame.session.seriesIndices.length===10&&footballGame.definitions.length===12'), 'Play All remains available');
  }
  check(errors.length===0, errors.join('\n')); console.log(`${checks} browser checks passed`);
} finally { close(); }
