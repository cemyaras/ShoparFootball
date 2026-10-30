/* Shopar Football — dependency-free, procedural Canvas football.
   World units remain constant; pointer and renderer use the same viewport transform. */
(() => {
  'use strict';

  const State = Object.freeze({ TITLE: 'TITLE', HIGHLIGHT_INTRO: 'HIGHLIGHT_INTRO', AIMING: 'AIMING', BALL_CONTACT: 'BALL_CONTACT', BALL_IN_MOTION: 'BALL_IN_MOTION', INTERCEPTION: 'INTERCEPTION', RESULT: 'RESULT', SESSION_SUMMARY: 'SESSION_SUMMARY' });
  const W = 1000, H = 740;
  const HEIGHT_PROJECTION = .52;
  const STADIUM_OFFSET = -48;
  // Projected mouth: 200 × 58.24; standing keeper: 40.7 units tall.
  // Net depth is separate from upright height; all heights use the ball's projection.
  const GOAL = Object.freeze({ height: 112, depth: 24, postWidth: 5, keeperScale: 1.1, keeperOffset: 16, keeperReach: 70, keeperReaction: .28 });
  // Keep player/ball proportions in world space, independent of viewport or DPR.
  const SPRITES = Object.freeze({ playerHeight: 37, farScale: 1.1, nearScale: 1.6, ballToPlayer: .23, maxAirScale: 1.18, airGrowth: .0018, footOffset: 10 });
  const FIELD = { left: 76, right: 924, top: 84, bottom: 684, goalLeft: 400, goalRight: 600, crossbar: GOAL.height };
  const CONTACT_TIME = 6;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const length = (x, y) => Math.hypot(x, y);
  const distance = (a, b) => length(a.x - b.x, a.y - b.y);
  const SCENARIOS = [
    { title: 'One on one.', tag: 'IN THE SPOTLIGHT', description: 'Just you and the keeper. Pick your corner. Hold your nerve.', intro: 'A great chance! You’re through on goal.', action: 'SHOOT', player: [500, 365], mates: [], defenders: [], tip: 'Aim away from the keeper. A firm shot into a corner is hard to stop.' },
    { title: 'From distance.', tag: 'A LITTLE AMBITION', description: 'Outside the box. A sliver of space. Give the keeper something to think about.', intro: 'Space opens up outside the area. Have a go!', action: 'SHOOT', player: [540, 520], mates: [[735, 345]], defenders: [[408, 320], [657, 268]], tip: 'You’ll need power from here. Tap below the ball’s center for a little lift.' },
    { title: 'The through ball.', tag: 'SEE IT BEFORE THEY DO', description: 'Your teammate is on the move. Find the space, then find the finish.', intro: 'A runner breaks free on the left. Lead the pass!', action: 'PASS', player: [600, 476], mates: [[340, 390]], defenders: [[516, 308], [730, 278]], tip: 'Pass toward the mint run marker. Your teammate will chase the ball, then you can shoot.' },
    { title: 'Two against two.', tag: 'BETTER TOGETHER', description: 'Two shirts ahead of you. A teammate to your right. Find your way through.', intro: 'Two against two. Combine, or back yourself.', action: 'PASS', player: [379, 425], mates: [[680, 350]], defenders: [[464, 300], [590, 263]], tip: 'A ground pass across to your teammate can open a better angle. Or take the shot.' },
    { title: 'Read the game.', tag: 'RIGHT PLACE. RIGHT TIME.', description: 'The ball is on its way. Read the pass, get there, and make it yours.', intro: 'An incoming pass! Tap the marked space to meet it.', action: 'SHOOT', player: [485, 428], mates: [[200, 320]], defenders: [[737, 292]], tip: 'Tap ahead of the moving ball, near the mint ring. You move automatically.' }
  ];

  class AudioSystem {
    constructor() { this.enabled = false; this.context = null; }
    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume().catch(() => { }); } catch { this.enabled = false; }
      }
      $('sound-button').setAttribute('aria-pressed', String(this.enabled));
      $('sound-button').setAttribute('aria-label', this.enabled ? 'Mute sound' : 'Enable sound');
      $('sound-waves').setAttribute('d', this.enabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
      if (this.enabled) this.play('tap');
    }
    play(kind) {
      if (!this.enabled || !this.context) return;
      const ctx = this.context, now = ctx.currentTime;
      const notes = kind === 'goal' ? [440, 554, 659, 880] : kind === 'kick' ? [140, 75] : kind === 'save' ? [220, 110] : [520];
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), at = now + i * .09;
        osc.type = kind === 'kick' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(kind === 'kick' ? .14 : .065, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + .18);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + .2);
      });
    }
  }

  class FootballGame {
    constructor() {
      this.canvas = $('game'); this.ctx = this.canvas.getContext('2d'); this.audio = new AudioSystem();
      this.state = State.TITLE; this.stateTime = 0; this.time = 0; this.index = 0; this.mode = 'SHOOT';
      this.stats = { goals: 0, passes: 0, misses: 0, receives: 0 }; this.outcomes = [];
      this.pointer = null; this.aim = null; this.kick = null; this.contact = null;
      this.particles = []; this.trail = []; this.ripples = []; this.toastTime = 0; this.shake = 0; this.flash = 0;
      this.view = { scale: 1, x: 0, y: 0, width: 1000, height: 740 }; this.lastTime = null;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.banner = null; this.netWobble = 0; this.crowd = this.initCrowd();
      this.handlers = []; this.loadActors(0); this.bindEvents(); this.resize(); this.updateUI();
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe($('canvas-wrap'));
      this.frame = this.frame.bind(this); this.raf = requestAnimationFrame(this.frame);
    }
    listen(target, type, handler, options) { target.addEventListener(type, handler, options); this.handlers.push(() => target.removeEventListener(type, handler, options)); }
    bindEvents() {
      this.listen(this.canvas, 'pointerdown', e => this.onPointerDown(e));
      this.listen(this.canvas, 'pointermove', e => this.onPointerMove(e));
      this.listen(this.canvas, 'pointerup', e => this.onPointerUp(e));
      this.listen(this.canvas, 'pointercancel', e => this.cancelPointer(e.pointerId));
      this.listen(this.canvas, 'lostpointercapture', e => { if (this.pointer?.id === e.pointerId) this.cancelPointer(e.pointerId); });
      this.listen(this.canvas, 'contextmenu', e => e.preventDefault());
      this.listen($('play-button'), 'click', () => this.startSession());
      this.listen($('again-button'), 'click', () => this.startSession());
      this.listen($('next-button'), 'click', () => this.nextHighlight());
      this.listen($('restart-button'), 'click', () => { if (![State.TITLE, State.SESSION_SUMMARY].includes(this.state)) this.restart(); });
      this.listen($('shoot-button'), 'click', () => this.selectMode('SHOOT'));
      this.listen($('pass-button'), 'click', () => this.selectMode('PASS'));
      this.listen($('sound-button'), 'click', () => this.audio.toggle());
      this.listen(window, 'resize', () => this.resize());
      if (window.visualViewport) this.listen(window.visualViewport, 'resize', () => this.resize());
      this.listen(window, 'blur', () => this.cancelPointer(this.pointer?.id));
      this.listen(document, 'visibilitychange', () => { this.lastTime = null; if (document.hidden) this.cancelPointer(this.pointer?.id); });
    }
    destroy() { this.handlers.forEach(remove => remove()); this.resizeObserver.disconnect(); cancelAnimationFrame(this.raf); this.audio.context?.close(); }
    resize() {
      const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (!rect.width || !rect.height) return;
      this.compact = window.matchMedia('(max-width: 1024px), (max-width: 1180px) and (max-height: 600px)').matches;
      const bounds = this.cameraBounds();
      const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height);
      const next = { width: rect.width, height: rect.height, scale, x: (rect.width - bounds.width * scale) / 2 - bounds.left * scale, y: (rect.height - bounds.height * scale) / 2 - bounds.top * scale };
      // Repeated visualViewport events need not cancel a gesture if mapping is unchanged.
      const changed = Math.abs(next.scale - this.view.scale) > .0001 || Math.abs(next.x - this.view.x) > .25 || Math.abs(next.y - this.view.y) > .25;
      if (changed && this.pointer) this.cancelPointer(this.pointer.id);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.dpr = dpr; this.view = next;
      document.body.classList.toggle('contact-tight', this.compact && rect.height < 300);
    }
    cameraBounds() {
      if (!this.compact) return { left: 0, top: STADIUM_OFFSET, width: W, height: H - STADIUM_OFFSET };
      // Frame the opportunity rather than shrinking the entire pitch onto a phone.
      // Bounds are stable during play; they update at possession/state changes only.
      const actors = [this.player, ...this.mates, ...this.defenders];
      const xs = actors.map(p => p.startX), ys = actors.map(p => p.startY);
      xs.push(this.controlled.x); ys.push(this.controlled.y);
      if (this.index === 4) xs.push(180, 865);
      const left = Math.max(30, Math.min(370, ...xs) - 75);
      const right = Math.min(970, Math.max(630, ...xs) + 75);
      const bottom = Math.min(725, Math.max(...ys) + 130);
      return { left, top: STADIUM_OFFSET, width: right - left, height: bottom - STADIUM_OFFSET };
    }
    toWorld(e) { const r = this.canvas.getBoundingClientRect(), v = this.view; return { x: (e.clientX - r.left - v.x) / v.scale, y: (e.clientY - r.top - v.y) / v.scale }; }
    maxDrag() { return clamp(Math.min(this.view.width, this.view.height) * .25, 68, 110) / this.view.scale; }
    contactGeometry() {
      const v = this.view, tight = this.compact && v.height < 300;
      const top = this.compact ? (tight ? 48 : 92) : v.height * .29;
      const bottom = this.compact ? v.height - (tight ? 38 : 50) : v.height * .82;
      const radius = Math.max(20, Math.min(this.compact ? 115 : 140, v.width * .32, (bottom - top) / 2));
      return { x: (v.width / 2 - v.x) / v.scale, y: ((top + bottom) / 2 - v.y) / v.scale, r: radius / v.scale };
    }
    initCrowd() {
      const crowd = [];
      const shirtColors = ['#e53935', '#1e88e5', '#fbc02d', '#ffffff', '#43a047', '#ff7043', '#8e24aa', '#00acc1', '#ff4081', '#3949ab'];
      const skinColors = ['#ffcc80', '#f5b041', '#e0ac69', '#8d5524', '#c68642'];
      const hairColors = ['#212121', '#4e342e', '#ffd54f', '#6d4c41'];
      for (let row = 0; row < 4; row++) {
        const y = 11 + row * 8.5;
        for (let x = 80; x <= 920; x += 11) {
          const seed = row * 99 + x;
          crowd.push({
            x: x + ((seed % 5) - 2), y, row,
            shirt: shirtColors[(seed * 7) % shirtColors.length],
            skin: skinColors[(seed * 3) % skinColors.length],
            hair: hairColors[(seed * 11) % hairColors.length],
            phase: (seed % 30) * 0.25
          });
        }
      }
      return crowd;
    }
    makePlayer(x, y, team, number) { return { x, y, startX: x, startY: y, tx: x, ty: y, team, number, step: 0, celebration: 0 }; }
    depthScale(y) {
      const nearGoal = FIELD.top + GOAL.keeperOffset;
      return lerp(SPRITES.farScale, SPRITES.nearScale, clamp((y - nearGoal) / (FIELD.bottom - nearGoal), 0, 1));
    }
    playerScale(player) { return player.team === 'keeper' ? GOAL.keeperScale : this.depthScale(player.y); }
    possessionPosition(player) {
      const offset = SPRITES.footOffset * this.playerScale(player);
      return { x: player.x + offset, y: player.y + offset };
    }
    ballGeometry(ball) {
      const groundRadius = SPRITES.playerHeight * SPRITES.ballToPlayer * .5 * this.depthScale(ball.y);
      const airScale = clamp(1 + Math.max(0, ball.z) * SPRITES.airGrowth, 1, SPRITES.maxAirScale);
      return { groundRadius, radius: groundRadius * airScale, height: ball.z * HEIGHT_PROJECTION };
    }
    loadActors(index) {
      const s = SCENARIOS[index];
      this.player = this.makePlayer(...s.player, 'blue', 9); this.controlled = this.player;
      this.mates = s.mates.map((p, i) => this.makePlayer(...p, 'blue', 7 + i * 4));
      this.defenders = s.defenders.map((p, i) => this.makePlayer(...p, 'red', 4 + i));
      this.keeper = { ...this.makePlayer(500, FIELD.top + GOAL.keeperOffset, 'keeper', 1), reaction: GOAL.keeperReaction, dive: 0, diveCooldown: 0, targetX: 500 };
      this.ball = { ...this.possessionPosition(this.player), z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
      this.trail = []; this.particles = []; this.ripples = []; this.pointer = null; this.aim = null; this.contact = null; this.kick = null;
      this.pendingResult = null;
      this.resolution = null; this.flight = null; this.banner = null; this.netWobble = 0;
      this.interceptTarget = null; this.interceptSuggested = { x: 500, y: 320 }; this.passCount = 0; this.motionTime = 0; this.shake = 0;
      this.scenarioSnapshot = { ...this.stats }; this.mode = s.action;
    }
    transition(next) {
      this.cancelPointer(this.pointer?.id); this.state = next; this.stateTime = 0;
      document.body.classList.toggle('is-playing', next !== State.TITLE);
      document.body.dataset.state = next;
      $('title-overlay').classList.toggle('hidden', next !== State.TITLE);
      $('result-overlay').classList.toggle('hidden', next !== State.RESULT);
      $('summary-overlay').classList.toggle('hidden', next !== State.SESSION_SUMMARY);
      $('contact-heading').classList.toggle('hidden', next !== State.BALL_CONTACT);
      $('contact-footer').classList.toggle('hidden', next !== State.BALL_CONTACT);
      if (next === State.BALL_CONTACT) {
        this.toastTime = 0; $('toast').classList.add('hidden');
        $('contact-heading').querySelector('p').textContent = 'Tap the ball to choose your contact.';
      }
      // Contact and flight retain the aim camera; a new possession reframes the play.
      if ([State.HIGHLIGHT_INTRO, State.AIMING, State.INTERCEPTION].includes(next)) this.resize();
      this.updateUI();
    }
    startSession() {
      if (![State.TITLE, State.SESSION_SUMMARY].includes(this.state)) return;
      this.stats = { goals: 0, passes: 0, misses: 0, receives: 0 }; this.outcomes = []; this.index = 0; this.beginHighlight(); this.audio.play('tap');
    }
    beginHighlight() {
      this.loadActors(this.index); this.transition(State.HIGHLIGHT_INTRO);
      this.toast(SCENARIOS[this.index].intro, 2.8);
    }
    restart() {
      this.stats = { ...this.scenarioSnapshot }; this.outcomes[this.index] = undefined; this.beginHighlight();
    }
    nextHighlight() {
      if (this.state !== State.RESULT) return;
      if (this.index === 4) { this.showSummary(); return; }
      this.index++; this.beginHighlight();
    }
    selectMode(mode) {
      if (this.state !== State.AIMING || this.pointer) return;
      this.mode = mode; this.aim = null; this.updatePower(0); this.updateUI(); this.audio.play('tap');
    }
    updateUI() {
      const s = SCENARIOS[this.index], enabled = this.state === State.AIMING;
      $('score').textContent = this.stats.goals;
      $('chapter-number').innerHTML = `${String(this.index + 1).padStart(2, '0')} <span>/ 05</span>`;
      $('scenario-title').textContent = s.title; $('scenario-tag').textContent = s.tag; $('scenario-description').textContent = s.description;
      $('shoot-button').classList.toggle('selected', this.mode === 'SHOOT'); $('pass-button').classList.toggle('selected', this.mode === 'PASS');
      for (const mode of ['SHOOT', 'PASS']) { const button = $(mode.toLowerCase() + '-button'); button.disabled = !enabled; button.setAttribute('aria-pressed', String(this.mode === mode)); }
      $('restart-button').disabled = [State.TITLE, State.SESSION_SUMMARY].includes(this.state);
      const status = { TITLE: 'READY WHEN YOU ARE', HIGHLIGHT_INTRO: 'A MOMENT OF POSSIBILITY', AIMING: 'YOUR BALL. YOUR CALL.', BALL_CONTACT: 'FIND YOUR TOUCH', BALL_IN_MOTION: 'WATCH IT UNFOLD', INTERCEPTION: 'READ THE PASS', RESULT: 'MOMENT COMPLETE', SESSION_SUMMARY: 'THAT’S FULL TIME' };
      $('match-status').textContent = status[this.state];
      $('pitch-label').textContent = this.state === State.TITLE ? 'YOUR NEXT BIG MOMENT' : `HIGHLIGHT ${String(this.index + 1).padStart(2, '0')} / ${s.title.toUpperCase().replace('.', '')}`;
      $('phase-label').textContent = this.state === State.BALL_CONTACT ? '02 — STRIKE' : this.state === State.INTERCEPTION ? '01 — MEET IT' : this.state === State.BALL_IN_MOTION ? '03 — IN PLAY' : '01 — AIM';
      let coachTitle = 'Pull back. Let fly.', coachCopy = 'Drag back from the ball to aim. Release, then tap the big ball to add your finishing touch.', icon = '↙';
      if (this.state === State.BALL_CONTACT) { coachTitle = 'It’s all in the contact.'; coachCopy = 'Center for a straight ball. Left or right for curve. Below center for loft. You have six seconds.'; icon = '◎'; }
      else if (this.state === State.INTERCEPTION) { coachTitle = 'Be there before the ball.'; coachCopy = SCENARIOS[4].tip; icon = '⌖'; }
      else if (this.state === State.BALL_IN_MOTION) { coachTitle = this.mode === 'PASS' ? 'Find your teammate.' : 'Let the ball do the talking.'; coachCopy = 'Watch the play unfold. Possession returns to you when a teammate receives your pass.'; icon = '↗'; }
      else if (this.state === State.RESULT) { coachTitle = 'Another moment awaits.'; coachCopy = 'Keep going, or restart this highlight to try a different approach.'; icon = '→'; }
      else if (this.state === State.AIMING) { coachCopy = s.tip; }
      $('coach-title').textContent = coachTitle; $('coach-copy').textContent = coachCopy; $('coach-icon').textContent = icon;
      $('bottom-hint').textContent = this.state === State.INTERCEPTION ? 'Tap the pitch to meet the incoming pass.' : this.state === State.AIMING ? 'Drag back from the ball. Release to choose your contact.' : this.state === State.BALL_CONTACT ? 'Your touch changes everything.' : 'A little instinct goes a long way.';
      if (this.state === State.BALL_IN_MOTION && this.contact) {
        const curve = this.contact.x < -.15 ? 'Rightward curve' : this.contact.x > .15 ? 'Leftward curve' : 'Straight contact';
        const flight = this.contact.y > .25 ? 'lofted flight' : this.contact.y < -.2 ? 'low flight' : 'clean strike';
        $('bottom-hint').textContent = `${curve} · ${flight}`;
      }
      [...$('chapter-progress').children].forEach((el, i) => { el.className = i === this.index ? 'current' : i < this.index ? 'done' : ''; });
      [...$('scenario-list').children].forEach((el, i) => { el.className = 'moment' + (i === this.index ? ' active' : '') + (this.outcomes[i] === true ? ' complete' : this.outcomes[i] === false ? ' failed' : ''); el.querySelector('i').textContent = this.outcomes[i] === true ? '✓' : this.outcomes[i] === false ? '×' : i === this.index ? '↗' : '·'; });
      this.updateFlightUI();
    }
    updatePower(power) { $('power-fill').style.width = `${Math.round(power * 100)}%`; $('power-value').textContent = power ? `${Math.round(power * 100)}%` : '—'; }
    toast(message, seconds = 2.2) { $('toast').textContent = message; $('toast').classList.remove('hidden'); this.toastTime = seconds; }
    onPointerDown(e) {
      if (e.button !== 0 || this.pointer || e.isPrimary === false) return;
      const p = this.toWorld(e);
      if (this.state === State.TITLE) { this.startSession(); return; }
      if (this.state === State.INTERCEPTION) {
        e.preventDefault(); this.interceptTarget = { x: clamp(p.x, FIELD.left + 12, FIELD.right - 12), y: clamp(p.y, FIELD.top + 25, FIELD.bottom - 20) };
        this.ripples.push({ ...this.interceptTarget, age: 0 }); this.audio.play('tap'); return;
      }
      if (this.state === State.AIMING) {
        if (distance(p, this.ball) > Math.max(55, 44 / this.view.scale)) { this.toast('Start your drag near the glowing ball.', 1.8); return; }
        e.preventDefault(); this.pointer = { id: e.pointerId, start: p, last: p }; this.aim = { dx: 0, dy: -1, power: 0, distance: 0 }; this.canvas.setPointerCapture(e.pointerId); this.toastTime = 0;
      } else if (this.state === State.BALL_CONTACT && !this.contact) {
        e.preventDefault(); this.pointer = { id: e.pointerId, start: p, last: p }; this.canvas.setPointerCapture(e.pointerId);
      }
    }
    onPointerMove(e) {
      if (!this.pointer || e.pointerId !== this.pointer.id) return;
      e.preventDefault(); this.pointer.last = this.toWorld(e);
      if (this.state === State.AIMING) {
        const dx = this.pointer.start.x - this.pointer.last.x, dy = this.pointer.start.y - this.pointer.last.y, d = length(dx, dy);
        this.aim = { dx: d > 0 ? dx / d : 0, dy: d > 0 ? dy / d : -1, power: clamp(d / this.maxDrag(), 0, 1), distance: d }; this.updatePower(this.aim.power);
      }
    }
    onPointerUp(e) {
      if (!this.pointer || e.pointerId !== this.pointer.id) return;
      e.preventDefault(); const p = this.toWorld(e), aim = this.aim;
      if (this.state === State.AIMING) {
        this.onPointerMove(e);
        const finalAim = this.aim;
        this.releasePointer();
        if (!finalAim || finalAim.distance < Math.max(13, 7 / this.view.scale)) { this.aim = null; this.updatePower(0); return; }
        this.kick = { dx: finalAim.dx, dy: finalAim.dy, power: Math.max(.16, finalAim.power), mode: this.mode };
        this.aim = null; this.transition(State.BALL_CONTACT); this.audio.play('tap');
      } else if (this.state === State.BALL_CONTACT) {
        this.releasePointer(); const g = this.contactGeometry();
        const dx = (p.x - g.x) / g.r, dy = (p.y - g.y) / g.r, radius = Math.max(1, Math.hypot(dx, dy));
        if (distance(p, g) <= g.r + 8 / this.view.scale) { this.chooseContact(dx / radius, dy / radius, false); }
        else $('contact-heading').querySelector('p').textContent = 'Tap inside the ball to strike it.';
      } else { this.releasePointer(); this.aim = aim; }
    }
    releasePointer() { const p = this.pointer; this.pointer = null; if (p && this.canvas.hasPointerCapture(p.id)) this.canvas.releasePointerCapture(p.id); }
    cancelPointer(id) { if (this.pointer && id === this.pointer.id) { this.releasePointer(); if (this.state === State.AIMING) { this.aim = null; this.updatePower(0); } } }
    chooseContact(x, y, timedOut) {
      if (this.state !== State.BALL_CONTACT || this.contact) return;
      this.contact = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), timedOut, age: 0 }; this.audio.play('tap');
      if (timedOut) this.toast('Late contact — a little less power and accuracy.', 2);
    }
    // The same velocity/height/spin model drives both live kicks and the aim preview.
    kickVelocity(kick, contact) {
      const r = length(contact.x, contact.y), edge = Math.max(0, r - .78), accuracy = contact.timedOut ? .15 : edge * .18;
      const angle = Math.atan2(kick.dy, kick.dx) + (contact.timedOut ? .12 : contact.x * accuracy);
      const speed = (kick.mode === 'SHOOT' ? 220 + kick.power * 530 : 155 + kick.power * 370) * (1 - edge * .2) * (contact.timedOut ? .68 : 1);
      const loftPower = kick.mode === 'SHOOT' ? .65 + .7 * kick.power : 1;
      const loft = Math.max(0, (kick.mode === 'SHOOT' ? 62 : 22) + contact.y * (kick.mode === 'SHOOT' ? 245 : 175));
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: loft * loftPower, spin: -contact.x * .82 };
    }
    executeKick() {
      if (!this.kick || !this.contact) return;
      Object.assign(this.ball, this.kickVelocity(this.kick, this.contact), { age: 0, z: 0 });
      Object.assign(this.ball, this.possessionPosition(this.controlled));
      // A short reaction delay keeps corner shots viable from the foot-level origin.
      this.motionTime = 0; this.trail = []; this.keeper.reaction = GOAL.keeperReaction; this.keeper.dive = 0; this.keeper.diveCooldown = 0;
      this.mode = this.kick.mode; this.kicker = this.controlled; this.audio.play('kick');
      this.flight = { maxHeight: 0, clearedKeeper: false };
      this.shake = this.mode === 'SHOOT' && this.kick.power > .78 && !this.reducedMotion ? 5 : 0;
      this.transition(State.BALL_IN_MOTION);
    }
    startInterception() {
      Object.assign(this.ball, { x: 200, y: 320, z: 0, vx: 215, vy: 0, vz: 0, spin: 0, age: 0 });
      this.controlled = this.player; this.interceptTarget = null; this.motionTime = 0; this.transition(State.INTERCEPTION);
      this.toast('Tap the mint ring to meet the pass.', 2.3);
    }
    receive(player, offBall = false) {
      this.controlled = player; Object.assign(this.ball, this.possessionPosition(player));
      Object.assign(this.ball, { z: 0, vx: 0, vy: 0, vz: 0, spin: 0 }); this.trail = []; this.aim = null; this.contact = null; this.kick = null;
      if (offBall) this.stats.receives++; else { this.stats.passes++; this.passCount++; }
      this.mode = 'SHOOT'; this.transition(State.AIMING); this.updatePower(0); this.audio.play('tap');
      this.flight = null; this.updateFlightUI();
      this.toast(offBall ? 'Beautifully read. Now find the finish.' : 'Pass complete. You control the receiver — take your shot!', 2.8);
    }
    finish(kind, detail) {
      if (this.pendingResult || [State.RESULT, State.SESSION_SUMMARY].includes(this.state)) return;
      const success = kind === 'goal'; this.outcomes[this.index] = success;
      this.resolution = { kind, elapsed: 0, netHit: false, crossing: { x: this.ball.x, y: this.ball.y, z: this.ball.z } };
      const chip = success && this.flight?.clearedKeeper;
      if (success) {
        this.stats.goals++; this.audio.play('goal'); this.celebrate(); this.flash = .2;
        this.banner = { text: 'GOAL!', sub: chip ? 'CHIPPED OVER THE KEEPER' : 'BELOW THE BAR. IN THE NET.', color: '#d0f69a', time: 2.4, max: 2.4 };
      } else {
        this.stats.misses++; if (kind === 'save') this.audio.play('save');
        const bMap = {
          save: { text: 'SAVED!', sub: 'KEEPER DENIES!', color: '#ff5252' },
          blocked: { text: 'BLOCKED!', sub: 'DEFENDER STEPS IN', color: '#ff9800' },
          intercepted: { text: 'INTERCEPTED!', sub: 'PASS CUT OUT', color: '#ff9800' },
          high: { text: 'OVER THE BAR!', sub: 'TOO MUCH LOFT', color: '#90caf9' },
          wide: { text: 'WIDE OF POST!', sub: 'OFF TARGET', color: '#90caf9' },
          weak: { text: 'TOO WEAK!', sub: 'MORE POWER NEEDED', color: '#cfd8dc' },
          lost: { text: 'CHANCE GONE!', sub: 'TOO LATE', color: '#cfd8dc' }
        };
        bMap.bar = { text: 'CROSSBAR!', sub: 'OFF THE FRAME, BACK OUT', color: '#ffb74d' };
        bMap.post = { text: 'OFF THE POST!', sub: 'THE BALL STAYS OUT', color: '#ffb74d' };
        const b = bMap[kind] || { text: 'CHANCE MISSED!', sub: 'KEEP YOUR HEAD UP', color: '#f48fb1' };
        this.banner = { ...b, time: 2.0, max: 2.0 };
      }
      const titles = { goal: chip ? 'GOAL! Over the keeper.' : 'GOAL! Into the net.', save: 'Saved by the keeper.', blocked: 'Blocked by a defender.', intercepted: 'The pass is intercepted.', wide: 'Wide of the goal.', high: 'Over the crossbar.', bar: 'Off the crossbar!', post: 'Off the post!', weak: 'Not enough power.', lost: 'The chance is gone.' };
      $('result-title').textContent = titles[kind] || 'The chance slips away.';
      $('result-symbol').textContent = success ? '↗' : kind === 'save' ? '⊘' : '↘';
      $('result-symbol').style.color = success ? 'var(--mint)' : '#f4ae8f';
      $('result-kicker').textContent = success ? 'GOAL / THAT’S YOUR MOMENT' : kind === 'save' ? 'SAVED / TRY A DIFFERENT CORNER' : 'CHANCE MISSED / KEEP YOUR HEAD UP';
      $('result-detail').textContent = success ? (chip ? 'Your chip cleared the goalkeeper and crossed below the bar.' : 'The ball crossed the goal line between the posts and below the bar.') : detail;
      $('next-button').innerHTML = this.index === 4 ? 'See your performance <span>→</span>' : 'Next highlight <span>→</span>';
      // Leave the action visible before bringing up the result card.
      this.pendingResult = { kind, wait: success ? 2.1 : kind === 'high' || kind === 'wide' ? 1.6 : 1.35 }; this.aim = null; this.updateUI(); this.updateFlightUI();
    }
    celebrate() {
      const colors = ['#ffeb3b', '#e53935', '#1e88e5', '#ffffff', '#00e676', '#ff9100', '#d500f9'];
      for (let i = 0; i < 85; i++) this.particles.push({
        x: i % 2 ? FIELD.goalLeft - 34 : FIELD.goalRight + 34, y: FIELD.top + 60,
        vx: (i % 2 ? -1 : 1) * (45 + Math.random() * 110), vy: -70 - Math.random() * 190,
        life: 2.0 + Math.random() * 1.2, max: 3.2,
        color: colors[i % colors.length], size: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2, vRot: (Math.random() - .5) * 10
      });
      this.player.celebration = 3.2; this.mates.forEach(p => p.celebration = 3.2);
    }
    showSummary() {
      const score = clamp(Math.round(this.stats.goals * 16 + Math.min(this.stats.passes, 3) * 4 + this.stats.receives * 8), 0, 100);
      $('rating').textContent = score; $('total-goals').textContent = this.stats.goals; $('total-passes').textContent = this.stats.passes; $('total-misses').textContent = this.stats.misses;
      $('summary-title').textContent = score >= 75 ? 'You made it beautiful.' : score >= 40 ? 'Some moments of magic.' : 'The next moment is yours.';
      $('summary-detail').textContent = score >= 75 ? 'Vision, touch, and a little nerve. A performance to remember.' : 'Every chance teaches you something. Go again and find your touch.';
      this.toastTime = 0; this.transition(State.SESSION_SUMMARY);
    }
    frame(timestamp) {
      const dt = this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, .05); this.lastTime = timestamp;
      this.update(dt); this.render(); this.raf = requestAnimationFrame(this.frame);
    }
    update(dt) {
      this.time += dt; this.stateTime += dt;
      if (this.toastTime > 0) { this.toastTime -= dt; if (this.toastTime <= 0) $('toast').classList.add('hidden'); }
      else $('toast').classList.add('hidden');
      this.shake = Math.max(0, this.shake - dt * 16); this.flash = Math.max(0, this.flash - dt);
      if (this.banner) { this.banner.time -= dt; if (this.banner.time <= 0) this.banner = null; }
      this.netWobble = Math.max(0, this.netWobble - dt * 2.5);
      this.particles = this.particles.filter(p => {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt;
        if (p.rot !== undefined) p.rot += p.vRot * dt;
        return p.life > 0;
      });
      this.ripples = this.ripples.filter(p => (p.age += dt) < 1);
      for (const p of [this.player, ...this.mates]) p.celebration = Math.max(0, p.celebration - dt);
      if (this.pendingResult) {
        this.updateResolution(dt);
        this.pendingResult.wait -= dt;
        if (this.pendingResult.wait <= 0) { this.pendingResult = null; this.transition(State.RESULT); } return;
      }
      if (this.state === State.HIGHLIGHT_INTRO && this.stateTime > .85) {
        if (this.index === 4) this.startInterception(); else { this.transition(State.AIMING); this.updatePower(0); }
      } else if (this.state === State.BALL_CONTACT) {
        $('contact-timer-fill').style.width = `${Math.max(0, 1 - this.stateTime / CONTACT_TIME) * 100}%`;
        if (this.contact) { this.contact.age += dt; if (this.contact.age > .23) this.executeKick(); }
        else if (this.stateTime >= CONTACT_TIME) this.chooseContact(.32, .15, true);
      } else if (this.state === State.BALL_IN_MOTION || this.state === State.INTERCEPTION) {
        // Slow the presentation, including AI, around the goal without changing physics.
        const motionDt = dt * (this.state === State.BALL_IN_MOTION && this.mode === 'SHOOT' ? (this.ball.y < 265 ? .42 : .72) : 1);
        this.motionTime += motionDt;
        const steps = Math.max(1, Math.ceil(motionDt / (1 / 120))), step = motionDt / steps;
        for (let i = 0; i < steps && !this.pendingResult; i++) {
          if (![State.BALL_IN_MOTION, State.INTERCEPTION].includes(this.state)) break;
          if (this.state === State.INTERCEPTION) this.updateInterception(step); else this.updateMotion(step);
        }
        this.updateFlightUI();
      }
    }
    updateFlightUI() {
      const active = this.state === State.BALL_IN_MOTION && !this.resolution;
      $('flight-meter').classList.toggle('hidden', !active);
      if (this.resolution) {
        const messages = { goal: this.flight?.clearedKeeper ? 'GOAL · OVER THE KEEPER, INTO THE NET' : 'GOAL · BELOW THE BAR, INTO THE NET', save: 'SAVED · THE KEEPER HAS IT', high: 'OVER THE BAR · GOAL KICK', wide: 'WIDE · GOAL KICK', bar: 'CROSSBAR · THE BALL COMES BACK OUT', post: 'OFF THE POST · NO GOAL', blocked: 'BLOCKED BY THE DEFENDER', intercepted: 'PASS INTERCEPTED', weak: 'THE BALL RUNS OUT OF PACE', lost: 'CHANCE MISSED' };
        $('bottom-hint').textContent = messages[this.resolution.kind]; return;
      }
      if (!active) return;
      const b = this.ball, phase = b.z < 5 ? 'GROUND' : b.vz > 8 ? 'RISING' : b.vz < -8 ? 'DROPPING' : 'AT THE TOP';
      $('flight-height').style.width = `${clamp(b.z / FIELD.crossbar, 0, 1.25) * 80}%`;
      $('flight-label').textContent = b.z >= FIELD.crossbar ? 'ABOVE BAR' : phase;
      $('bottom-hint').textContent = `${this.mode === 'PASS' ? 'PASS' : (this.flight?.maxHeight || 0) > 45 || b.vz > 140 ? 'CHIP SHOT' : 'SHOT'} · ${phase}`;
    }
    updateResolution(dt) {
      const b = this.ball, r = this.resolution;
      r.elapsed += dt;
      if (r.kind === 'save') {
        this.trail.forEach(p => p.age += dt);
        const blend = 1 - Math.exp(-dt * 15);
        const angle = this.keeper.dive > 0 ? (this.keeper.diveDirection || 1) * -.75 : 0, handY = -10 * GOAL.keeperScale;
        b.x = lerp(b.x, this.keeper.x - Math.sin(angle) * handY, blend); b.y = lerp(b.y, this.keeper.y + Math.cos(angle) * handY, blend); b.z = lerp(b.z, 0, blend);
        b.vx = b.vy = b.vz = 0; this.keeper.dive = Math.max(0, this.keeper.dive - dt); return;
      }
      const motionDt = dt * (r.kind === 'goal' ? .7 : .45), steps = Math.max(1, Math.ceil(motionDt * 120));
      for (let i = 0; i < steps; i++) {
        this.integrateBall(b, motionDt / steps, false);
        if (r.kind === 'goal') {
          const back = FIELD.top - GOAL.depth + 3;
          if (b.y < back) {
            b.y = back; b.vy = Math.abs(b.vy) * .015; b.vx *= .45;
            if (!r.netHit) { r.netHit = true; this.netWobble = 1; }
          }
          if (b.x < FIELD.goalLeft + 7 || b.x > FIELD.goalRight - 7) { b.x = clamp(b.x, FIELD.goalLeft + 7, FIELD.goalRight - 7); b.vx *= -.2; }
          if (b.y > FIELD.top - 3) { b.y = FIELD.top - 3; b.vy = -Math.abs(b.vy) * .2; }
          if (b.z > FIELD.crossbar - 3) { b.z = FIELD.crossbar - 3; b.vz = -Math.abs(b.vz) * .2; }
          b.vx *= Math.exp(-2 * motionDt / steps); b.vy *= Math.exp(-2 * motionDt / steps);
        }
      }
      this.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 }); if (this.trail.length > 70) this.trail.shift();
      this.trail.forEach(p => p.age += dt);
    }
    integrateBall(ball, dt, pass = false) {
      const speed = length(ball.vx, ball.vy), spin = ball.spin;
      const ax = -ball.vy * spin * .80, ay = ball.vx * spin * .80;
      ball.vx += ax * dt; ball.vy += ay * dt;
      const friction = ball.z > 1 ? .10 : pass ? .74 : .49;
      const decay = Math.exp(-friction * dt); ball.vx *= decay; ball.vy *= decay;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.z > 0 || ball.vz > 0) { ball.vz -= 260 * dt; ball.z += ball.vz * dt; if (ball.z < 0) { ball.z = 0; ball.vz = Math.abs(ball.vz) > 65 ? -ball.vz * .23 : 0; } }
      ball.spin *= Math.exp(-dt * .23); ball.rotation += speed * dt * .045 + spin * dt * 4; ball.age += dt;
    }
    movePlayer(p, tx, ty, speed, dt) {
      const dx = tx - p.x, dy = ty - p.y, d = length(dx, dy), move = Math.min(d, speed * dt);
      if (d > .1) { p.x += dx / d * move; p.y += dy / d * move; p.step += move * .085; } p.tx = tx; p.ty = ty;
    }
    updateKeeper(dt) {
      const k = this.keeper, b = this.ball; k.reaction -= dt; k.diveCooldown = Math.max(0, k.diveCooldown - dt);
      if (k.reaction > 0) return;
      // Reaction follows the current ball with limited anticipation, never the planned aim.
      k.targetX = clamp(b.x + (b.vy < 0 ? b.vx * .08 : 0), FIELD.goalLeft + 18, FIELD.goalRight - 18);
      const danger = b.y < 255 && b.vy < -50;
      if (danger && !k.diveCooldown && Math.abs(b.x - k.x) > 22) { k.dive = .42; k.diveCooldown = 1.1; k.diveDirection = Math.sign(b.x - k.x); }
      k.dive = Math.max(0, k.dive - dt);
      this.movePlayer(k, k.targetX, FIELD.top + GOAL.keeperOffset, k.dive > 0 ? 185 : 105, dt);
    }
    updateAI(dt) {
      this.updateKeeper(dt); const b = this.ball;
      for (const d of this.defenders) {
        const react = b.age > .18, near = distance(d, b) < 210;
        const tx = react && near ? b.x + b.vx * .13 : d.startX, ty = react && near ? b.y + b.vy * .13 : d.startY;
        this.movePlayer(d, clamp(tx, 100, 900), clamp(ty, 132, 630), react && near ? 84 : 22, dt);
      }
      if (this.mode === 'PASS') {
        let receiver = null, best = Infinity;
        for (const p of [this.player, ...this.mates]) {
          if (p === this.kicker) continue;
          const score = distance(p, { x: b.x + b.vx * .38, y: b.y + b.vy * .38 });
          if (score < best) { best = score; receiver = p; }
        }
        for (const p of [this.player, ...this.mates]) {
          if (p === this.kicker) continue;
          if (p === receiver && best < 365) {
            // Run onto a pass and attack its landing point, including a lofted through ball.
            const lookAhead = clamp(distance(p, b) / 260, .08, .5);
            this.movePlayer(p, clamp(b.x + b.vx * lookAhead, 100, 900), clamp(b.y + b.vy * lookAhead, 135, 650), 132, dt);
          } else this.movePlayer(p, p.startX, p.startY - 28, 65, dt);
        }
      } else for (const p of this.mates) { if (p !== this.controlled) this.movePlayer(p, p.startX, p.startY - 35, 55, dt); }
    }
    goalLineOutcome(x, z) {
      // Airborne enlargement is a readability effect, not a larger collision sphere.
      const radius = this.ballGeometry({ x, y: FIELD.top, z: 0 }).groundRadius;
      const contactRadius = radius + GOAL.postWidth / 2;
      const height = z * HEIGHT_PROJECTION, barHeight = FIELD.crossbar * HEIGHT_PROJECTION;
      // Distance to finite, round-ended frame segments; corners have no box-shaped hit area.
      const postHeight = clamp(height, 0, barHeight);
      const leftDistance = Math.hypot(x - FIELD.goalLeft, height - postHeight);
      const rightDistance = Math.hypot(x - FIELD.goalRight, height - postHeight);
      if (Math.min(leftDistance, rightDistance) <= contactRadius) return 'post';
      const barX = clamp(x, FIELD.goalLeft, FIELD.goalRight);
      if (Math.hypot(x - barX, height - barHeight) <= contactRadius) return 'bar';
      const inside = x > FIELD.goalLeft + contactRadius && x < FIELD.goalRight - contactRadius;
      if (inside && height < barHeight - contactRadius) return 'goal';
      return height > barHeight + contactRadius && x > FIELD.goalLeft && x < FIELD.goalRight ? 'high' : 'wide';
    }
    updateMotion(dt) {
      this.updateAI(dt); const b = this.ball, previous = { x: b.x, y: b.y, z: b.z }; this.integrateBall(b, dt, this.mode === 'PASS');
      if (this.flight) {
        this.flight.maxHeight = Math.max(this.flight.maxHeight, b.z);
        const plane = this.keeper.y - 7;
        if (previous.y >= plane && b.y < plane && b.z - this.ballGeometry(b).radius / HEIGHT_PROJECTION > GOAL.keeperReach && Math.abs(b.x - this.keeper.x) < 60) this.flight.clearedKeeper = true;
      }
      if (b.age > .035) { this.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 }); if (this.trail.length > 70) this.trail.shift(); }
      this.trail.forEach(t => t.age += dt);
      if (previous.y >= FIELD.top && b.y < FIELD.top) {
        const t = (previous.y - FIELD.top) / (previous.y - b.y), x = lerp(previous.x, b.x, t), z = lerp(previous.z, b.z, t);
        b.x = x; b.y = FIELD.top - .01; b.z = z;
        const outcome = this.goalLineOutcome(x, z);
        if (outcome === 'post' || outcome === 'bar') {
          b.vy = Math.abs(b.vy) * .42; b.vz = -Math.abs(b.vz) * .35;
          if (outcome === 'post') b.vx = Math.sign(x - 500) * Math.max(80, Math.abs(b.vx));
          this.audio.play('save'); this.finish(outcome, outcome === 'post' ? 'The ball clipped the upright and rebounded out.' : 'The ball hit the crossbar and came back out. Use a little less loft.');
        } else if (outcome === 'goal') this.finish('goal');
        else this.finish(outcome, outcome === 'high' ? 'The ball cleared the crossbar and continued behind the goal.' : 'The ball passed outside the posts. Aim farther inside the goal.');
        return;
      }
      if (b.x < FIELD.left || b.x > FIELD.right || b.y > FIELD.bottom) { this.finish('wide', 'Out of play. A little less power or curve may keep the next one in.'); return; }
      if (b.age > .12 && b.z - this.ballGeometry(b).radius / HEIGHT_PROJECTION < GOAL.keeperReach) {
        const k = this.keeper, radius = k.dive > 0 ? 32 : 23;
        if (length(b.x - k.x, b.y - (k.y - 7)) < radius) {
          this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0; k.dive = .65;
          this.finish('save', 'The keeper gets behind it. Try a firmer strike toward either corner.'); return;
        }
      }
      if (b.age > .14 && b.z < 26) {
        for (const d of this.defenders) if (length(b.x - d.x, b.y - (d.y - 7)) < 22) { this.ball.vx *= .12; this.ball.vy *= .12; this.finish(this.mode === 'PASS' ? 'intercepted' : 'blocked', this.mode === 'PASS' ? 'A defender stepped into the passing lane. Look for the open teammate.' : 'A red shirt gets in the way. A pass or a little loft could open the angle.'); return; }
      }
      if (this.mode === 'PASS' && b.age > .16 && b.z < 24) {
        for (const p of [this.player, ...this.mates]) if (p !== this.kicker && distance(p, b) < 31) {
          if (this.passCount >= 3) { this.mode = 'SHOOT'; this.toast('Time to finish. Take your shot!', 2); } this.receive(p); return;
        }
      }
      if ((length(b.vx, b.vy) < 38 && b.z < 3 && b.age > .7) || this.motionTime > 6) {
        this.finish('weak', this.mode === 'PASS' ? 'The pass ran out of room. Aim closer to your teammate and use a firm touch.' : 'The ball runs out of pace. Pull back farther to add power.');
      }
    }
    updateInterception(dt) {
      const b = this.ball; b.age += dt; b.x += b.vx * dt; b.rotation += dt * 6;
      this.trail.push({ x: b.x, y: b.y, z: 0, age: 0 }); if (this.trail.length > 40) this.trail.shift(); this.trail.forEach(t => t.age += dt);
      if (this.interceptTarget) this.movePlayer(this.player, this.interceptTarget.x, this.interceptTarget.y, 168, dt);
      for (const d of this.defenders) if (b.x > 565) this.movePlayer(d, b.x, b.y, 75, dt);
      if (distance(this.player, b) < 29) { this.receive(this.player, true); return; }
      for (const d of this.defenders) if (distance(d, b) < 24) { this.finish('intercepted', 'The defender got there first. Next time, meet the pass earlier.'); return; }
      if (b.x > 890 || this.motionTime > 4.2) this.finish('lost', 'The pass slipped past. Tap the mint ring early and let your player meet the ball.');
    }

    // Rendering has no gameplay side effects.
    render() {
      const c = this.ctx, v = this.view;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#16331d'; c.fillRect(0, 0, v.width, v.height);
      c.save(); c.translate(v.x, v.y); c.scale(v.scale, v.scale);
      if (this.shake > 0) c.translate(Math.sin(this.time * 86) * this.shake, Math.cos(this.time * 73) * this.shake * .55);
      this.drawPitch(c); this.drawGoalBack(c); this.drawRunMarkers(c);
      if (this.state === State.AIMING && this.aim?.power > .03) this.drawAim(c);
      this.drawTrail(c); this.drawBallShadow(c, this.ball);
      const actors = [this.player, ...this.mates, ...this.defenders, this.keeper].sort((a, b) => a.y - b.y);
      const aboveGoal = this.ballAboveGoal(), held = this.resolution?.kind === 'save'; let drawn = false;
      for (const p of actors) {
        if (!aboveGoal && !held && !drawn && this.ball.z < 35 && this.ball.y <= p.y) { this.drawBall(c, this.ball); drawn = true; }
        this.drawPlayer(c, p);
      }
      if (!aboveGoal && !drawn) this.drawBall(c, this.ball);
      if (this.resolution?.kind === 'goal') this.drawGoalBack(c, true);
      this.drawGoalFront(c);
      if (aboveGoal) this.drawBall(c, this.ball);
      this.drawCrossingMarker(c);
      for (const r of this.ripples) { c.strokeStyle = `rgba(198,255,0,${1 - r.age})`; c.lineWidth = 2; c.beginPath(); c.arc(r.x, r.y, 16 + r.age * 25, 0, Math.PI * 2); c.stroke(); }
      for (const p of this.particles) {
        c.save(); c.globalAlpha = Math.min(1, p.life); c.fillStyle = p.color;
        c.translate(p.x, p.y); c.rotate(p.rot || p.life * 4);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .7);
        c.restore();
      }
      if (this.state === State.AIMING && !this.aim) this.drawPossessionHint(c);
      if (this.state === State.BALL_CONTACT) this.drawContact(c);
      if (this.flash > 0 && !this.reducedMotion) { c.fillStyle = `rgba(255,255,255,${this.flash * .4})`; c.fillRect(0, 0, W, H); }
      c.restore();
      this.drawArcadeBanner(c);
    }
    ballAboveGoal() {
      return this.resolution?.kind === 'high' || this.ball.z - this.ballGeometry(this.ball).radius / HEIGHT_PROJECTION > FIELD.crossbar;
    }
    drawCrossingMarker(c) {
      const r = this.resolution;
      if (!r || !['goal', 'high', 'bar', 'post'].includes(r.kind) || r.elapsed > 1.2) return;
      const scale = this.view.scale, p = r.crossing, color = r.kind === 'goal' ? '#d0f69a' : r.kind === 'high' ? '#ff8e83' : '#ffca70';
      c.save(); c.translate(p.x, p.y - p.z * HEIGHT_PROJECTION);
      c.globalAlpha = clamp(1.4 - r.elapsed, 0, .9); c.strokeStyle = color; c.lineWidth = 2 / scale;
      c.beginPath(); c.arc(0, 0, (10 + Math.min(r.elapsed, .4) * 12) / scale, 0, Math.PI * 2); c.stroke();
      c.fillStyle = color; c.font = `bold ${12 / scale}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(r.kind === 'goal' ? '✓' : r.kind === 'high' ? '↑' : '×', 0, 0); c.restore();
    }
    drawPitch(c) {
      c.fillStyle = '#142b1a'; c.fillRect(-1000, -1000, 3000, 3000);

      // --- Retro Tribün / Taraftarlar (New Star Soccer Crowd) ---
      c.save(); c.translate(0, STADIUM_OFFSET);
      c.fillStyle = '#1e3324'; c.fillRect(70, 6, 860, 10);
      c.fillStyle = '#27402f'; c.fillRect(70, 16, 860, 10);
      c.fillStyle = '#304e39'; c.fillRect(70, 26, 860, 10);
      c.fillStyle = '#395b43'; c.fillRect(70, 36, 860, 10);
      c.fillStyle = '#b0bec5'; c.fillRect(70, 46, 860, 2); // Tribün parmaklığı

      const excited = this.pendingResult?.kind === 'goal' || this.player.celebration > 0;
      for (const fan of this.crowd) {
        const hop = excited ? -Math.abs(Math.sin(this.time * 14 + fan.phase)) * 6 : Math.sin(this.time * 2.5 + fan.phase) * 1.2;
        // Saç & Kafa
        c.fillStyle = fan.hair; c.fillRect(fan.x - 2, fan.y - 6 + hop, 5, 3);
        c.fillStyle = fan.skin; c.fillRect(fan.x - 2, fan.y - 3 + hop, 5, 3);
        // Gövde
        c.fillStyle = fan.shirt; c.fillRect(fan.x - 3, fan.y + hop, 7, 5);
        if (excited) {
          c.fillStyle = fan.shirt; c.fillRect(fan.x - 5, fan.y - 4 + hop, 2, 5); c.fillRect(fan.x + 4, fan.y - 4 + hop, 2, 5);
          c.fillStyle = fan.skin; c.fillRect(fan.x - 5, fan.y - 6 + hop, 2, 2); c.fillRect(fan.x + 4, fan.y - 6 + hop, 2, 2);
        }
      }

      // --- Retro Reklam Panoları (Pitchside Boards) ---
      // Sol üst reklam 1
      c.fillStyle = '#d32f2f'; c.fillRect(76, 50, 154, 30);
      c.fillStyle = '#ffffff'; c.font = '900 10px Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('★ NEW STAR ★', 153, 69);
      // Sol üst reklam 2
      c.fillStyle = '#fbc02d'; c.fillRect(234, 50, 158, 30);
      c.fillStyle = '#212121'; c.font = '900 10px Impact, sans-serif';
      c.fillText('ARCADE SOCCER', 313, 69);
      // Sağ üst reklam 1
      c.fillStyle = '#1976d2'; c.fillRect(608, 50, 154, 30);
      c.fillStyle = '#ffffff'; c.font = '900 10px Impact, sans-serif';
      c.fillText('SHOPAR FC', 685, 69);
      // Sağ üst reklam 2
      c.fillStyle = '#00bfa5'; c.fillRect(766, 50, 158, 30);
      c.fillStyle = '#004d40'; c.font = '900 10px Impact, sans-serif';
      c.fillText('POWER STRIKE', 845, 69);
      c.restore();

      // Yan panolar
      c.fillStyle = '#263238'; c.fillRect(52, 84, 20, 600); c.fillRect(928, 84, 20, 600);
      for (let y = 90; y < 680; y += 60) {
        c.fillStyle = ((y / 60) % 2) ? '#e53935' : '#fdd835'; c.fillRect(54, y, 16, 24);
        c.fillStyle = ((y / 60) % 2) ? '#1e88e5' : '#43a047'; c.fillRect(930, y, 16, 24);
      }

      // --- Canlı Çim Şeritleri (NSS Mown Pitch) ---
      for (let i = 0; i < 10; i++) {
        c.fillStyle = i % 2 ? '#3ca240' : '#339137';
        c.fillRect(FIELD.left, FIELD.top + i * 60, 848, 60);
      }
      // Dither piksel çim dokusu
      c.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < 160; i++) { const x = 83 + (i * 137) % 830, y = 90 + (i * 97) % 585; c.fillRect(x, y, 2, 4); }

      // --- Saha Çizgileri (Parlak Tebeşir) ---
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.strokeRect(76, 84, 848, 600);
      c.strokeRect(280, 84, 440, 180); // Ceza sahası
      c.strokeRect(386, 84, 228, 68);  // Altıpas
      c.beginPath(); c.arc(500, 210, 88, .65, Math.PI - .65); c.stroke(); // Ceza yayı
      c.beginPath(); c.arc(500, 210, 3.5, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill(); // Penaltı noktası
      c.beginPath(); c.moveTo(76, 619); c.lineTo(924, 619); c.stroke(); // Orta saha çizgisi
      c.beginPath(); c.arc(500, 619, 95, 0, Math.PI * 2); c.stroke(); // Orta saha dairesi
      c.beginPath(); c.arc(500, 619, 3.5, 0, Math.PI * 2); c.fill();
      for (const x of [76, 924]) { c.beginPath(); c.arc(x, 84, 15, x === 76 ? 0 : Math.PI / 2, x === 76 ? Math.PI / 2 : Math.PI); c.stroke(); }

      // Köşe bayrakları (rüzgarda hafif sallanan üçgen bayrak)
      const flagWave = Math.sin(this.time * 6) * 3;
      for (const x of [76, 924]) {
        c.strokeStyle = '#cfd8dc'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 82); c.lineTo(x, 60); c.stroke();
        c.fillStyle = '#ffeb3b'; c.beginPath();
        c.moveTo(x, 60); c.lineTo(x + (x === 76 ? 13 : -13) + flagWave, 65); c.lineTo(x, 71); c.fill();
      }
    }
    goalGeometry() {
      const top = FIELD.top - FIELD.crossbar * HEIGHT_PROJECTION;
      return { left: FIELD.goalLeft, right: FIELD.goalRight, bottom: FIELD.top, top, backTop: top - GOAL.depth, backBottom: FIELD.top - GOAL.depth, inset: 8 };
    }
    drawGoalBack(c, roofOnly = false) {
      const g = this.goalGeometry(), leftBack = g.left + g.inset, rightBack = g.right - g.inset;
      const frontTL = [g.left, g.top], frontTR = [g.right, g.top];
      const frontBL = [g.left, g.bottom], frontBR = [g.right, g.bottom];
      const backTL = [leftBack, g.backTop], backTR = [rightBack, g.backTop];
      const backBL = [leftBack, g.backBottom], backBR = [rightBack, g.backBottom];
      const panel = (points, columns, rows, fill) => {
        c.save(); c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
        c.fillStyle = fill; c.fill(); c.clip(); c.strokeStyle = 'rgba(235,247,235,.48)'; c.lineWidth = .85;
        const between = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
        const strand = (a, b, phase) => {
          const wave = Math.sin(this.time * 28 + phase) * this.netWobble * 4;
          c.beginPath(); c.moveTo(...a); c.quadraticCurveTo((a[0] + b[0]) / 2 + wave, (a[1] + b[1]) / 2 + wave * .5, ...b); c.stroke();
        };
        for (let i = 0; i <= columns; i++) strand(between(points[0], points[1], i / columns), between(points[3], points[2], i / columns), i);
        for (let i = 0; i <= rows; i++) strand(between(points[0], points[3], i / rows), between(points[1], points[2], i / rows), i + .7);
        c.restore();
      };
      if (roofOnly) {
        panel([backTL, backTR, frontTR, frontTL], 22, 3, 'rgba(230,246,232,.08)'); return;
      }
      c.save();
      c.fillStyle = 'rgba(8,27,14,.28)'; c.beginPath(); c.moveTo(...backBL); c.lineTo(...backBR); c.lineTo(...frontBR); c.lineTo(...frontBL); c.closePath(); c.fill();
      panel([backTL, backTR, backBR, backBL], 22, 7, 'rgba(220,243,224,.06)');
      panel([backTL, backTR, frontTR, frontTL], 22, 3, 'rgba(230,246,232,.08)');
      panel([backTL, frontTL, frontBL, backBL], 3, 7, 'rgba(225,245,228,.05)');
      panel([frontTR, backTR, backBR, frontBR], 3, 7, 'rgba(225,245,228,.05)');
      c.strokeStyle = '#b8cec0'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(...frontTL); c.lineTo(...backTL); c.lineTo(...backTR); c.lineTo(...frontTR);
      c.moveTo(...backTL); c.lineTo(...backBL); c.lineTo(...frontBL); c.moveTo(...backTR); c.lineTo(...backBR); c.lineTo(...frontBR); c.stroke();
      c.restore();
    }
    drawGoalFront(c) {
      const g = this.goalGeometry();
      c.save(); c.lineCap = 'round';
      c.strokeStyle = '#6e8877'; c.lineWidth = GOAL.postWidth + 2;
      c.beginPath(); c.moveTo(g.left + 1, g.bottom + 1); c.lineTo(g.left + 1, g.top + 1); c.lineTo(g.right + 1, g.top + 1); c.lineTo(g.right + 1, g.bottom + 1); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = GOAL.postWidth;
      c.beginPath(); c.moveTo(g.left, g.bottom); c.lineTo(g.left, g.top); c.lineTo(g.right, g.top); c.lineTo(g.right, g.bottom); c.stroke();
      c.strokeStyle = '#e0ede1'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(g.left - 1, g.bottom); c.lineTo(g.left - 1, g.top - 1); c.lineTo(g.right, g.top - 1); c.stroke();
      c.restore();
    }
    drawRunMarkers(c) {
      if ([State.TITLE, State.BALL_CONTACT, State.RESULT, State.SESSION_SUMMARY].includes(this.state)) return;
      if (this.state === State.INTERCEPTION) {
        const t = this.interceptSuggested; c.save(); c.strokeStyle = '#c6ff00'; c.lineWidth = 2; c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(this.ball.x, this.ball.y); c.lineTo(850, 320); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.arc(t.x, t.y, 28 + Math.sin(this.time * 5) * 4, 0, Math.PI * 2); c.stroke(); c.fillStyle = 'rgba(198,255,0,0.18)'; c.fill();
        c.fillStyle = '#ffff00'; c.font = `900 ${Math.max(12, 11 / this.view.scale)}px Impact, sans-serif`; c.textAlign = 'center'; c.fillText('MEET THE PASS', t.x, t.y - 42);
        if (this.interceptTarget) { c.strokeStyle = '#76ff03'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(this.player.x, this.player.y); c.lineTo(this.interceptTarget.x, this.interceptTarget.y); c.stroke(); }
        c.restore();
      } else if (this.mode === 'PASS' && this.state === State.AIMING) {
        for (const p of [this.player, ...this.mates]) if (p !== this.controlled) {
          const tx = this.index === 2 ? p.x - 22 : p.x, ty = this.index === 2 ? p.y - 67 : p.y - 14;
          c.save(); c.strokeStyle = '#00e676'; c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.arc(tx, ty, 28, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
          if (this.index === 2) { c.beginPath(); c.moveTo(p.x, p.y - 22); c.lineTo(tx, ty + 18); c.stroke(); }
          c.fillStyle = '#69f0ae'; c.font = `900 ${Math.max(11, 10 / this.view.scale)}px Impact, sans-serif`; c.textAlign = 'center'; c.fillText('INTO SPACE', tx, ty - 38); c.restore();
        }
      }
    }
    drawPlayer(c, p) {
      const isControlled = p === this.controlled && ![State.TITLE, State.BALL_CONTACT].includes(this.state);
      const moving = [State.BALL_IN_MOTION, State.INTERCEPTION].includes(this.state);
      const isShooting = this.kicker === p && this.motionTime < 0.28;
      const celebration = p.celebration > 0;
      const hop = celebration ? -Math.abs(Math.sin(p.celebration * 10)) * 9 : 0;
      const stride = moving ? Math.sin(p.step * 1.4) * 4.5 : 0;

      c.save();
      c.translate(p.x, p.y + hop);
      const scale = this.playerScale(p);
      c.scale(scale, scale);

      // 1. Zemin Gölgelendirmesi
      c.fillStyle = 'rgba(10,32,18,0.45)';
      c.beginPath(); c.ellipse(0, 10 - hop * 0.3, 11, 5, 0, 0, Math.PI * 2); c.fill();

      // Kaleci plonjon rotasyonu
      if (p.team === 'keeper' && p.dive > 0) {
        c.rotate((p.diveDirection || 1) * -0.75);
      }

      // Renk paleti
      let shirtMain, shirtDark, shortColor, sockColor;
      const skinColor = '#f5b078';
      const hairColor = p.number === 9 ? '#fbc02d' : p.number % 2 === 0 ? '#4e342e' : '#212121';

      if (p.team === 'blue') {
        shirtMain = '#1e88e5'; shirtDark = '#1565c0'; shortColor = '#ffffff'; sockColor = '#1e88e5';
      } else if (p.team === 'red') {
        shirtMain = '#e53935'; shirtDark = '#c62828'; shortColor = '#212121'; sockColor = '#e53935';
      } else { // keeper
        shirtMain = '#c6ff00'; shirtDark = '#aeea00'; shortColor = '#212121'; sockColor = '#212121';
      }

      // 2. Bacaklar & Kramponlar (16-bit Pixel Art)
      const legL_stride = isShooting ? -stride * 1.5 : stride;
      const legR_stride = isShooting ? 6 : -stride;

      // Çoraplar
      c.fillStyle = sockColor;
      c.fillRect(-6, 2 + legL_stride, 4, 6);
      c.fillRect(2, 2 + legR_stride, 4, 6);
      c.fillStyle = '#ffffff'; // üst beyaz şerit
      c.fillRect(-6, 2 + legL_stride, 4, 1.5);
      c.fillRect(2, 2 + legR_stride, 4, 1.5);

      // Kramponlar (siyah krampon + beyaz taban)
      c.fillStyle = '#111111';
      c.fillRect(-6, 8 + legL_stride, 4, 3);
      c.fillRect(2, 8 + legR_stride, 4, 3);
      c.fillStyle = '#ffffff';
      c.fillRect(-6, 10 + legL_stride, 4, 1);
      c.fillRect(2, 10 + legR_stride, 4, 1);

      // 3. Şort
      c.fillStyle = shortColor;
      c.fillRect(-7, -4, 14, 7);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(-1, -1, 2, 4);

      // 4. Forma / Gövde
      c.fillStyle = shirtMain;
      c.fillRect(-8, -15, 16, 12);
      c.fillStyle = shirtDark;
      c.fillRect(-8, -15, 2.5, 12);
      c.fillRect(5.5, -15, 2.5, 12);
      c.fillStyle = '#ffffff'; // Yaka
      c.fillRect(-3, -15, 6, 2);

      // Sırt Numarası
      c.fillStyle = p.team === 'keeper' ? '#212121' : '#ffffff';
      c.font = 'bold 7px monospace'; c.textAlign = 'center';
      c.fillText(String(p.number), 0, -7);

      // 5. Kollar & Eller
      if (celebration) {
        c.fillStyle = shirtMain;
        c.fillRect(-11, -22, 3, 9); c.fillRect(8, -22, 3, 9);
        c.fillStyle = skinColor;
        c.fillRect(-11, -24, 3, 3); c.fillRect(8, -24, 3, 3);
      } else if (p.team === 'keeper' && p.dive > 0) {
        c.fillStyle = shirtMain;
        c.fillRect(-12, -18, 4, 10); c.fillRect(8, -18, 4, 10);
        c.fillStyle = '#ffffff'; // Kaleci beyaz eldivenleri
        c.fillRect(-13, -22, 5, 5); c.fillRect(8, -22, 5, 5);
      } else if (p.team === 'keeper' && this.resolution?.kind === 'save') {
        c.fillStyle = shirtMain; c.fillRect(-11, -13, 7, 5); c.fillRect(4, -13, 7, 5);
        c.fillStyle = '#ffffff'; c.fillRect(-6, -12, 5, 5); c.fillRect(1, -12, 5, 5);
      } else if (p.team === 'keeper') {
        // A wider ready stance makes the keeper's coverage readable in the goalmouth.
        c.fillStyle = shirtMain;
        c.fillRect(-14, -14, 6, 4); c.fillRect(8, -14, 6, 4);
        c.fillRect(-17, -18, 4, 7); c.fillRect(13, -18, 4, 7);
        c.fillStyle = '#ffffff';
        c.fillRect(-18, -22, 5, 5); c.fillRect(13, -22, 5, 5);
      } else {
        const armL = moving ? -stride * 0.8 : 0;
        const armR = moving ? stride * 0.8 : 0;
        c.fillStyle = shirtMain;
        c.fillRect(-10, -14 + armL, 3, 8); c.fillRect(7, -14 + armR, 3, 8);
        c.fillStyle = p.team === 'keeper' ? '#ffffff' : skinColor;
        c.fillRect(-10, -6 + armL, 3, 3); c.fillRect(7, -6 + armR, 3, 3);
      }

      // 6. Kafa & Saç
      c.fillStyle = skinColor;
      c.fillRect(-5, -23, 10, 8);
      c.fillStyle = '#212121'; // Gözler
      c.fillRect(-3, -20, 2, 2); c.fillRect(1, -20, 2, 2);
      c.fillStyle = hairColor;
      c.fillRect(-6, -26, 12, 4); c.fillRect(-6, -23, 2, 3); c.fillRect(4, -23, 2, 3);

      // 7. Kontrol İşaretçisi (NSS Tarzı Yanıp Sönen Sarı Ok)
      if (isControlled) {
        const bounce = Math.sin(this.time * 7) * 3.5;
        c.fillStyle = '#ffeb3b';
        c.beginPath(); c.moveTo(0, -33 + bounce); c.lineTo(-6, -42 + bounce); c.lineTo(6, -42 + bounce); c.closePath(); c.fill();
        c.strokeStyle = '#f57f17'; c.lineWidth = 1; c.stroke();
        c.strokeStyle = '#c6ff00'; c.lineWidth = 2; c.setLineDash([4, 3]);
        c.beginPath(); c.ellipse(0, 10, 16, 8, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }

      c.restore();
    }
    drawBallShadow(c, b) {
      if (this.resolution?.kind === 'save') return;
      const geometry = this.ballGeometry(b);
      const baseR = geometry.groundRadius, height = geometry.height;
      c.save();

      // 1. Yerdeki gölge (NSS tarzı yükseldikçe küçülen ve solan gölge)
      const shadowScale = Math.max(0.32, 1 - b.z * 0.0035);
      const shadowAlpha = Math.max(0.24, 0.5 / (1 + b.z * 0.008));
      c.fillStyle = `rgba(10,32,16,${shadowAlpha})`;
      c.beginPath();
      c.ellipse(b.x + 2, b.y + 4, baseR * 1.15 * shadowScale, baseR * 0.5 * shadowScale, 0, 0, Math.PI * 2);
      c.fill();

      // Havalandığında yükseklik kılavuz çizgisi
      if (b.z > 8) {
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = Math.max(1.1, .8 / this.view.scale); c.setLineDash([3, 5]);
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, b.y - height); c.stroke(); c.setLineDash([]);
      }
      c.restore();
    }
    drawBall(c, b) {
      const geometry = this.ballGeometry(b), visualR = geometry.radius, height = geometry.height;
      c.save();
      if ([State.BALL_IN_MOTION, State.INTERCEPTION].includes(this.state)) {
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1 / this.view.scale;
        c.beginPath(); c.arc(b.x, b.y - height, visualR + 2 / this.view.scale, 0, Math.PI * 2); c.stroke();
      }
      // 2. Topun Kendisi (Telstar Klasik 32 Panel)
      c.translate(b.x, b.y - height);
      c.rotate(b.rotation);

      const sphereGrad = c.createRadialGradient(-visualR * 0.3, -visualR * 0.3, visualR * 0.05, 0, 0, visualR);
      sphereGrad.addColorStop(0, '#ffffff'); sphereGrad.addColorStop(0.7, '#f5f5f5'); sphereGrad.addColorStop(1, '#bdbdbd');
      c.fillStyle = sphereGrad; c.beginPath(); c.arc(0, 0, visualR, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#37474f'; c.lineWidth = .65; c.stroke();

      // Siyah deri beşgen paneller
      c.fillStyle = '#212121';
      this.polygon(c, 0, 0, visualR * 0.38, 5, -Math.PI / 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
        c.beginPath();
        c.arc(Math.cos(angle) * visualR * 0.88, Math.sin(angle) * visualR * 0.88, visualR * 0.22, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#757575'; c.lineWidth = 0.45;
        c.beginPath();
        c.moveTo(Math.cos(angle) * visualR * 0.35, Math.sin(angle) * visualR * 0.35);
        c.lineTo(Math.cos(angle) * visualR * 0.72, Math.sin(angle) * visualR * 0.72);
        c.stroke();
      }

      c.restore();
    }
    polygon(c, x, y, r, sides, rotation = 0) { c.beginPath(); for (let i = 0; i < sides; i++) { const a = rotation + i * Math.PI * 2 / sides; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
    drawTrail(c) {
      if (this.trail.length < 2) return;
      c.save(); c.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i], alpha = (i / this.trail.length) * .4 * Math.max(0, 1 - b.age / 1.4);
        c.strokeStyle = this.mode === 'PASS' ? `rgba(180,238,255,${alpha * 1.6})` : `rgba(255,255,235,${alpha * 1.8})`;
        // A trail must not be wider than the small on-field ball it follows.
        c.lineWidth = this.ballGeometry(b).groundRadius * (.18 + i / this.trail.length * .55);
        c.beginPath(); c.moveTo(a.x, a.y - a.z * HEIGHT_PROJECTION); c.lineTo(b.x, b.y - b.z * HEIGHT_PROJECTION); c.stroke();
      } c.restore();
    }
    drawAim(c) {
      const a = this.aim;
      if (!a || a.power < .02) return;

      const p = a.power; // 0.0 - 1.0
      const bx = this.ball.x, by = this.ball.y;
      const angle = Math.atan2(a.dy, a.dx);

      c.save();

      // 1. Gerideki Sapan Lastik Çekme Hattı (Slingshot Elastic Pull)
      const pull = Math.min(a.distance, this.maxDrag());
      const pullX = bx - a.dx * pull;
      const pullY = by - a.dy * pull;

      // Lastik ipi
      c.strokeStyle = 'rgba(255, 235, 59, 0.45)';
      c.lineWidth = 3;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(pullX, pullY);
      c.stroke();
      c.setLineDash([]);

      // Çekilen parmak dokunma noktası (Retro halka)
      c.fillStyle = 'rgba(255, 235, 59, 0.25)';
      c.beginPath(); c.arc(pullX, pullY, 14, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffeb3b';
      c.lineWidth = 2;
      c.beginPath(); c.arc(pullX, pullY, 8, 0, Math.PI * 2); c.stroke();

      // 2. NSS Tarzı Güce Göre Dinamik Büyüyen Kick Power Oku
      // Düşük güçte kısa ve ince, güç arttıkça sahada devasa uzayan ve kalınlaşan ok!
      const minLen = 48, maxLen = 220;
      const totalLen = minLen + p * (maxLen - minLen);

      const shaftW = 10 + p * 20;        // Gövde kalınlığı (10px -> 30px)
      const headLen = 22 + p * 28;      // Ok başı uzunluğu
      const headW = shaftW * 2.3 + 4;   // Ok başı genişliği (kanatlar)
      const startX = 13;                // Topun dışından başlama mesafesi
      const headBaseX = startX + totalLen - headLen;
      const tipX = startX + totalLen;

      c.save();
      c.translate(bx, by);
      c.rotate(angle);

      // Ok Poligonu (Gövde + Üçgen Ok Başı)
      c.beginPath();
      c.moveTo(startX, -shaftW / 2);
      c.lineTo(headBaseX, -shaftW / 2);
      c.lineTo(headBaseX, -headW / 2);
      c.lineTo(tipX, 0);                 // Okun en uç noktası
      c.lineTo(headBaseX, headW / 2);
      c.lineTo(headBaseX, shaftW / 2);
      c.lineTo(startX, shaftW / 2);
      c.closePath();

      // Dış 3D Zemin Gölgesi
      c.save();
      c.shadowColor = 'rgba(0, 0, 0, 0.55)';
      c.shadowBlur = 6;
      c.shadowOffsetY = 4;

      // Ok İç Gradyanı (NSS Canlı Güç Renkleri: Yeşil -> Sarı -> Turuncu -> Alev Kırmızı)
      const arrowGrad = c.createLinearGradient(startX, 0, tipX, 0);
      if (p < 0.40) {
        arrowGrad.addColorStop(0, '#76ff03');   // Neon yeşil
        arrowGrad.addColorStop(1, '#ffea00');   // Sarı
      } else if (p < 0.78) {
        arrowGrad.addColorStop(0, '#76ff03');
        arrowGrad.addColorStop(0.5, '#ffea00');
        arrowGrad.addColorStop(1, '#ff9100');   // Turuncu
      } else {
        arrowGrad.addColorStop(0, '#ffea00');
        arrowGrad.addColorStop(0.35, '#ff9100');
        arrowGrad.addColorStop(1, '#ff1744');   // Alev kırmızısı (Max güç!)
      }

      c.fillStyle = arrowGrad;
      c.fill();
      c.restore();

      // Kalın Siyah Retro Kontur
      c.strokeStyle = '#111111';
      c.lineWidth = 3;
      c.lineJoin = 'miter';
      c.stroke();

      // Ok Gövdesi İçi Güç Kademeleri / Segment Çizgileri (NSS Stili)
      const segmentCount = Math.max(2, Math.floor(totalLen / 24));
      c.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      c.lineWidth = 2.5;
      for (let i = 1; i < segmentCount; i++) {
        const segX = startX + (i / segmentCount) * (headBaseX - startX);
        if (segX < headBaseX - 4) {
          c.beginPath();
          c.moveTo(segX - 4, -shaftW / 2 + 1);
          c.lineTo(segX + 4, 0);
          c.lineTo(segX - 4, shaftW / 2 - 1);
          c.stroke();
        }
      }

      // Ok Başı İçi Parlama (Highlight)
      c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(headBaseX + 3, -headW / 2 + 6);
      c.lineTo(tipX - 4, 0);
      c.stroke();

      c.restore(); // rotate/translate restore

      // 3. Okun İlerisindeki Hafif Yörünge İzi (Hedefe doğru kesik hat)
      const preview = { ...this.ball, ...this.kickVelocity({ dx: a.dx, dy: a.dy, power: Math.max(.16, a.power), mode: this.mode }, { x: 0, y: 0, timedOut: false }) };
      c.strokeStyle = p > 0.8 ? 'rgba(255, 23, 68, 0.55)' : 'rgba(255, 235, 59, 0.55)';
      c.lineWidth = 2;
      c.setLineDash([4, 6]);
      c.beginPath();
      const leadX = bx + a.dx * (totalLen + 18);
      const leadY = by + a.dy * (totalLen + 18);
      c.moveTo(leadX, leadY);
      for (let i = 0; i < 28; i++) {
        this.integrateBall(preview, .034, this.mode === 'PASS');
        if (i > 4) {
          c.lineTo(preview.x, preview.y - preview.z * HEIGHT_PROJECTION);
        }
        if (preview.y < 84 || preview.x < 76 || preview.x > 924) break;
      }
      c.stroke();
      c.setLineDash([]);

      // 4. Sahada Okun Yanında Güç Yüzdesi Etiketi
      const percent = Math.round(p * 100);
      const labelDist = totalLen * 0.52;
      const sideOffset = shaftW + 18;
      const labelX = bx + a.dx * labelDist - a.dy * sideOffset;
      const labelY = by + a.dy * labelDist + a.dx * sideOffset;

      c.save();
      c.translate(labelX, labelY);
      c.fillStyle = 'rgba(12, 18, 24, 0.9)';
      const boxW = p >= 0.95 ? 68 : 50;
      c.fillRect(-boxW / 2, -12, boxW, 24);
      c.strokeStyle = p > 0.8 ? '#ff1744' : '#ffeb3b';
      c.lineWidth = 1.5;
      c.strokeRect(-boxW / 2, -12, boxW, 24);

      c.font = `900 ${Math.max(12, 11 / this.view.scale)}px Impact, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (p >= 0.95) {
        c.fillStyle = '#ff1744';
        c.fillText('MAX!!', 0, 0);
      } else {
        c.fillStyle = p > 0.7 ? '#ff9100' : '#ffeb3b';
        c.fillText(`${percent}%`, 0, 0);
      }
      c.restore();

      c.restore(); // ana save/restore
    }
    drawPossessionHint(c) {
      const b = this.ball, pulse = 1 + Math.sin(this.time * 4) * .09;
      c.save(); c.strokeStyle = '#ffeb3b88'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, 35 * pulse, 0, Math.PI * 2); c.stroke();
      c.font = `900 ${Math.max(11, 11 / this.view.scale)}px Impact, sans-serif`; c.textAlign = 'center'; c.fillStyle = '#ffea00'; c.fillText('DRAG BACK TO AIM', b.x, b.y + 57);
      c.strokeStyle = '#ffeb3b'; c.lineWidth = 2; c.beginPath(); c.moveTo(b.x, b.y + 69); c.lineTo(b.x, b.y + 86); c.lineTo(b.x - 4, b.y + 82); c.moveTo(b.x, b.y + 86); c.lineTo(b.x + 4, b.y + 82); c.stroke(); c.restore();
    }
    drawContact(c) {
      // İkonik New Star Soccer Telstar Ball Contact Ekranı
      const g = this.contactGeometry(), appear = this.reducedMotion ? 1 : clamp(this.stateTime / .18, 0, 1), r = g.r * (.88 + appear * .12);
      c.save();
      c.fillStyle = `rgba(10,24,18,${.92 * appear})`; c.fillRect(-1000, -1000, 3000, 3000);
      c.translate(g.x, g.y);

      // Yerdeki büyük derinlik gölgesi
      c.fillStyle = 'rgba(0,10,5,0.52)'; c.beginPath(); c.ellipse(10, r + 26, r * 0.9, 18, 0, 0, Math.PI * 2); c.fill();
      // Dış parlama halkası
      c.strokeStyle = 'rgba(198,255,0,0.22)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r + 16, 0, Math.PI * 2); c.stroke();

      // Topun Küresi ve Deri Dokusu (3D)
      const gradient = c.createRadialGradient(-r * .35, -r * .45, 2, 0, 0, r);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.65, '#ecefdc'); gradient.addColorStop(1, '#9e9e9e');
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = gradient; c.fill();

      c.save(); c.clip();
      // Merkez beşgen
      c.fillStyle = '#1e2422'; this.polygon(c, 0, 0, r * .30, 5, -Math.PI / 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5, x = Math.cos(a) * r * .85, y = Math.sin(a) * r * .85;
        this.polygon(c, x, y, r * .25, 5, a + Math.PI); c.fill();
        c.strokeStyle = '#616161'; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(Math.cos(a) * r * .30, Math.sin(a) * r * .30); c.lineTo(x - Math.cos(a) * r * .20, y - Math.sin(a) * r * .20); c.stroke();
      }
      c.restore();

      c.strokeStyle = '#212121'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();

      // Kesik Kılavuz Çizgileri
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5; c.setLineDash([4, 6]);
      c.beginPath(); c.moveTo(-r * .82, 0); c.lineTo(r * .82, 0); c.moveTo(0, -r * .82); c.lineTo(0, r * .82); c.stroke(); c.setLineDash([]);

      // Sweet Spot Merkezi
      c.strokeStyle = 'rgba(255,235,59,0.5)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r * 0.18, 0, Math.PI * 2); c.stroke();

      // Yön Kılavuzları (NSS Stili)
      c.font = 'bold 11px sans-serif'; c.fillStyle = '#ffeb3b'; c.textAlign = 'center';
      if (!this.compact) {
        c.fillText('◄ CURVE LEFT', -r - 60, 5); c.fillText('CURVE RIGHT ►', r + 60, 5);
        c.fillText('▲ LIFT / LOFT', 0, r + 44); c.fillText('▼ LOW DRIVE', 0, -r - 26);
      }

      // Kırmızı Hedef Dürbünü (Target Reticle)
      if (this.contact) {
        const cx = this.contact.x * r, cy = this.contact.y * r;
        const wave = this.contact.age * 55;
        c.strokeStyle = `rgba(255,50,50,${Math.max(0, 1 - this.contact.age * 3.5)})`; c.lineWidth = 3;
        c.beginPath(); c.arc(cx, cy, 14 + wave, 0, Math.PI * 2); c.stroke();

        c.strokeStyle = '#ff1744'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(cx - 16, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + 16, cy);
        c.moveTo(cx, cy - 16); c.lineTo(cx, cy - 6); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + 16);
        c.stroke();
        c.fillStyle = '#ffea00'; c.beginPath(); c.arc(cx, cy, 4.5, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    drawArcadeBanner(c) {
      if (!this.banner) return;
      const b = this.banner;
      const progress = clamp((b.max - b.time) / 0.25, 0, 1);
      const scale = progress < 1 ? 0.6 + 0.4 * Math.sin(progress * Math.PI / 2) : 1;
      const alpha = b.time < 0.3 ? b.time / 0.3 : 1;

      c.save();
      c.globalAlpha = alpha;
      const width = Math.min(420, this.view.width - 24), half = width / 2;
      c.translate(this.view.width / 2, Math.max(50, this.view.height - 57));
      c.scale(scale, scale);

      // Banner Arka Planı (Retro Arcade Şerit)
      c.fillStyle = 'rgba(12,18,24,0.92)';
      c.fillRect(-half, -37, width, 74);
      c.fillStyle = b.color;
      c.fillRect(-half, -37, width, 3); c.fillRect(-half, 34, width, 3);

      // Ana Yazı ("GOAL!!", "SAVED!", vb.)
      c.font = `900 ${clamp(width * .085, 24, 34)}px Impact, Arial Black, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = '#000000';
      c.fillText(b.text, 3, 4);
      c.fillStyle = b.color;
      c.fillText(b.text, 0, 0);

      // Alt Başlık ("WHAT A FINISH!", "KEEPER DENIES!", vb.)
      c.font = `bold ${width < 300 ? 9 : 11}px Arial, sans-serif`;
      c.letterSpacing = '.7px';
      c.fillStyle = '#ffffff';
      c.fillText(b.sub, 0, 23);

      c.restore();
    }
  }

  window.footballGame = new FootballGame();
})();
