// Run against a dedicated Chrome CDP instance, just like seven-highlights.mjs.
import { open, size, evaluate, send, wait, errors, close, click } from './browser.mjs';
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
const report = [];
const check = (name, pass) => report.push({ name, pass });
try {
  for (const [width, height, mobile] of [[1280, 900, false], [390, 844, true], [568, 320, true]]) {
    await size(width, height, mobile);
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await open(url);
    const touch = (type, point) => send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
    async function tap(selector) {
      await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'nearest'})`);
      await wait(60);
      const point = await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if (mobile) { await touch('touchStart', point); await touch('touchEnd'); }
      else await click(point.x, point.y);
      await wait(60);
    }
    await tap('#select-highlight-button'); await tap('[data-highlight="5"]'); await wait(950);
    check(`Picker opens defense ${width}`, await evaluate("footballGame.state==='DEFENDING'&&footballGame.index===5"));
    for (const [opener, dialog, closer] of [
      ['#conditions-button', '#conditions-dialog', '#conditions-done'],
      ['#help-button', '#help-dialog', '#help-done'], ['#highlight-button', '#highlight-dialog', '#highlight-close']
    ]) {
      await tap(opener);
      const snapshot = await evaluate('JSON.stringify([footballGame.defense.elapsed,footballGame.ball,footballGame.player])');
      await wait(300);
      check(`Dialog pauses ${dialog} ${width}`, await evaluate(`document.querySelector('${dialog}').open`) && snapshot === await evaluate('JSON.stringify([footballGame.defense.elapsed,footballGame.ball,footballGame.player])'));
      if (opener === '#conditions-button') {
        await tap('#sound-button'); await wait(100);
        check(`Sound callback updates UI ${width}`, await evaluate("footballGame.audio.enabled&&footballGame.audio.context.state==='running'&&document.getElementById('sound-button').getAttribute('aria-pressed')==='true'"));
        await evaluate('window.testAudioContext=footballGame.audio.context');
        await tap('#sound-button'); await tap('#sound-button');
        check(`Sound context reused ${width}`, await evaluate('footballGame.audio.context===window.testAudioContext'));
        await tap('#sound-button');
      }
      await tap(closer);
      check(`Dialog closes ${dialog} ${width}`, !await evaluate(`document.querySelector('${dialog}').open`));
    }
    await evaluate('footballGame.restart()'); await wait(950);
    const point = { x: width * .25, y: height * .8 };
    if (mobile) await touch('touchStart', point);
    else await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await wait(120);
    check(`Native hold captured ${width}`, await evaluate("!!footballGame.pointer&&footballGame.defense.phase==='running'"));
    if (mobile) await touch('touchCancel');
    else { await evaluate("window.dispatchEvent(new Event('blur'))"); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); }
    check(`Cancel/blur stops safely ${width}`, await evaluate("!footballGame.pointer&&footballGame.defense.phase==='planning'&&!footballGame.pendingResult"));
    if (mobile) {
      await touch('touchStart', point);
      await size(width === 390 ? 844 : 390, width === 390 ? 390 : 844, true);
      check(`Rotation cancels defense ${width}`, await evaluate("!footballGame.pointer&&footballGame.defense.phase==='planning'&&!footballGame.pendingResult"));
      await touch('touchCancel'); await size(width, height, true);
    }
    await tap('#help-button');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(100);
    check(`Escape closes help ${width}`, await evaluate("!document.getElementById('help-dialog').open"));
  }
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length || report.some(result => !result.pass)) process.exitCode = 1;
} finally { close(); }
