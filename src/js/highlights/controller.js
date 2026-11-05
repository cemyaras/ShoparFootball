/* Common controller hooks and an explicitly bounded bridge to the current host. */
(() => {
  'use strict';
  const { State } = window.ShoparFootball.Core;
  const hooks = {
    enter() {}, handleInput() { return { handled: false, capture: false }; }, cancelInput() {},
    update() {}, updateResult() {}, getPresentation() { return {}; }, getActorPose() { return {}; },
    drawWorld() {}, drawOverlay() {}, dispose() {}
  };
  class HighlightController {
    constructor(context) { this.context = context; }
  }
  Object.assign(HighlightController.prototype, hooks);
  function normalize(controller) {
    if (!controller) throw new Error('A highlight factory must return a controller.');
    for (const [name, fallback] of Object.entries(hooks)) if (typeof controller[name] !== 'function') controller[name] = fallback;
    return controller;
  }
  // Resolve controller activity and shared actor state into presentation-only pose data.
  function actorPose(context, actor, activity = {}) {
    const state = context.flow.state, play = context.play;
    const moving = [State.BALL_IN_MOTION, State.INTERCEPTION].includes(state) || state === State.DEFENDING && activity.moving;
    const celebrating = actor.celebration > 0, diving = actor.team === 'keeper' && actor.dive > 0;
    return {
      hidden: activity.hidden, keeperHands: activity.keeperHands,
      // Blue outfielders show their backs while attacking; opponents and keepers face the camera.
      facing: activity.facing ?? (actor.team === 'blue' ? 'away' : 'toward'),
      controlled: actor === play.controlled && ![State.TITLE, State.BALL_CONTACT].includes(state),
      moving, kicking: play.kicker === actor && play.motionTime < .28 || activity.kicking,
      celebrating, hop: activity.hop ?? (celebrating ? -Math.abs(Math.sin(actor.celebration * 10)) * 9 : 0),
      stride: moving ? Math.sin(actor.step * 1.4) * 4.5 : 0,
      tackling: activity.tackling, stumbling: activity.stumbling, lean: activity.lean,
      diving: activity.diving ?? diving, diveLean: activity.diveLean ?? (actor.diveDirection || 1) * -.75,
      holdingBall: actor.team === 'keeper' && context.resolution?.kind === 'save'
    };
  }
  function contextScope(game, memory, definition = {}) {
    let active = true;
    const context = Object.freeze({
      player: game.player, ball: game.ball, defenders: game.defenders, mates: game.mates, keeper: game.keeper,
      play: game.play, runMarker: definition.runMarker,
      get resolution() { return game.resolution; },
      memory,
      get view() { return game.view; }, get time() { return game.time; }, get reducedMotion() { return game.reducedMotion; },
      flow: Object.freeze({ get state() { return game.state; }, get elapsed() { return game.stateTime; }, transition(next) { if (active) game.transition(next); } }),
      feedback: Object.freeze({
        toast(message, duration) { if (active) game.toast(message, duration); },
        power(value) { if (active) game.updatePower(value); },
        flight() { if (active) game.updateFlightUI(); },
        contactTimer() { if (active) game.ui.updateContactTimer(); },
        invalidContact() { if (active) game.ui.invalidContact(); }
      }),
      resultDelay: Object.freeze({
        get pending() { return active && Boolean(game.pendingResult); },
        get remaining() { return active ? game.pendingResult?.wait : undefined; },
        set remaining(value) { if (active && game.pendingResult) game.pendingResult.wait = value; }
      }),
      possessionReceived(offBall) { if (active) game.session.recordReception(offBall); },
      physics: Object.freeze({ movePlayer: (...args) => game.movePlayer(...args), integrateBall: (...args) => game.integrateBall(...args), kickVelocity: (...args) => game.kickVelocity(...args), goalLineOutcome: (...args) => game.goalLineOutcome(...args),
        containGoalBall: window.ShoparFootball.Physics.containGoalBall }),
      geometry: Object.freeze({ worldToScreen: point => game.worldToScreen(point), possessionPosition: player => game.possessionPosition(player), ballGeometry: ball => game.ballGeometry(ball), maxDrag: () => game.maxDrag(), contactGeometry: () => game.contactGeometry() }),
      audio: Object.freeze({ play: kind => game.audio.play(kind) }),
      effects: Object.freeze({
        ripple(point) { if (active) game.ripples.push(point); },
        get trail() { return game.trail; }, set trail(value) { if (active) game.trail = value; },
        get shake() { return game.shake; }, set shake(value) { if (active) game.shake = value; },
        netImpact(resolution, contact, strength) {
          if (!active || !contact || resolution !== game.resolution || resolution.netHit) return;
          resolution.netHit = true;
          resolution.netImpact = { ...contact, time: game.time, strength };
          game.netWobble = strength;
        },
        get netWobble() { return game.netWobble; }, set netWobble(value) { if (active) game.netWobble = value; }
      }),
      complete(kind, detail) { if (active) { game.cancelPointer(game.pointer?.id); game.finish(kind, detail); } }
    });
    return { context, deactivate() { active = false; } };
  }
  window.ShoparFootball.Controllers = { HighlightController, normalize, actorPose, contextScope };
})();
