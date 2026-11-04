// Optional Playwright flow. Set PLAYWRIGHT_MODULE to an external playwright/index.mjs if needed.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium, webkit, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || new URL('../../index.html', import.meta.url).href;
const artifacts = await mkdtemp(join(tmpdir(), 'shopar-power-browser-'));
const results = [], errors = [];
function check(pass, label, details) { results.push({ label, pass: Boolean(pass), ...(pass ? {} : { details }) }); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function snapshot(page) {
  return page.evaluate(() => {
    const g = footballGame, c = g.controller, r = g.canvas.getBoundingClientRect();
    return JSON.parse(JSON.stringify({ state: g.state, ball: g.ball, view: g.view, rect: { left: r.left, top: r.top },
      pointer: g.pointer, captured: g.pointer && g.canvas.hasPointerCapture(g.pointer.id),
      power: c.power, holdTime: c.holdTime, drawing: c.drawing, shot: c.shot, aim: c.effectiveAim,
      cursor: c.aimCursor, events: window.inputEvents, selection: String(getSelection()), scroll: [scrollX, scrollY] }));
  });
}
function screen(s, p) { return { x: Math.round(s.rect.left + s.view.x + p.x * s.view.scale), y: Math.round(s.rect.top + s.view.y + p.y * s.view.scale) }; }
async function setup(page, clock = true) {
  await page.goto(url); await page.waitForFunction(() => window.footballGame);
  await page.evaluate(() => {
    footballGame.startPractice(10); footballGame.update(.9); window.inputEvents = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'selectstart', 'dragstart']) {
      document.addEventListener(type, e => inputEvents.push({ type, x: e.clientX, y: e.clientY,
        trusted: e.isTrusted, pointerType: e.pointerType, prevented: e.defaultPrevented }));
    }
  });
  if (clock) await page.clock.runFor(32);
  return snapshot(page);
}
async function pointerDriver(page, touch, safari) {
  // Playwright exposes tap publicly; its WebKit protocol also supplies trusted touch drags.
  const session = touch ? safari ? page._connection.toImpl(page).delegate._pageProxySession : await page.context().newCDPSession(page) : null;
  let last;
  return async (type, point) => {
    if (point) last = { x: Math.round(point.x), y: Math.round(point.y), id: 1 };
    if (touch) await session.send('Input.dispatchTouchEvent', {
      type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd', cancel: 'touchCancel' }[type],
      touchPoints: ['up', 'cancel'].includes(type) && !safari ? [] : [last]
    });
    else if (type === 'down') { await page.mouse.move(last.x, last.y); await page.mouse.down(); }
    else if (type === 'move') await page.mouse.move(last.x, last.y);
    else if (type === 'up') await page.mouse.up();
    else {
      await page.evaluate(() => footballGame.canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: footballGame.pointer.id, bubbles: true })));
      await page.mouse.up();
    }
    for (let i = 0; i < 125; i++) {
      const delivered = await page.evaluate(({ type, last }) => {
        if (type === 'cancel') return !footballGame.pointer;
        const event = inputEvents.filter(e => e.type === { down: 'pointerdown', move: 'pointermove', up: 'pointerup' }[type]).at(-1);
        return event && (type === 'up' ? !footballGame.pointer : Math.abs(event.x - last.x) < .1 && Math.abs(event.y - last.y) < .1);
      }, { type, last });
      if (delivered) return;
      await sleep(8);
    }
    throw Error(`Native ${type} was not delivered`);
  };
}
const chrome = await chromium.launch({ channel: 'chrome', headless: true });
const safari = await webkit.launch({ headless: true });
try {
  for (const [name, browser, touch, isSafari] of [['Desktop Chrome', chrome, false, false], ['Pixel 7', chrome, true, false], ['iPhone 13', safari, true, true]]) {
    const context = await browser.newContext({ ...devices[name] });
    await context.addInitScript(() => { Math.random = () => .42; });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.clock.install({ time: new Date('2026-11-04T09:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-04T09:00:01Z'));
    const pointer = await pointerDriver(page, touch, isSafari);
    const tap = selector => touch ? page.locator(selector).tap({ force: true }) : page.locator(selector).click({ force: true });
    let start = await setup(page); await pointer('down', screen(start, start.ball));
    const frameRates = await page.evaluate(() => {
      const C = ShoparFootball.DrawShotController, values = [];
      for (const fps of [20,30,60,120,144]) {
        const c = new C({ flow: { state: 'AIMING' } }); c.points = [{ x: 500, y: 365 }];
        let elapsed = 0;
        for (const [time,expected] of [[.375,.8],[.75,1],[1.125,.8],[1.5,.6],[3.375,.8]]) {
          while (time - elapsed > 1e-10) { const dt = Math.min(1 / fps, time - elapsed); c.update(dt); elapsed += dt; }
          values.push({ fps, time, power: c.power, expected });
        }
      }
      return values;
    });
    check(frameRates.every(v => Math.abs(v.power - v.expected) < 1e-9), `${name}: time-based power at 20–144 FPS`, frameRates);
    let elapsed = 0;
    for (const [time, expected] of [[0,.6],[375,.8],[750,1],[1125,.8],[1500,.6],[1875,.8],[2250,1],[2625,.8],[3000,.6],[3375,.8]]) {
      await page.clock.runFor(time - elapsed); elapsed = time; const s = await snapshot(page);
      check(Math.abs(s.power - expected) < .01 && s.captured, `${name}: cycle at ${time}ms`, s.power);
    }
    check((await snapshot(page)).events.some(e => e.type === 'pointerdown' && e.trusted && e.pointerType === (touch ? 'touch' : 'mouse')), `${name}: trusted device input`);
    await pointer('cancel');
    for (const hold of [375,1125]) {
      start = await setup(page); await pointer('down', screen(start, start.ball)); await page.clock.runFor(hold);
      await pointer('move', screen(start, { x: start.ball.x, y: start.ball.y - 4 / start.view.scale }));
      const jitter = await snapshot(page); await page.clock.runFor(32); const stillHeld = await snapshot(page);
      check(!stillHeld.drawing && stillHeld.power !== jitter.power, `${name}: jitter keeps cycling on the ${hold}ms half`);
      await pointer('move', screen(start, { x: start.ball.x, y: start.ball.y - 60 / start.view.scale }));
      const locked = await snapshot(page); await page.clock.runFor(1700);
      check(locked.drawing && (await snapshot(page)).power === locked.power, `${name}: current power stays locked`);
      await pointer('up'); const released = await snapshot(page);
      check(released.state === 'BALL_IN_MOTION' && released.power === locked.power && JSON.stringify(released.shot) === JSON.stringify(locked.shot), `${name}: release retains exact locked shot`);
    }
    for (const [kind, bend, height, chip] of [['straight',0,0,false],['left',-40,0,false],['right',40,0,false],['high',0,90,false],['chip',25,60,true]]) {
      start = await setup(page); if (chip) await tap('#chip-button');
      const end = { x: 450, y: 84 - height * .52 + (touch ? 95 / start.view.scale : 0) };
      await pointer('down', screen(start, start.ball)); await page.clock.runFor(375);
      for (let i = 1; i <= 20; i++) {
        const t = i / 20;
        await pointer('move', screen(start, { x: start.ball.x + (end.x - start.ball.x) * t + bend * Math.sin(Math.PI * t), y: start.ball.y + (end.y - start.ball.y) * t }));
        await page.clock.runFor(16);
      }
      const s = await snapshot(page), path = s.aim.path, cursor = s.cursor;
      check(path[0].x === start.ball.x && path[0].y === start.ball.y && path.at(-1).x === cursor.x && path.at(-1).y === cursor.y, `${name}/${kind}: anchored aiming line and cursor`);
      check(touch ? Math.abs((cursor.finger.y - cursor.y) * s.view.scale - 95) < 1e-6 : cursor.finger === null, `${name}/${kind}: finger offset`);
      check(bend ? Math.sign(s.shot.spin) === -Math.sign(bend) : s.shot.spin === 0, `${name}/${kind}: existing curve behavior`);
      check(await page.evaluate(() => {
        const c = footballGame.controller, C = ShoparFootball.DrawShotController;
        return JSON.stringify(c.shot) === JSON.stringify(C.buildShot(c.effectiveAim.points, c.chip, c.context.physics, c.power));
      }), `${name}/${kind}: shot uses the locked power`);
      await pointer('up'); const released = await snapshot(page);
      check(released.state === 'BALL_IN_MOTION' && !released.pointer && JSON.stringify(released.shot) === JSON.stringify(s.shot), `${name}/${kind}: release preserves shot`);
    }
    await setup(page);
    const guards = await page.evaluate(() => {
      const test = target => ['contextmenu', 'selectstart', 'dragstart'].map(type => !target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })));
      return { canvas: test(footballGame.canvas), button: test(document.getElementById('chip-button')), dialog: test(document.getElementById('help-dialog')),
        css: getComputedStyle(footballGame.canvas).userSelect, touch: getComputedStyle(footballGame.canvas).touchAction, focusable: footballGame.canvas.tabIndex };
    });
    check(guards.canvas.every(Boolean) && guards.button.every(x => !x) && guards.dialog.every(x => !x), `${name}: selection guards are canvas-only`, guards);
    check(guards.css === 'none' && guards.touch === 'none' && guards.focusable === 0, `${name}: canvas CSS and keyboard focus`, guards);
    await tap('#chip-button'); check(await page.evaluate(() => footballGame.controller.chip), `${name}: CHIP works`);
    start = await snapshot(page); await pointer('down', screen(start, start.ball));
    check(await page.locator('#chip-button').isDisabled(), `${name}: CHIP locks while holding`);
    await pointer('cancel'); check(!(await snapshot(page)).shot && !(await page.locator('#chip-button').isDisabled()), `${name}: cancellation clears hold`);
    await tap('#restart-button'); await page.clock.runFor(1000);
    check(await page.evaluate(() => footballGame.state === 'AIMING' && footballGame.controller.power === .6 && !footballGame.controller.chip), `${name}: Restart works`);
    await tap('#help-button'); check(await page.locator('#help-dialog').evaluate(e => e.open), `${name}: Help opens`);
    check((await page.locator('#help-steps').innerText()).includes('1.5 seconds') && (await page.locator('#help-detail').innerText()).includes('lock that value'), `${name}: help explains cycling and locking`);
    await page.keyboard.press('Escape'); check(!(await page.locator('#help-dialog').evaluate(e => e.open)), `${name}: keyboard closes Help`);
    await tap('#conditions-button'); check(await page.locator('#conditions-dialog').evaluate(e => e.open), `${name}: Settings opens`);
    await tap('label.weather-option:has(input[value="rain"])'); await tap('#conditions-done');
    check(await page.evaluate(() => footballGame.environment.weather === 'rain' && !document.getElementById('conditions-dialog').open), `${name}: Settings changes and closes`);
    await tap('#highlight-button'); await page.locator('[data-highlight="0"]').evaluate(e => e.scrollIntoView({ block: 'nearest' })); await tap('[data-highlight="0"]'); await page.clock.runFor(1000);
    check(await page.evaluate(() => footballGame.index === 0 && footballGame.state === 'AIMING'), `${name}: highlight selection works`);
    start = await snapshot(page); await pointer('down', screen(start, start.ball)); await pointer('move', screen(start, { x: start.ball.x, y: start.ball.y + 140 })); await pointer('up');
    check((await snapshot(page)).state === 'BALL_CONTACT', `${name}: original highlight controls still work`);
    await context.close();
    const liveContext = await browser.newContext({ ...devices[name] }), live = await liveContext.newPage();
    live.on('pageerror', e => errors.push(`${name}: ${e.message}`)); const livePointer = await pointerDriver(live, touch, isSafari);
    for (const duration of [1000,2000]) {
      start = await setup(live, false); await livePointer('down', screen(start, start.ball)); await sleep(duration);
      const held = await snapshot(live);
      for (let i = 1; i <= 12; i++) {
        await livePointer('move', screen(start, { x: start.ball.x - 30 / start.view.scale * i / 12, y: start.ball.y - 140 / start.view.scale * i / 12 })); await sleep(17);
      }
      const drawn = await snapshot(live);
      check(held.captured && drawn.drawing && !drawn.selection && drawn.scroll.every(v => v === 0) && !drawn.events.some(e => e.trusted && ['contextmenu','selectstart','dragstart','pointercancel'].includes(e.type)), `${name}: ${duration}ms long press remains a smooth captured gesture`, drawn.events);
      await live.screenshot({ path: join(artifacts, `${name.replaceAll(' ', '-')}-${duration}.png`) });
      await livePointer('up');
      check((await snapshot(live)).state === 'BALL_IN_MOTION', `${name}: long press then draw/release shoots`);
    }
    await liveContext.close();
  }
  check(errors.length === 0, 'No application exceptions', errors);
} finally {
  await chrome.close(); await safari.close();
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ results, errors }, null, 2));
}
const failed = results.filter(r => !r.pass);
assert.equal(failed.length, 0, JSON.stringify(failed, null, 2));
console.log(`${results.length} Playwright checks passed. Artifacts: ${artifacts}`);
