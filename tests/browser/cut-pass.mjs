import assert from 'node:assert/strict';
import { open, size, evaluate, send, wait, errors, close, world, click, screen } from './browser.mjs';

const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
let checks = 0;
function check(pass, label) { assert.ok(pass, label); checks++; }
async function until(expression) {
  for (let i = 0; i < 800; i++) {
    if (await evaluate(expression)) return;
    await wait(10);
  }
  throw new Error(`Timed out: ${expression}`);
}

try {
  for (const [width, height, mobile] of [[1280, 900, false], [390, 844, true], [568, 320, true]]) {
    await size(width, height, mobile);
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await open(url);
    const cases = ['rush', 'rush-head', 'rush-body', 'rush-ball', 'rush-side', 'lane', 'receiver', 'late', 'none']
      .map(mode => ({ mode, variant: 0 }));
    for (let variant = 1; variant < 6; variant++) for (const mode of ['lane', 'receiver']) cases.push({ mode, variant });
    const layouts = [];
    for (const { mode, variant } of cases) {
      await evaluate(`footballGame.session.memoryFor('cut-the-pass').variant=${variant};footballGame.startPractice(6);footballGame.update(.9)`);
      await until("footballGame.state==='DEFENDING'");
      if (mode === 'lane') {
        layouts.push(await evaluate('JSON.stringify([footballGame.player.x,footballGame.player.y,footballGame.defenders.map(p=>[p.x,p.y])])'));
        await screen(`cut-pass-start-${variant}-${width}`);
      }
      if (mode === 'late') await wait(750);
      if (mode !== 'none') {
        const target = await evaluate(`(()=>{
          const c=footballGame.controller,p=c.passer;
          if (['lane','late'].includes('${mode}')) return {x:550+70*Math.sin(c.setup.angle),y:400-70*Math.cos(c.setup.angle)};
          if ('${mode}'==='receiver') return {x:c.receiver.x,y:c.receiver.y};
          if ('${mode}'==='rush-ball') return {...footballGame.ball};
          if ('${mode}'==='rush-head') return {x:p.x,y:p.y-35};
          if ('${mode}'==='rush-body') return {x:p.x,y:p.y-20};
          if ('${mode}'==='rush-side') return {x:p.x+60,y:p.y};
          return {x:p.x,y:p.y};
        })()`);
        const p = await world(target.x, target.y);
        if (mobile) {
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
          await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await click(p.x, p.y);
        check(await evaluate('footballGame.controller.target!==null'), 'Native destination selection');
      }
      await until("footballGame.controller.phase==='passing'");
      check(await evaluate(mode.startsWith('rush')
        ? 'footballGame.controller.passStartedAt<footballGame.controller.passAt'
        : 'footballGame.controller.passStartedAt>=footballGame.controller.passAt'), 'Pressure determines release time');
      check(await evaluate('footballGame.controller.passStartedAt<=1.01'), 'Pass releases within one second');
      if (mode === 'lane') await screen(`cut-pass-lane-${width}`);
      await until("footballGame.state==='RESULT'");
      const result = await evaluate('({kind:footballGame.resolution.kind,tackles:footballGame.stats.tackles,misses:footballGame.stats.misses})');
      check(result.kind === (mode === 'lane' ? 'pass_won' : 'pass_through'), `Physical interception result for ${mode} at ${width}x${height}`);
      check(result.tackles === (mode === 'lane' ? 1 : 0) && result.misses === (mode === 'lane' ? 0 : 1), 'Result credited once');
      check(await evaluate('footballGame.controller.passStartedAt!==null'), 'Pass has launched');
    }
    check(new Set(layouts).size === 6, 'Six different playable layouts');
  }
  check(errors.length === 0, errors.join('\n'));
  console.log(`${checks} browser checks passed`);
} finally { close(); }
