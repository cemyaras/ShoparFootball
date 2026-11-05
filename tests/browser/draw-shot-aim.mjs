import { strokeTo } from './stroke.mjs';
import assert from 'node:assert/strict';
import { open, size, evaluate, send, wait, errors, close, world, screen } from './browser.mjs';

const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
let checks = 0;
function check(pass, label) { assert.ok(pass, label); checks++; }
async function pointer(type, point, touch) {
  if (touch) await send('Input.dispatchTouchEvent', {
    type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd', cancel: 'touchCancel' }[type],
    touchPoints: ['up', 'cancel'].includes(type) ? [] : [{ ...point, id: 1 }]
  });
  else await send('Input.dispatchMouseEvent', {
    type: { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[type],
    ...point, button: 'left', buttons: type === 'up' ? 0 : 1, clickCount: 1
  });
}
async function start(chip = false) {
  await evaluate(`(()=>{const g=footballGame;g.startPractice(10);g.update(.9);g.controller.chip=${chip};})()`);
  return evaluate('({x:footballGame.ball.x,y:footballGame.ball.y,scale:footballGame.view.scale})');
}
try {
  for (const [width, height, touch] of [[1280,900,false],[390,844,true],[844,390,true],[568,320,true]]) {
    await size(width, height, touch);
    await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 1 });
    await open(url);
    for (const [bend, targetHeight, chip] of [[0,0,false],[20,0,false],[-40,90,false],[25,90,true]]) {
      const startPoint = await start(chip), targetY = 84 - targetHeight * .52;
      const origin = await world(startPoint.x, startPoint.y), target = await world(450, 84, targetHeight);
      const stroke = strokeTo(origin, target, bend * startPoint.scale, touch, 20), end = stroke.at(-1);
      await pointer('down', origin, touch);
      await wait(100);
      for (const p of stroke) await pointer('move', p, touch);
      await wait(40);
      const aim = await evaluate(`(()=>{
        const g=footballGame,c=g.controller,p=c.getPresentation(),points=c.effectiveAim.points,path=p.aimingPath;
        const expected=ShoparFootball.DrawShotController.buildVisualPath(points);
        const expectedShot=ShoparFootball.DrawShotController.buildShot(points,c.chip,c.context.physics,c.power);
        return {samePath:JSON.stringify(path)===JSON.stringify(expected),sameShot:JSON.stringify(c.shot)===JSON.stringify(expectedShot),
          start:path[0],end:path.at(-1),cursor:p.aimCursor,spin:c.shot.spin,power:c.power,height:c.shot.targetHeight,
          projected:p.projectedAim,liftDistance:c.liftDistance,preview:c.shot.preview.length,scale:g.view.scale};
      })()`);
      check(aim.samePath && aim.sameShot && aim.preview > 2, 'Visual intent and physical shot use the same effective points');
      check(aim.start.x === startPoint.x && aim.start.y === startPoint.y, 'Intent path starts at the ball');
      check(aim.end.x === aim.cursor.x && aim.end.y === aim.cursor.y, 'Crosshair is exactly at the path endpoint');
      check(Math.abs(aim.end.x - 450) < .05 && Math.abs(aim.end.y - targetY) < .05,
        `Raw mouse or lifted touch endpoint: ${width}, ${JSON.stringify({end,aim})}`);
      check(Math.abs(aim.height - targetHeight) < .1, 'Goal height comes from effective aim');
      check(bend ? Math.sign(aim.spin) === -Math.sign(bend) : aim.spin === 0, `Straight and curved intent preserve spin (${width}, bend ${bend}, height ${targetHeight}, spin ${aim.spin})`);
      const liftProgress = Math.min(aim.liftDistance / 70, 1);
      check(touch ? Math.abs((aim.projected.finger.y - aim.projected.path.at(-1).y) * aim.scale - 95 * liftProgress ** 2 * (3 - 2 * liftProgress)) < .05 : aim.cursor.finger === null,
        'Only touch receives the smooth lift up to 95 CSS pixels');
      await wait(60);
      check(await evaluate(`footballGame.controller.power===${aim.power}`), 'Drawing locks charged power');
      if (targetHeight && !chip) await screen(`draw-shot-unified-aim-${width}`);
      const shot = await evaluate('cancelAnimationFrame(footballGame.raf);JSON.stringify(footballGame.controller.shot)');
      await pointer('up', {x:end.x + 20,y:end.y + 25}, touch);
      check(await evaluate(`(()=>{const g=footballGame;return g.state==='BALL_IN_MOTION'&&!g.pointer&&
        JSON.stringify(g.controller.shot)===${JSON.stringify(shot)}&&!g.controllerPresentation().aimingPath&&!g.controllerPresentation().aimCursor})()`),
      'Release commits the last visible shot without resampling');
      check(await evaluate(`(()=>{
        const g=footballGame;for(let i=0;i<3600&&g.state!=='RESULT';i++)g.update(1/120);
        g.render();g.lastTime=null;g.raf=requestAnimationFrame(g.frame);
        return g.state==='RESULT'&&['goal','save','blocked','wide','post','bar','high'].includes(g.resolution?.kind);
      })()`), 'Shot resolves through existing gameplay');
    }
    const p = await start(), down = await world(p.x, p.y);
    await pointer('down', down, touch);
    await pointer('move', await world(450, 200), touch);
    await wait(40);
    if (touch) await pointer('cancel', down, true);
    else await evaluate("footballGame.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:footballGame.pointer.id}))");
    check(await evaluate("footballGame.state==='AIMING'&&!footballGame.pointer&&!footballGame.kick&&!footballGame.controller.shot&&!footballGame.controllerPresentation().aimingPath"),
      'Pointer cancellation clears aiming without shooting');
    const tap = await start();
    await pointer('down', await world(tap.x, tap.y), touch);
    await pointer('up', await world(tap.x, tap.y - 100), touch);
    check(await evaluate("footballGame.state==='AIMING'&&!footballGame.pointer&&!footballGame.controller.shot"),
      'Release without a drawn move cannot create an unseen shot');
  }
  check(errors.length === 0, errors.join('\n'));
  console.log(`${checks} browser checks passed`);
} finally { close(); }
