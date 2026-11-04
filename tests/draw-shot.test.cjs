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

function heldController(pointerType = 'mouse') {
  const controller = new Controller({ flow: { state: 'AIMING' }, ball: { x: 500, y: 365, z: 0, vz: 0 }, player: { x: 500, y: 365 },
    view: { scale: 1, x: 0, y: 0, width: 1000, height: 740 }, physics: Physics });
  controller.handleInput({ type: 'down', point: { x: 500, y: 365 }, pointerType });
  return controller;
}

test('held power repeats a 1.5 second triangle wave at different frame rates for mouse and touch', () => {
  const checkpoints = [[0,.6],[.375,.8],[.75,1],[1.125,.8],[1.5,.6],[1.875,.8],
    [2.25,1],[2.625,.8],[3,.6],[6.375,.8]];
  for (const pointerType of ['mouse','touch']) for (const fps of [20,30,60,120,144]) {
    const c = heldController(pointerType); let elapsed = 0;
    for (const [time,power] of checkpoints) {
      while (time - elapsed > 1e-10) {
        const dt = Math.min(1 / fps, time - elapsed); c.update(dt); elapsed += dt;
        assert.ok(c.power >= .6 && c.power <= 1);
      }
      close(c.power,power); close(c.getPresentation().shotPower.value,power);
      assert.equal(c.drawing,false);
    }
  }
});

test('power immediately reverses at both extrema and locks on either half of the cycle', () => {
  for (const time of [.75,1.5,2.25,3]) {
    const c = heldController(); c.update(time - .001); const before = c.power;
    c.update(.001); const at = c.power; c.update(.001); const after = c.power;
    if (time % 1.5 === 0) { close(at,.6); assert.ok(before > at && after > at); }
    else { close(at,1); assert.ok(before < at && after < at); }
    close(before,after);
  }
  for (const pointerType of ['mouse','touch']) for (const time of [.375,1.125,2.625]) {
    const c = heldController(pointerType); c.update(time);
    c.handleInput({ type: 'move', point: { x: 504, y: 365 } });
    assert.equal(c.drawing,false); close(c.power,.8);
    c.handleInput({ type: 'move', point: { x: 500, y: 200 } });
    const locked = c.power, shot = JSON.stringify(c.shot), path = JSON.stringify(c.effectiveAim);
    assert.equal(c.drawing,true); close(locked,.8);
    c.update(4.75); assert.equal(c.power,locked);
    assert.equal(c.getPresentation().shotPower.locked,true);
    assert.equal(JSON.stringify(c.shot),shot); assert.equal(JSON.stringify(c.effectiveAim),path);
  }
});

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

test('visual aim removes jitter and opposing bends while preserving a deliberate single curve and its endpoints', () => {
  for(const [amplitude,cycles] of [[0,1],[2,15],[45,2],[-45,1],[45,1]]) {
    const points=wave(160,amplitude,cycles),before=JSON.stringify(points),path=Controller.buildVisualPath(points);
    assert.equal(JSON.stringify(points),before);
    assert.equal(path[0].x,points[0].x);assert.equal(path[0].y,points[0].y);
    assert.equal(path.at(-1).x,points.at(-1).x);assert.equal(path.at(-1).y,points.at(-1).y);
    for(let i=1;i<path.length;i++)assert.ok(path[i].y<path[i-1].y,'curve advances toward the target without loops');
    if(cycles>1||amplitude===0)assert.ok(path.every(p=>Math.abs(p.x-500)<1e-7));
    else {
      assert.equal(Math.sign(path[Math.floor(path.length/2)].x-500),Math.sign(amplitude));
      assert.ok(Math.max(...path.map(p=>Math.abs(p.x-500)))>35);
      assert.ok(path.every(p=>(p.x-500)*Math.sign(amplitude)>=-1e-7));
    }
    for(let i=2;i<path.length-1;i++)close(path[i+1].x-3*path[i].x+3*path[i-1].x-path[i-2].x,0);
  }
});

test('visual aim stays visible for short or sideways input and remains stable under small endpoint changes', () => {
  for(const points of [[{x:500,y:365}],[{x:500,y:365},{x:502,y:363}],
    [{x:500,y:365},{x:540,y:365}],[{x:500,y:365},{x:520,y:390}]]) {
    const path=Controller.buildVisualPath(points);
    assert.ok(path.length>=points.length);assert.equal(path.at(-1).x,points.at(-1).x);assert.equal(path.at(-1).y,points.at(-1).y);
    assert.equal(Controller.buildRoute(points),null,'visual eligibility does not allow an invalid shot');
  }
  const points=wave(80,40,1),original=Controller.buildVisualPath(points);
  for(const dx of [-2,2,-1]) {
    const changed=Controller.buildVisualPath([...points,{x:points.at(-1).x+dx,y:points.at(-1).y+1}]);
    for(let i=0;i<=20;i++) {
      const a=original[Math.round((original.length-1)*i/20)],b=changed[Math.round((changed.length-1)*i/20)];
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<5,'small direction change does not reshape the curve abruptly');
    }
  }
  const sideways=[{x:500,y:365},{x:600,y:330},{x:700,y:352}];
  const a=Controller.buildVisualPath(sideways),b=Controller.buildVisualPath([...sideways.slice(0,-1),{x:700,y:354}]);
  for(let i=0;i<=20;i++) {
    const p=a[Math.round((a.length-1)*i/20)],q=b[Math.round((b.length-1)*i/20)];
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<5,'crossing the shot direction threshold does not snap the visual curve');
  }
});

function launch(shot) {
  const ball={...shot.route.start,vx:Math.cos(shot.heading)*shot.speed,vy:Math.sin(shot.heading)*shot.speed,z:0,vz:shot.vz,spin:shot.spin,age:0,rotation:0};
  const context={ball,physics:Physics,resultDelay:{pending:false}},controller=new Controller(context);
  controller.route=shot.route;
  return {ball,controller,context};
}
function crossing(shot, fps=240) {
  const {ball,controller}=launch(shot);let peak=0,previous;
  for(let i=0;i<fps*6&&ball.y>=84;i++){previous={...ball};controller.integrateShot(1/fps);peak=Math.max(peak,ball.z);}
  assert.ok(ball.y<84,'shot reaches the goal plane');
  const t=(previous.y-84)/(previous.y-ball.y);
  return {x:previous.x+(ball.x-previous.x)*t,z:previous.z+(ball.z-previous.z)*t,vz:ball.vz,time:ball.age,peak};
}

test('physical ground flight matches the short preview at 30, 60 and 120 FPS and accepts velocity changes', () => {
  const shot=Controller.buildShot(wave(80,70,1),false,Physics),states=[];
  for(const fps of [30,60,120]) {
    const {ball,controller:c,context}=launch(shot);
    for(let i=0;i<fps*.2;i++)c.integrateShot(1/fps);
    const expected=shot.preview[24];close(ball.x,expected.x);close(ball.y,expected.y);assert.equal(ball.z,0);
    states.push({...ball});
    const before={...ball};ball.vx=-100;ball.vy=0;ball.spin=0;
    c.integrateShot(.1);assert.ok(ball.x<before.x);close(ball.y,before.y);
    context.resultDelay.pending=true;const free={...ball};Physics.integrateBall(free,.1);
    c.integrateShot(.1);close(ball.x,free.x);close(ball.y,free.y);
  }
  for(const state of states.slice(1)){close(state.x,states[0].x);close(state.y,states[0].y);}
});

test('flight continues after the preview without seeking the intended endpoint', () => {
  const shot=Controller.buildShot(wave(80,80,1),false,Physics,1),{ball,controller}=launch(shot);
  for(let i=0;i<120;i++)controller.integrateShot(1/120);
  assert.ok(ball.age>shot.preview.at(-1).time);assert.ok(ball.y<84);
  assert.ok(Math.hypot(ball.x-shot.target.x,ball.y-shot.target.y)>30);
  assert.ok(Math.hypot(ball.vx,ball.vy)>38);
});

function aimedPoints(height, bend = 0, cycles = 2) {
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    return { x: 512 - 12 * t + bend * Math.sin(cycles * Math.PI * t), y: 377 + (84 - height * .52 - 377) * t };
  });
}

test('goal mouth projection preserves intended height but shows only an early flight estimate', () => {
  const ground=Controller.buildShot(aimedPoints(0),false,Physics);
  assert.equal(ground.vz,0);assert.ok(ground.preview.every(p=>p.z===0));
  for(const height of [15,30,45,75,90,112,140]) {
    const shot=Controller.buildShot(aimedPoints(height,30,1),false,Physics);
    assert.ok(shot.vz>0);close(shot.target.y,84);close(shot.target.z,height);
    close(shot.target.y-shot.target.z*.52,84-height*.52);
    assert.ok(shot.preview.at(-1).time<=shot.referenceTime*.71);
    assert.ok(shot.preview.at(-1).y>84);
  }
});

test('CHIP remains slower and descends near the goal while a normal high shot is still rising', () => {
  const points=aimedPoints(90),normal=Controller.buildShot(points,false,Physics),chip=Controller.buildShot(points,true,Physics);
  assert.equal(JSON.stringify(normal.route.preview),JSON.stringify(chip.route.preview));close(chip.speed/normal.speed,.45);
  const n=crossing(normal),c=crossing(chip);
  assert.ok(c.time>n.time);assert.ok(c.vz<0);assert.ok(n.vz>0);assert.ok(c.peak>n.peak+5);
  const lower=Controller.buildShot(aimedPoints(0),true,Physics);assert.ok(lower.vz>0);
});

test('elevated physical flight matches its early preview at 30, 60 and 120 FPS', () => {
  for(const chip of [false,true]) {
    const shot=Controller.buildShot(aimedPoints(90,30,1),chip,Physics),states=[];
    for(const fps of [30,60,120]) {
      const {ball,controller}=launch(shot);
      for(let i=0;i<fps*.2;i++)controller.integrateShot(1/fps);
      const expected=shot.preview[24];close(ball.x,expected.x);close(ball.y,expected.y);close(ball.z,expected.z);states.push({...ball});
    }
    for(const state of states.slice(1)){close(state.x,states[0].x);close(state.y,states[0].y);close(state.z,states[0].z);}
  }
});

test('a physical lob falls and bounces using shared restitution', () => {
  const shot=Controller.buildShot(aimedPoints(0),true,Physics),{ball,controller}=launch(shot);let bounced=false;
  for(let i=0;i<240;i++){if(controller.integrateShot(1/120)){bounced=true;assert.ok(ball.vz>0);break;}}
  assert.ok(bounced);assert.ok(ball.y<90);
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

test('power and curve create deterministic distinct A/B/C trajectories without target locking', () => {
  const cases=[[.6,80],[.8,35],[1,80]],results=[];
  for(const [power,bend] of cases) {
    const shot=Controller.buildShot(aimedPoints(90,bend,1),false,Physics,power),reference=crossing(shot);
    for(const fps of [30,60,120]) {
      const actual=crossing(shot,fps);close(actual.x,reference.x,1);close(actual.z,reference.z,1);
      assert.equal(Physics.goalLineOutcome(actual.x,actual.z),Physics.goalLineOutcome(reference.x,reference.z));
    }
    assert.deepEqual(crossing(shot),reference);results.push({shot,...reference});
  }
  assert.ok(results[0].shot.speed<results[1].shot.speed&&results[1].shot.speed<results[2].shot.speed);
  assert.ok(Math.abs(results[0].shot.spin)>Math.abs(results[2].shot.spin));
  assert.ok(results[2].x-results[0].x>60);assert.ok(Math.abs(results[2].z-results[0].z)>5);
  const low=Controller.buildShot(aimedPoints(90,80,1),false,Physics,.6),high=Controller.buildShot(aimedPoints(90,80,1),false,Physics,1);
  close(high.speed/low.speed,1.25);close(Math.abs(high.spin/low.spin),.45);close(high.heading,low.heading);close(high.vz,low.vz);
});
