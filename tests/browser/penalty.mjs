// Native input and normal-speed penalty playback in a dedicated Chrome instance.
import { open, size, evaluate, send, wait, errors, close, world, screen, click } from './browser.mjs';
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
const report = [];
const check = (name, pass) => { report.push({ name, pass }); if (!pass) throw new Error(name); };
async function until(expression, timeout = 6500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await wait(10); }
  throw new Error(`Timed out waiting for ${expression}`);
}
try {
  for (const [width, height, mobile] of [[1280, 900, false], [390, 844, true], [568, 320, true]]) {
    await size(width, height, mobile);
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await open(url);
    async function tap(selector) {
      await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'nearest'})`);
      const p = await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if (mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await click(p.x, p.y);
    }
    await tap('#select-highlight-button'); await tap('[data-highlight="7"]');
    await until("footballGame.state==='DEFENDING'");
    check(`Picker selects keeper ${width}`, await evaluate('footballGame.controlled===footballGame.keeper&&footballGame.practiceIndex===7'));
    for (const scenario of [
      { name: 'low save', variant: 0, side: -1, high: false, delay: 70, result: 'penalty_saved' },
      { name: 'high save', variant: 1, side: 1, high: true, delay: 70, result: 'penalty_saved' },
      { name: 'wrong side', variant: 0, side: 1, high: false, delay: 70, result: 'penalty_conceded' },
      { name: 'late dive', variant: 0, side: -1, high: false, delay: 550, result: 'penalty_conceded' },
      { name: 'stay central', variant: 2, side: 0, high: false, delay: 0, result: 'penalty_saved' }
    ]) {
      await evaluate(`(()=>{const g=footballGame;g.session.memoryFor('save-the-penalty').variant=${scenario.variant};g.startPractice(7)})()`);
      await until("footballGame.controller.phase==='flight'");
      if (scenario.side) {
        await wait(scenario.delay);
        const p = await world(500, 240), end = { x: p.x + scenario.side * 65, y: p.y - (scenario.high ? 65 : 0) };
        if (mobile) {
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
        } else {
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
        }
        check(`Immediate swipe ${scenario.name} ${width}`, await evaluate('!!footballGame.controller.dive'));
        if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', clickCount: 1 });
        if (scenario.name === 'high save') { await wait(180); await screen(`penalty-high-flight-${width}`); }
      }
      await until("footballGame.state==='RESULT'");
      check(`${scenario.name} ${width}`, await evaluate(`footballGame.resolution.kind==='${scenario.result}'&&!footballGame.pointer&&footballGame.stats.saves===${scenario.result === 'penalty_saved' ? 1 : 0}`));
    }
    await tap('#next-button'); await until("footballGame.state==='DEFENDING'");
    check(`Retry clears result and save ${width}`, await evaluate('footballGame.stats.saves===0&&footballGame.resolution===null&&footballGame.controller.dive===null'));
    await evaluate('footballGame.showSummary()'); await screen(`penalty-summary-${width}`);
    check(`Summary fits ${width}`, await evaluate("(()=>{const r=document.getElementById('again-button').getBoundingClientRect(),s=document.getElementById('total-saves').getBoundingClientRect();return r.bottom<=innerHeight&&s.left>=0&&s.right<=innerWidth})()"));
    console.log(`Passed penalty mouse/touch cases at ${width}x${height}`);
  }
  check('No runtime exceptions', errors.length === 0);
  console.log(JSON.stringify({ report, errors }, null, 2));
} finally { close(); }
