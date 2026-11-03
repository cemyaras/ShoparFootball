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

test('balanced S strokes and small hand tremors resolve to a straight natural shot', () => {
  const curve = Controller.buildRoute(wave(80)), straight = Controller.buildRoute(wave(80,0));
  assert.ok(curve); assert.ok(straight);
  for (const route of [curve,straight,Controller.buildRoute(wave(160,2,15))]) {
    assert.ok(route.preview.every(p=>Math.abs(p.x-500)<1e-7));
    close(route.preview[0].y,365); close(route.preview.at(-1).y,84);
    close(route.speed,straight.speed);
  }
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
  assert.equal(Boolean(Controller.buildRoute([{x:500,y:365},{x:510,y:330},{x:500,y:360},{x:500,y:84}])),true);
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

function aimedPoints(height, bend = 0) {
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    return { x: 512 - 12 * t + bend * Math.sin(2 * Math.PI * t), y: 377 + (84 - height * .52 - 377) * t };
  });
}

test('goal mouth projection maps continuous target heights onto the physical goal line', () => {
  const ground = Controller.buildShot(aimedPoints(0), false, Physics);
  assert.equal(ground.vz, 0); assert.ok(ground.preview.every(p => p.z === 0));
  for (const height of [15, 30, 45, 75, 90, 112, 140]) {
    const shot = Controller.buildShot(aimedPoints(height, 30), false, Physics), end = shot.preview.at(-1);
    assert.ok(shot.vz > 0); close(end.y, 84);
    close(end.z, height, .01); close(end.y - end.z * .52, 84 - height * .52, .01);
    close(shot.route.preview.at(-1).y, 84);
  }
});

test('CHIP has a slower rising and descending profile while preserving the full ground path', () => {
  const points = aimedPoints(90, 35), normal = Controller.buildShot(points, false, Physics), chip = Controller.buildShot(points, true, Physics);
  close(normal.route.length, chip.route.length);
  assert.equal(JSON.stringify(normal.route.preview), JSON.stringify(chip.route.preview));
  assert.ok(chip.speed < normal.speed * .5);
  close(chip.speed / normal.speed, .45);
  assert.ok(Math.max(...chip.preview.map(p => p.z)) > Math.max(...normal.preview.map(p => p.z)) + 5);
  assert.ok(chip.preview.at(-2).z > chip.preview.at(-1).z);
  assert.ok(normal.preview.at(-2).z < normal.preview.at(-1).z);
  close(chip.preview.at(-1).z, 90, .01);
  const lower = Controller.buildShot(aimedPoints(0), true, Physics);
  assert.ok(lower.vz > 0); assert.ok(Math.max(...lower.preview.map(p => p.z)) > 30);
});

test('elevated flight and its preview agree at 30, 60 and 120 FPS using shared gravity and drag', () => {
  for (const chip of [false, true]) {
    const shot = Controller.buildShot(aimedPoints(90, 30), chip, Physics), states = [];
    for (const fps of [30, 60, 120]) {
      const r = shot.route;
      const ball = { ...r.start, vx: Math.cos(r.heading) * shot.speed, vy: Math.sin(r.heading) * shot.speed,
        z: 0, vz: shot.vz, spin: 0, age: 0, rotation: 0 };
      const c = new Controller({ ball, physics: Physics, resultDelay: { pending: false } }); c.route = r;
      for (let i = 0; i < fps * .4; i++) c.integrateShot(1 / fps);
      const predicted = shot.preview[48];
      close(ball.x, predicted.x); close(ball.y, predicted.y); close(ball.z, predicted.z);
      states.push({ ...ball });
    }
    for (const state of states.slice(1)) { close(state.x, states[0].x); close(state.y, states[0].y); close(state.z, states[0].z); }
  }
});

test('a lob falls, bounces and continues with shared restitution rather than a scripted height', () => {
  const shot = Controller.buildShot(aimedPoints(0), true, Physics), r = shot.route;
  const ball = { ...r.start, vx: Math.cos(r.heading) * shot.speed, vy: Math.sin(r.heading) * shot.speed,
    z: 0, vz: shot.vz, spin: 0, age: 0, rotation: 0 };
  const c = new Controller({ ball, physics: Physics, resultDelay: { pending: false } }); c.route = r;
  let bounced = false;
  for (let i = 0; i < 240; i++) {
    const impact = c.integrateShot(1 / 120);
    if (impact) { bounced = true; assert.ok(ball.vz > 0); break; }
  }
  assert.ok(bounced); assert.ok(c.travel >= r.length - 1);
});


test('sharp zigzags and dominant bends produce one bounded curve without extra power', () => {
  const zigzag=Array.from({length:81},(_,i)=>({x:i===0||i===80?500:500+(i%2?220:-220),y:365-281*i/80}));
  const straight=Controller.buildRoute(wave(80,0));
  for(const points of [zigzag,wave(80,70,1),wave(80,-70,1)]) {
    const route=Controller.buildRoute(points);assert.ok(route);close(route.speed,straight.speed);
    close(route.preview[0].x,500);close(route.preview.at(-1).x,500);close(route.preview.at(-1).y,84);
    const signs=new Set();
    for(let i=1;i<route.preview.length-1;i++){
      const a=route.preview[i-1],b=route.preview[i],c=route.preview[i+1];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cross)>1e-8)signs.add(Math.sign(cross));
    }
    assert.ok(signs.size<=1);
    assert.ok(Math.max(...route.preview.map(p=>Math.abs(p.x-500)))<=80);
  }
  assert.ok(Controller.pointAt(Controller.buildRoute(wave(80,70,1)),140).x>530);
  assert.ok(Controller.pointAt(Controller.buildRoute(wave(80,-70,1)),140).x<470);
});
