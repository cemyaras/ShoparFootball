/* Shopar Football — dependency-free, procedural Canvas football.
   World units remain constant; pointer and renderer use the same viewport transform. */
(() => {
  'use strict';

  const Core = window.ShoparFootball.Core;
  const Physics = window.ShoparFootball.Physics;
  const { State, GOAL, FIELD } = Core;

  class FootballGame {
    constructor(definitions = window.ShoparFootball.Highlights.all()) {
      this.definitions = definitions;
      this.ui = new window.ShoparFootball.DomUI(this, this.definitions);
      this.canvas = this.ui.canvas; this.ctx = this.canvas.getContext('2d');
      this.audio = new window.ShoparFootball.AudioSystem(enabled => this.ui.updateSound(enabled));
      this.environment = new window.FootballEnvironment();
      this.state = State.TITLE; this.stateTime = 0; this.time = 0;
      this.session = new window.ShoparFootball.Session(this.definitions);
      this.results = new window.ShoparFootball.Results(this, this.definitions);
      this.play = {}; this.input = new window.ShoparFootball.PointerInput(this); this.aim = null; this.kick = null; this.contact = null;
      this.particles = []; this.trail = []; this.ripples = []; this.toastTime = 0; this.shake = 0; this.flash = 0;
      this.viewport = new window.ShoparFootball.Viewport(this, this.definitions); this.lastTime = null;
      this.reducedMotion = this.viewport.prefersReducedMotion();
      this.banner = null; this.netWobble = 0;
      const Renderer = window.ShoparFootball.CanvasRenderer;
      const drawing = Object.fromEntries(Renderer.drawMethods.map(name => [name, (...args) => this[name](...args)]));
      this.renderer = new Renderer(Renderer.createScene(this), Object.freeze(drawing));
      this.crowd = this.initCrowd();
      this.handlers = []; this.loadActors(0); this.bindEvents(); this.resize(); this.updateUI(); this.updateConditionsUI();
      this.viewport.observe();
      this.frame = this.frame.bind(this); this.raf = requestAnimationFrame(this.frame);
    }
    get controlled() { return this.play.controlled; }
    set controlled(value) { this.play.controlled = value; }
    get kicker() { return this.play.kicker; }
    set kicker(value) { this.play.kicker = value; }
    get aim() { return this.play.aim; }
    set aim(value) { this.play.aim = value; }
    get kick() { return this.play.kick; }
    set kick(value) { this.play.kick = value; }
    get contact() { return this.play.contact; }
    set contact(value) { this.play.contact = value; }
    get motionTime() { return this.play.motionTime; }
    set motionTime(value) { this.play.motionTime = value; }
    get flight() { return this.play.flight; }
    set flight(value) { this.play.flight = value; }
    get interceptTarget() { return this.play.interceptTarget; }
    set interceptTarget(value) { this.play.interceptTarget = value; }
    get interceptSuggested() { return this.play.interceptSuggested; }
    set interceptSuggested(value) { this.play.interceptSuggested = value; }
    get pointer() { return this.input.pointer; }
    set pointer(value) { this.input.pointer = value; }
    get view() { return this.viewport.view; }
    set view(value) { this.viewport.view = value; }
    get compact() { return this.viewport.compact; }
    set compact(value) { this.viewport.compact = value; }
    get dpr() { return this.viewport.dpr; }
    set dpr(value) { this.viewport.dpr = value; }
    get resizeObserver() { return this.viewport.resizeObserver; }
    set resizeObserver(value) { this.viewport.resizeObserver = value; }
    get defenseVariant() { return this.session.memoryFor('win-the-ball').variant; }
    set defenseVariant(value) { this.session.memoryFor('win-the-ball').variant = value; }
    get index() { return this.session.index; }
    set index(value) { this.session.index = value; }
    get practiceIndex() { return this.session.practiceIndex; }
    set practiceIndex(value) { this.session.practiceIndex = value; }
    get stats() { return this.session.stats; }
    set stats(value) { this.session.stats = value; }
    get outcomes() { return this.session.outcomes; }
    set outcomes(value) { this.session.outcomes = value; }
    get keeperPlan() { return this.session.keeperPlan; }
    set keeperPlan(value) { this.session.keeperPlan = value; }
    get scenarioSnapshot() { return this.session.scenarioSnapshot; }
    set scenarioSnapshot(value) { this.session.scenarioSnapshot = value; }
    listen(target, type, handler, options) { target.addEventListener(type, handler, options); this.handlers.push(() => target.removeEventListener(type, handler, options)); }
    bindEvents() {
      this.input.bindCanvas();
      this.ui.bindEvents();
      this.viewport.bindEvents();
      this.input.bindWindow();
    }
    destroy() { this.cancelPointer(this.pointer?.id); this.controllerScope?.deactivate(); this.controller?.dispose(); this.handlers.forEach(remove => remove()); this.resizeObserver.disconnect(); cancelAnimationFrame(this.raf); this.audio.context?.close(); }
    resize(reframe) { return this.viewport.resize(reframe); }
    cameraBounds() { return this.viewport.cameraBounds(); }
    toWorld(e) { return this.viewport.toWorld(e); }
    worldToScreen(point) { return window.ShoparFootball.Viewport.worldToScreen(this.view, point); }
    maxDrag() { return this.viewport.maxDrag(); }
    contactGeometry() { return this.viewport.contactGeometry(); }
    initCrowd() { return this.renderer.initCrowd(); }
    makePlayer(x, y, team, number) { return Core.makePlayer(x, y, team, number); }
    depthScale(y) { return Core.depthScale(y); }
    playerScale(player) { return Core.playerScale(player); }
    possessionPosition(player) { return Core.possessionPosition(player); }
    ballGeometry(ball) { return Core.ballGeometry(ball); }
    loadActors(index) {
      this.controllerScope?.deactivate(); this.controller?.dispose();
      // Preserve the previous kicker reference until the next kick, as before extraction.
      this.play = { kicker: this.play.kicker };
      const s = this.definitions[index];
      this.player = this.makePlayer(...s.player, 'blue', 9); this.controlled = this.player;
      this.mates = s.mates.map((p, i) => this.makePlayer(...p, 'blue', 7 + i * 4));
      this.defenders = s.defenders.map((p, i) => this.makePlayer(...p, 'red', 4 + i));
      const profile = this.keeperPlan[index] || 'line', homeY = FIELD.top + (profile === 'advanced' ? 90 : GOAL.keeperOffset);
      this.keeper = { ...this.makePlayer(500, homeY, 'keeper', 1), profile, homeY, reaction: GOAL.keeperReaction, dive: 0, diveCooldown: 0, targetX: 500 };
      this.ball = { ...this.possessionPosition(this.player), z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
      this.trail = []; this.particles = []; this.ripples = []; this.pointer = null; this.aim = null; this.contact = null; this.kick = null;
      this.pendingResult = null;
      this.resolution = null; this.flight = null; this.banner = null; this.netWobble = 0;
      this.interceptTarget = null; this.interceptSuggested = { x: 500, y: 320 }; this.motionTime = 0; this.shake = 0;
      this.session.captureCheckpoint();
      this.controller = null; this.controllerScope = null;
      this.controllerScope = window.ShoparFootball.Controllers.contextScope(this, this.session.memoryFor(s.id), s);
      this.controller = window.ShoparFootball.Controllers.normalize(s.create(this.controllerScope.context));
      this.defense = s.category === 'defense' ? this.controller : null;
    }
    controllerPresentation() { return this.controller?.getPresentation() || {}; }
    drawHighlightWorld(c) { if (this.state === State.DEFENDING) this.controller?.drawWorld(c); }
    drawHighlightOverlay(c) { if (this.state === State.DEFENDING) this.controller?.drawOverlay(c); }
    actorPose(actor) {
      const context = this.controllerScope?.context || { flow: { state: this.state }, play: this.play, resolution: this.resolution };
      return window.ShoparFootball.Controllers.actorPose(context, actor, this.controller?.getActorPose(actor) || {});
    }
    enterController() {
      const entry = this.controller.enter();
      if (entry?.state) this.transition(entry.state);
      if (entry?.toast) this.toast(entry.toast, entry.duration);
    }
    transition(next) {
      this.cancelPointer(this.pointer?.id); this.state = next; this.stateTime = 0;
      this.ui.transition(next);
      // Contact and flight retain the aim camera; a new possession reframes the play.
      if ([State.HIGHLIGHT_INTRO, State.AIMING, State.INTERCEPTION, State.DEFENDING].includes(next)) this.resize(true);
      this.updateUI();
    }
    startSession() {
      if (![State.TITLE, State.SESSION_SUMMARY].includes(this.state)) return;
      if (this.session.match) this.startMatch(); else this.beginSession();
    }
    startMatch(random = Math.random) {
      this.cancelPointer(this.pointer?.id); this.ui.closeHighlightPicker();
      this.session.beginMatch(() => this.createKeeperPlan(), random);
      this.beginHighlight(); this.audio.play('tap');
    }
    openHighlightPicker() {
      this.cancelPointer(this.pointer?.id); this.ui.openHighlightPicker();
    }
    startPractice(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.definitions.length) return;
      this.beginSession(index);
    }
    beginSession(practiceIndex = null) {
      this.cancelPointer(this.pointer?.id); this.ui.closeHighlightPicker();
      this.session.begin(practiceIndex, () => this.createKeeperPlan());
      this.beginHighlight(); this.audio.play('tap');
    }
    createKeeperPlan(random = Math.random) { return this.session.createKeeperPlan(random); }
    beginHighlight() {
      this.cancelPointer(this.pointer?.id);
      this.loadActors(this.index); this.transition(State.HIGHLIGHT_INTRO);
      this.toast(this.definitions[this.index].title.replace('.', '') + (this.keeper.profile === 'advanced' ? ' · Keeper off the line' : ''), 1.8);
    }
    restart() {
      if (this.session.match) return;
      this.session.restoreCheckpoint(); this.beginHighlight();
    }
    nextHighlight() {
      if (this.state !== State.RESULT) return;
      const action = this.session.advance();
      if (action === 'retry') { this.restart(); return; }
      if (action === 'summary') { this.showSummary(); return; }
      this.beginHighlight();
    }
    updateConditionsUI() { return this.ui.updateConditionsUI(); }
    updateUI() { return this.ui.updateUI(); }
    updatePower(power) { return this.ui.updatePower(power); }
    toast(message, seconds = 2.2) { return this.ui.toast(message, seconds); }
    onPointerDown(e) { return this.input.onPointerDown(e); }
    onPointerMove(e) { return this.input.onPointerMove(e); }
    onPointerUp(e) { return this.input.onPointerUp(e); }
    releasePointer() { return this.input.releasePointer(); }
    cancelPointer(id) { return this.input.cancelPointer(id); }
    chooseContact(x, y, timedOut) { return this.controller?.chooseContact?.(x, y, timedOut); }
    // The same velocity/height/spin model drives both live kicks and the aim preview.
    kickVelocity(kick, contact) { return Physics.kickVelocity(kick, contact); }
    executeKick() { return this.controller?.executeKick?.(); }
    startInterception() { return this.controller?.startInterception?.(); }
    receive(player, offBall = false) { return this.controller?.receive?.(player, offBall); }
    finish(kind, detail) { return this.results.finish(kind, detail); }
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
    showSummary() { return this.results.showSummary(); }
    frame(timestamp) {
      const dt = this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, .05); this.lastTime = timestamp;
      this.update(dt); this.render(); this.raf = requestAnimationFrame(this.frame);
    }
    update(dt) {
      // Dialogs trap focus and pause simulation, including the contact countdown.
      if (this.ui.isPaused()) return;
      this.time += dt; this.stateTime += dt;
      this.ui.tickToast(dt);
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
        this.updateFlightUI();
        this.pendingResult.wait -= dt;
        if (this.pendingResult.wait <= 0) { this.pendingResult = null; this.transition(State.RESULT); } return;
      }
      if (this.state === State.HIGHLIGHT_INTRO && this.stateTime > .85) {
        this.enterController();
      } else if ([State.AIMING, State.BALL_CONTACT, State.BALL_IN_MOTION, State.INTERCEPTION, State.DEFENDING].includes(this.state) && this.controller) {
        this.controller.update(dt);
        if (this.state === State.DEFENDING) {
          const hint = this.controllerPresentation().hint || '';
          if (!this.pendingResult) this.ui.setHint(hint);
        }
      }
      this.viewport.update(dt);
    }

    updateFlightUI() { return this.ui.updateFlightUI(); }
    updateResolution(dt) { return this.controller?.updateResult?.(dt, this.resolution); }
    integrateBall(ball, dt, restitution = .46) { return Physics.integrateBall(ball, dt, restitution); }
    ballImpact(impact) { return this.controller?.ballImpact?.(impact); }
    movePlayer(p, tx, ty, speed, dt) { return Physics.movePlayer(p, tx, ty, speed, dt); }
    updateKeeper(dt) { return this.controller?.updateKeeper?.(dt); }
    updateAI(dt) { return this.controller?.updateAI?.(dt); }
    goalLineOutcome(x, z) { return Physics.goalLineOutcome(x, z); }
    updateMotion(dt) { return this.controller?.updateMotion?.(dt); }
    updateInterception(dt) { return this.controller?.updateInterception?.(dt); }

    goalGeometry() { return Core.goalGeometry(); }
    render() { return this.renderer.render(); }
    ballAboveGoal() { return this.renderer.ballAboveGoal(); }
    drawCrossingMarker(c) { return this.renderer.drawCrossingMarker(c); }
    drawStadium(c) { return this.renderer.drawStadium(c); }
    drawPitch(c, projection) { return this.renderer.drawPitch(c, projection); }
    drawGoalBack(c, roofOnly = false) { return this.renderer.drawGoalBack(c, roofOnly); }
    drawGoalFront(c) { return this.renderer.drawGoalFront(c); }
    drawRunMarkers(c) { return this.renderer.drawRunMarkers(c); }
    drawPlayer(c, p) { return this.renderer.drawPlayer(c, p); }
    drawBallShadow(c, b) { return this.renderer.drawBallShadow(c, b); }
    drawBall(c, b) { return this.renderer.drawBall(c, b); }
    polygon(c, x, y, r, sides, rotation = 0) { return this.renderer.polygon(c, x, y, r, sides, rotation); }
    drawTrail(c) { return this.renderer.drawTrail(c); }
    drawAim(c) { return this.renderer.drawAim(c); }
    drawPossessionHint(c) { return this.renderer.drawPossessionHint(c); }
    drawContact(c) { return this.renderer.drawContact(c); }
    drawArcadeBanner(c) { return this.renderer.drawArcadeBanner(c); }

  }

  window.ShoparFootball.FootballGame = FootballGame;
})();
