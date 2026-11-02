/* Outcome application and result/summary presentation models. DOM is owned by UI. */
(() => {
  'use strict';
  const { State } = window.ShoparFootball.Core;
  const defaults = window.ShoparFootball.OutcomeDefinitions;
  const value = (field, chip) => typeof field === 'function' ? field(chip) : field;
  class Results {
    constructor(game, definitions) { this.game = game; this.definitions = definitions; }
    descriptor(kind) { return this.definitions[this.game.index].outcomes?.[kind] || defaults.all[kind] || defaults.fallback; }
    flightLabel(kind, chip) { return value(this.descriptor(kind).flight, chip); }
    finish(kind, detail) {
      const game = this.game;
      if (game.pendingResult || [State.RESULT, State.SESSION_SUMMARY].includes(game.state)) return;
      const descriptor = this.descriptor(kind), success = descriptor.success;
      const match = game.session.match;
      if (match) match.record(kind, success);
      else game.outcomes[game.index] = success;
      game.resolution = { kind, elapsed: 0, netHit: false, landing: null, crossing: { x: game.ball.x, y: game.ball.y, z: game.ball.z } };
      const chip = success && game.flight?.clearedKeeper;
      game.stats[descriptor.stat]++;
      if (descriptor.sound) game.audio.play(descriptor.sound);
      if (descriptor.effect === 'ballWon') game.ripples.push({ x: game.ball.x, y: game.ball.y, age: 0 });
      else if (descriptor.effect === 'goal') { game.celebrate(); game.flash = .2; }
      game.banner = { ...value(descriptor.banner, chip) };
      const explanation = descriptor.detail === undefined ? (success ? defaults.attack.goal.detail(chip) : detail) : value(descriptor.detail, chip);
      game.ui.showResult({ title: value(descriptor.title, chip), symbol: success ? '↗' : descriptor.symbol || '↘', success,
        number: game.session.displayNumber, total: game.session.displayCount, detail: match?.needsSave ? 'The opponent is through! Continue to control your keeper.' : game.defense ? detail : explanation, continuation: match?.needsSave, numberLabel: match ? `${match.cursor + 1}/6${match.continuation ? ' · KEEPER' : ''}` : null, practice: game.practiceIndex !== null });
      game.pendingResult = { kind, wait: game.defense ? 1.3 : descriptor.delay };
      game.aim = null; game.updateUI(); game.updateFlightUI();
    }
    showSummary() {
      const game = this.game, score = game.session.rating();
      game.ui.showSummary(score, game.stats);
      game.toastTime = 0; game.transition(State.SESSION_SUMMARY);
    }
  }
  window.ShoparFootball.Results = Results;
})();
