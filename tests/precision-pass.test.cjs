'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {runtimeScripts}=require('./helpers/runtime.cjs');
const window={};
for(const {source,filename} of runtimeScripts().filter(s=>/\/(core|physics)\.js$|\/highlights\/(controller|precision-pass)\.js$/.test(s.filename)))vm.runInNewContext(source,{window},{filename});
const {Core,Physics,PrecisionPassController:Controller}=window.ShoparFootball;
function fixture({mates=[[650,450],[440,300]],defenders=[[500,380],[580,320]]}={}) {
  const player=Core.makePlayer(350,560,'blue',9),results=[];
  const context={player,mates:mates.map((p,i)=>Core.makePlayer(...p,'blue',7+i)),defenders:defenders.map((p,i)=>Core.makePlayer(...p,'red',4+i)),
    keeper:Core.makePlayer(500,100,'keeper',1),ball:{...Core.possessionPosition(player),z:0,vx:0,vy:0,vz:0,spin:0,age:0,rotation:0},
    view:{scale:1,x:0,y:0,width:1000,height:740},play:{controlled:player},flow:{state:Core.State.DEFENDING},
    physics:Physics,geometry:Core,effects:{trail:[],ripple(){}},feedback:{power(){},toast(){}},audio:{play(){}},
    complete(kind){results.push({kind,ball:{...context.ball},feet:[...context.defenders,...context.mates].map(a=>Core.possessionPosition(a))});}};
  const controller=new Controller(context);controller.enter();return{controller,context,results};
}
function pass(c,target,hold=.6,pointerType='mouse',fps=120) {
  assert.equal(c.handleInput({type:'down',point:target,pointerType}).capture,true);
  let time=0;while(hold-time>1e-10){const dt=Math.min(1/fps,hold-time);c.update(dt);time+=dt;}
  c.handleInput({type:'up',point:{x:900,y:600},pointerType});
}
function finish(c,fps=120){for(let i=0;i<fps*6&&c.phase!=='resolved';i++)c.update(1/fps);assert.equal(c.phase,'resolved');}
function close(a,b){assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);}

test('Precision Pass charges progressively while all runners keep moving, and cancellation never passes',()=>{
  for(const pointerType of ['mouse','touch']) {
    const {controller:c,context:g,results}=fixture(),positions=[...g.mates,...g.defenders].map(a=>({...a}));
    c.handleInput({type:'down',point:{x:650,y:450},pointerType});assert.equal(c.power,0);
    c.update(.6);close(c.power,.5);
    [...g.mates,...g.defenders].forEach((actor,i)=>assert.ok(Math.hypot(actor.x-positions[i].x,actor.y-positions[i].y)>5));
    assert.equal(g.ball.age,0);assert.equal(g.ball.vx,0);
    c.update(1);assert.equal(c.power,1);c.update(.5);assert.equal(c.power,1);
    c.cancelInput();c.handleInput({type:'up',point:{x:650,y:450}});
    assert.equal(c.phase,'aiming');assert.equal(c.target,null);assert.equal(c.power,0);assert.equal(results.length,0);
  }
});

test('mouse and touch release the same visible target and power into identical shared physics',()=>{
  const a=fixture({mates:[],defenders:[]}),b=fixture({mates:[],defenders:[]});
  for(const [f,type]of[[a,'mouse'],[b,'touch']]) {
    pass(f.controller,{x:650,y:450},.6,type);
    assert.equal(f.controller.target.x,650);assert.equal(f.controller.target.y,450);close(f.controller.releasedPower,.5);
  }
  assert.equal(JSON.stringify(a.context.ball),JSON.stringify(b.context.ball));
  const expected={...a.context.ball};
  for(let i=0;i<60;i++){a.controller.update(1/120);b.controller.update(1/120);Physics.integrateBall(expected,1/120);}
  assert.equal(JSON.stringify(a.context.ball),JSON.stringify(b.context.ball));close(a.context.ball.x,expected.x);close(a.context.ball.y,expected.y);
  finish(a.controller);assert.equal(a.results[0].kind,'pass_missed');
  assert.ok(Math.hypot(a.context.ball.x-650,a.context.ball.y-450)>60,'there is no endpoint lock');
});

test('normal and through passes require physical reception, and both use the same gesture',()=>{
  for(const target of [{x:650,y:450},{x:700,y:410}]) {
    const {controller:c,context:g,results}=fixture({defenders:[]});
    pass(c,target,.6);finish(c);
    assert.equal(results[0].kind,'pass_complete');assert.ok(g.mates.includes(c.owner));
    assert.ok(Math.min(...results[0].feet.map(p=>Math.hypot(results[0].ball.x-p.x,results[0].ball.y-p.y)))<=16.1);
    assert.ok(Math.hypot(c.owner.x-c.owner.startX,c.owner.y-c.owner.startY)>5);
    c.update(1);assert.equal(results.length,1);
  }
});

test('too little power falls short and excessive pace overshoots instead of snapping to a receiver',()=>{
  for(const [hold,expected]of[[0,'pass_short'],[.6,'pass_complete'],[1.2,'pass_missed']]) {
    const {controller:c,results}=fixture({defenders:[]});pass(c,{x:650,y:450},hold);finish(c);
    assert.equal(results[0].kind,expected,`hold ${hold}`);
    if(hold===0)assert.ok(c.travel<c.passDistance-40);
    if(hold===1.2)assert.ok(c.travel>c.passDistance+40);
  }
});

test('defenders react during flight and intercept through actual swept physical contact',()=>{
  const {controller:c,context:g,results}=fixture({defenders:[[500,505]]});
  pass(c,{x:650,y:450},.6);const before={...g.defenders[0]};finish(c);
  assert.equal(results[0].kind,'pass_intercepted');assert.equal(c.owner,g.defenders[0]);
  assert.ok(Math.hypot(c.owner.x-before.x,c.owner.y-before.y)>5);
  const foot=results[0].feet[0];assert.ok(Math.hypot(results[0].ball.x-foot.x,results[0].ball.y-foot.y)<=18.8);
});

test('the live default encounter rewards a normal pass or through pass and penalizes poor timing',()=>{
  for(const [target,wait,hold,expected]of[[{x:650,y:450},0,.6,'pass_complete'],[{x:700,y:410},0,.6,'pass_complete'],
    [{x:700,y:410},0,.9,'pass_complete'],[{x:700,y:410},2,.9,'pass_missed'],[{x:650,y:450},0,.3,'pass_intercepted']]) {
    const {controller:c,results}=fixture();c.update(wait);pass(c,target,hold);finish(c);
    assert.equal(results[0].kind,expected,JSON.stringify({target,wait,hold}));
    close(c.releasedPower,hold/1.2);
  }
});

test('pass power, moving players and physical outcomes agree at 30, 60 and 120 FPS',()=>{
  for(const [hold,expected]of[[0,'pass_short'],[.6,'pass_complete'],[1.2,'pass_missed']]) {
    const balls=[];
    for(const fps of [30,60,120]) {
      const {controller:c,results}=fixture({defenders:[]});pass(c,{x:650,y:450},hold,'mouse',fps);finish(c,fps);
      assert.equal(results[0].kind,expected);balls.push(results[0].ball);
    }
    for(const ball of balls.slice(1)){close(ball.x,balls[0].x);close(ball.y,balls[0].y);}
  }
});

test('pass rendering stays read-only and touch power feedback remains above the finger',()=>{
  const {controller:c,context:g}=fixture();c.handleInput({type:'down',point:{x:650,y:450},pointerType:'touch'});c.update(.4);
  const before=JSON.stringify([g.ball,g.mates,g.defenders,c.target,c.power,c.elapsed]),log=[];
  const canvas=new Proxy({},{get:(o,k)=>o[k]||((...args)=>log.push([k,...args]))});
  c.drawWorld(canvas);c.drawOverlay(canvas);
  assert.equal(JSON.stringify([g.ball,g.mates,g.defenders,c.target,c.power,c.elapsed]),before);
  const bar=log.find(v=>v[0]==='fillRect');assert.ok(bar[2]+bar[4]<450-50);
  assert.equal(c.target.x,650);assert.equal(c.target.y,450,'touch feedback never moves the real target');
});
