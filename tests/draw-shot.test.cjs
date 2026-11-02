'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');
const window = {};
for (const {source,filename} of runtimeScripts().filter(s => /\/(core|physics)\.js$|\/highlights\/(controller|attack|draw-shot)\.js$/.test(s.filename))) vm.runInNewContext(source,{window},{filename});
const { DrawShotController: Controller, Physics } = window.ShoparFootball;
const wave = (samples, amplitude = 45, cycles = 2) => Array.from({length:samples+1},(_,i)=>({x:500+amplitude*Math.sin(cycles*Math.PI*i/samples),y:365-281*i/samples}));
function close(a,b,tolerance=1e-7) { assert.ok(Math.abs(a-b)<tolerance, `${a} differs from ${b}`); }

test('full-path resampling preserves opposite bends even when start, middle and end coincide', () => {
  const curve = Controller.buildRoute(wave(80)), straight = Controller.buildRoute(wave(80,0));
  assert.ok(curve); assert.ok(straight);
  const first = Controller.pointAt(curve,curve.length*.25), second = Controller.pointAt(curve,curve.length*.75);
  assert.ok(first.x > 530); assert.ok(second.x < 470);
  assert.ok(straight.preview.every(p=>Math.abs(p.x-500)<1e-8));
  close(curve.preview[0].x,500); close(curve.preview[0].y,365);
  close(curve.preview.at(-1).x,500); close(curve.preview.at(-1).y,84);
  // The smoothing window keeps the intended detour, including its interior samples.
  for (const p of curve.preview) close(p.x,500+45*Math.sin(2*Math.PI*(365-p.y)/281),5);
});

test('spatial resampling ignores pointer event density and limits sharp or invalid drawings', () => {
  const vertices=wave(20,50,1), dense=[];
  for(let i=1;i<vertices.length;i++) for(let j=0;j<12;j++) {
    const t=j/12,a=vertices[i-1],b=vertices[i];dense.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  dense.push(vertices.at(-1));
  const a=Controller.buildRoute(vertices),b=Controller.buildRoute(dense);
  close(a.length,b.length); close(a.speed,b.speed); assert.equal(a.preview.length,b.preview.length);
  for(let i=0;i<a.preview.length;i++){close(a.preview[i].x,b.preview[i].x);close(a.preview[i].y,b.preview[i].y);}
  assert.equal(Controller.buildRoute([{x:500,y:365},{x:500,y:350}]),null);
  assert.equal(Controller.buildRoute([{x:500,y:365},{x:Infinity,y:84}]),null);
  assert.equal(Controller.buildRoute([{x:500,y:365},{x:510,y:330},{x:500,y:360},{x:500,y:84}]),null);
});

test('ground flight samples the displayed route identically at 30, 60 and 120 FPS', () => {
  const route=Controller.buildRoute(wave(80)), states=[];
  for(const fps of [30,60,120]) {
    const ball={...route.start,vx:Math.cos(route.heading)*route.speed,vy:Math.sin(route.heading)*route.speed,z:0,vz:0,spin:0,age:0,rotation:0};
    const context={ball,physics:Physics,resultDelay:{pending:false},flow:{state:'BALL_IN_MOTION'}};
    const c=new Controller(context);c.route=route;
    for(let i=0;i<fps*.5;i++){
      c.integrateShot(1/fps);
      const expected=Controller.pointAt(route,c.travel);
      close(ball.x,expected.x);close(ball.y,expected.y);assert.equal(ball.z,0);
    }
    states.push({...ball,travel:c.travel});
    const before={...ball};context.resultDelay.pending=true;ball.vx=100;ball.vy=0;
    c.integrateShot(.1);assert.ok(ball.x>before.x);close(ball.y,before.y);
  }
  for(const state of states.slice(1)){close(state.x,states[0].x);close(state.y,states[0].y);close(state.travel,states[0].travel);}
});

test('a completed drawing continues along its final tangent without stopping or turning back', () => {
  const route=Controller.buildRoute(wave(80)),end=Controller.pointAt(route,route.length),beyond=Controller.pointAt(route,route.length+50);
  close(Math.hypot(beyond.x-end.x,beyond.y-end.y),50);
  close(Math.atan2(beyond.y-end.y,beyond.x-end.x),end.angle);
});
