import {open,size,evaluate,screen,send,wait,errors,close,world,click,drag,shotPull} from './browser.mjs';
const url=process.env.GAME_URL || new URL('../../index.html', import.meta.url).href,report=[];
const assert=(name,pass,detail)=>{report.push({name,pass,...(detail?{detail}:{})});if(!pass)console.error(name,detail);};
async function center(id){return evaluate(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);}
const touch=(type,p)=>send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1,radiusX:7,radiusY:7}]:[]});
async function tap(p){await touch('touchStart',p);await touch('touchEnd');await wait(40);}
async function fastForward(){return evaluate(`(()=>{const g=footballGame;cancelAnimationFrame(g.raf);for(let i=0;i<1600&&!['RESULT','AIMING','SESSION_SUMMARY'].includes(g.state);i++)g.update(1/120);g.lastTime=null;g.raf=requestAnimationFrame(g.frame);return {state:g.state,stats:{...g.stats},kind:g.pendingResult?.kind}})()`);}
async function kick(x,y,power){
 const b=await evaluate('({x:footballGame.ball.x,y:footballGame.ball.y,pull:footballGame.maxDrag()*footballGame.view.scale})');
 const {start:p,end}=await shotPull(b,x,y,power);
 await touch('touchStart',p);for(let i=1;i<=8;i++)await touch('touchMove',{x:p.x+(end.x-p.x)*i/8,y:p.y+(end.y-p.y)*i/8});await wait(60);await touch('touchEnd');await wait(240);
 assert('Native drag reaches contact',await evaluate("footballGame.state==='BALL_CONTACT'"));
 const cg=await evaluate('footballGame.contactGeometry()');await tap(await world(cg.x,cg.y));await wait(260);return fastForward();
}
try {
await size(390,844,true);await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await open(url);await tap(await center('play-button'));await wait(950);
let p=await world(500,348);await touch('touchStart',p);await touch('touchMove',{x:p.x,y:p.y+40});await wait(60);await touch('touchCancel');await wait(60);
assert('Cancelled finger drag never kicks',await evaluate("footballGame.state==='AIMING'&&!footballGame.pointer&&!footballGame.aim"));
await touch('touchStart',p);await touch('touchMove',{x:p.x,y:p.y+40});await wait(60);await evaluate('footballGame.resize()');
assert('Unchanged viewport notification preserves drag',await evaluate('footballGame.pointer!==null'));
await size(844,390,true);await wait(80);assert('Rotation cancels drag safely',await evaluate("footballGame.state==='AIMING'&&!footballGame.pointer&&!footballGame.aim&&document.getElementById('power-value').textContent==='—'"));await touch('touchCancel');
await size(390,844,true);await wait(80);
let outcome=await kick(420,84,1);assert('Corner goal from native touch',outcome.state==='RESULT'&&outcome.stats.goals===1,outcome);
await tap(await center('next-button'));await wait(950);assert('Native next highlight',await evaluate('footballGame.index===1'));
await kick(590,84,1);await tap(await center('next-button'));await wait(950);
outcome=await kick(318,323,.7);assert('Native through pass transfers control',outcome.state==='AIMING'&&outcome.stats.passes===1&&await evaluate('footballGame.controlled!==footballGame.player'),outcome);
await screen('mobile-native-receiver');await kick(580,84,1);await tap(await center('next-button'));await wait(950);
outcome=await kick(680,335,.6);assert('Native two-v-two pass',outcome.state==='AIMING'&&outcome.stats.passes===2,outcome);
outcome=await kick(379,425,.6);assert('Native return pass',outcome.state==='AIMING'&&outcome.stats.passes===3&&await evaluate('footballGame.controlled===footballGame.player'),outcome);
await kick(580,84,1);await tap(await center('next-button'));await wait(950);
await tap(await world(500,320));outcome=await fastForward();assert('Native off-ball receive',outcome.state==='AIMING'&&outcome.stats.receives===1,outcome);
await kick(420,84,1);await tap(await center('next-button'));await wait(950);
assert('Sixth highlight starts defense',await evaluate("footballGame.state==='DEFENDING'&&document.getElementById('chapter-number').textContent==='6/10'"));
await touch('touchStart',{x:100,y:650});
let green=false;for(let i=0;i<350;i++){if(await evaluate('footballGame.defense.timing().ready')){green=true;break;}await wait(20);}
assert('Held chase reaches a green release opportunity',green);
await touch('touchEnd');await wait(1500);
assert('Native defensive tackle wins the ball',await evaluate("footballGame.state==='RESULT'&&footballGame.resolution.kind==='ball_won'&&footballGame.stats.tackles===1"));
await tap(await center('next-button'));await wait(950);
assert('Seventh highlight starts pass interception',await evaluate("footballGame.index===6&&footballGame.state==='DEFENDING'&&document.getElementById('chapter-number').textContent==='7/10'"));
await tap(await world(550,340));
for(let i=0;i<350;i++){if(await evaluate("footballGame.state==='RESULT'"))break;await wait(20);}
assert('Native pass interception wins second defensive ball',await evaluate("footballGame.resolution.kind==='pass_won'&&footballGame.stats.tackles===2"));
await tap(await center('next-button'));await wait(950);
assert('Eighth highlight controls keeper',await evaluate("footballGame.index===7&&footballGame.controlled===footballGame.keeper"));
for(let i=0;i<200;i++){if(await evaluate("footballGame.controller.phase==='flight'"))break;await wait(10);}
p=await world(500,240);await touch('touchStart',p);await touch('touchMove',{x:p.x-60,y:p.y});
assert('Penalty swipe commits before release',await evaluate("footballGame.controller.dive?.direction===-1"));
await touch('touchEnd');await wait(180);await screen('mobile-penalty-flight');
for(let i=0;i<250;i++){if(await evaluate("footballGame.state==='RESULT'"))break;await wait(20);}
assert('Native penalty save awarded separately',await evaluate("footballGame.resolution.kind==='penalty_saved'&&footballGame.stats.saves===1&&footballGame.stats.tackles===2"));
await tap(await center('next-button'));await wait(950);
assert('Ninth highlight controls keeper in open play',await evaluate("footballGame.index===8&&footballGame.controlled===footballGame.keeper"));
for(let i=0;i<350;i++){if(await evaluate("footballGame.state==='RESULT'"))break;await wait(20);}
assert('Open-play shot resolves physically',await evaluate("['shot_saved','shot_conceded'].includes(footballGame.resolution.kind)"));
await tap(await center('next-button'));await wait(950);
assert('Tenth highlight takes a penalty',await evaluate("footballGame.index===9&&footballGame.state==='AIMING'"));
await kick(420,84,1);
await tap(await center('next-button'));assert('Native session reaches summary',await evaluate("footballGame.state==='SESSION_SUMMARY'"));await screen('mobile-new-summary');
for(const [w,h] of [[320,480],[568,320],[844,390]]){await size(w,h,true);await wait(120);assert('Summary replay visible '+w+'x'+h,await evaluate("(()=>{const r=document.getElementById('again-button').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&r.x>=0&&r.right<=innerWidth})()"));}
await tap(await center('again-button'));await wait(950);assert('Native replay resets session',await evaluate("footballGame.index===0&&footballGame.stats.goals===0&&footballGame.stats.passes===0&&footballGame.state==='AIMING'"));
// Desktop uses the same updated mapping and contact geometry.
await send('Emulation.setTouchEmulationEnabled',{enabled:false});await size(1440,1000);await open(url);let q=await center('play-button');await click(q.x,q.y);await wait(950);p=await world(500,348);let pull=await evaluate('footballGame.maxDrag()*footballGame.view.scale');await drag(p.x,p.y,p.x+pull*.28,p.y+pull*.96);await wait(220);const cg=await evaluate('footballGame.contactGeometry()');q=await world(cg.x,cg.y);await click(q.x,q.y);await wait(260);outcome=await fastForward();assert('Desktop mouse flow still resolves',outcome.state==='RESULT');await screen('desktop-mobile-update');
console.log(JSON.stringify(report,null,2));console.log('errors',errors);if(report.some(x=>!x.pass)||errors.length)process.exitCode=1;
} finally { close(); }
