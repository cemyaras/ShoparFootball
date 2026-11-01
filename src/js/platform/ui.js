/* DOM controls, dialogs and presentation. Gameplay and timers remain owned by the host. */
(() => {
  'use strict';
  const { State, FIELD, CONTACT_TIME, clamp } = window.ShoparFootball.Core;
  const $ = id => document.getElementById(id);
  class DomUI {
    constructor(game, definitions) { this.game = game; this.definitions = definitions; this.canvas = $('game'); this.canvasWrap = $('canvas-wrap'); }
    bindEvents() {
      const game = this.game;
      game.listen($('play-button'), 'click', () => game.startSession());
      game.listen($('again-button'), 'click', () => game.startSession());
      game.listen($('next-button'), 'click', () => game.nextHighlight());
      for (const id of ['highlight-button', 'select-highlight-button', 'result-select-button', 'summary-select-button']) game.listen($(id), 'click', () => game.openHighlightPicker());
      $('chapter-progress').innerHTML = this.definitions.map(() => '<i></i>').join('');
      for (const id of ['play-button', 'play-all-button']) $(id).innerHTML = `PLAY ALL ${this.definitions.length} <span aria-hidden="true">▶</span>`;
      $('highlight-list').innerHTML = this.definitions.map((scenario, index) => `<button class="highlight-option${scenario.category === 'defense' ? ' defensive-option' : ''}" type="button" data-highlight="${index}"><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><strong>${scenario.title.replace('.', '')}</strong></button>`).join('');
      game.listen($('highlight-list'), 'click', e => { const button = e.target.closest('button[data-highlight]'); if (button) game.startPractice(Number(button.dataset.highlight)); });
      game.listen($('highlight-close'), 'click', () => $('highlight-dialog').close());
      game.listen($('highlight-dialog'), 'close', () => { game.lastTime = null; });
      game.listen($('play-all-button'), 'click', () => game.beginSession());
      game.listen($('restart-button'), 'click', () => { if (![State.TITLE, State.SESSION_SUMMARY].includes(game.state)) game.restart(); });
      game.listen($('sound-button'), 'click', () => game.audio.toggle());
      game.listen($('conditions-button'), 'click', () => {
        game.cancelPointer(game.pointer?.id);
        $('conditions-dialog').showModal();
      });
      for (const id of ['conditions-close', 'conditions-done']) game.listen($(id), 'click', () => $('conditions-dialog').close());
      game.listen($('conditions-dialog'), 'close', () => { game.lastTime = null; });
      game.listen($('help-button'), 'click', () => { game.cancelPointer(game.pointer?.id); $('help-dialog').showModal(); });
      for (const id of ['help-close', 'help-done']) game.listen($(id), 'click', () => $('help-dialog').close());
      game.listen($('help-dialog'), 'close', () => { game.lastTime = null; });
      game.listen($('conditions-dialog'), 'change', e => {
        if (e.target.name === 'pitch') game.environment.set(e.target.value, game.environment.weather);
        else if (e.target.name === 'weather') game.environment.set(game.environment.pitch, e.target.value);
        game.updateConditionsUI();
      });
    }
    transition(next) {
      const game = this.game;
      document.body.classList.toggle('is-playing', next !== State.TITLE);
      document.body.dataset.state = next;
      $('title-overlay').classList.toggle('hidden', next !== State.TITLE);
      $('result-overlay').classList.toggle('hidden', next !== State.RESULT);
      $('summary-overlay').classList.toggle('hidden', next !== State.SESSION_SUMMARY);
      $('contact-heading').classList.toggle('hidden', next !== State.BALL_CONTACT);
      $('contact-footer').classList.toggle('hidden', next !== State.BALL_CONTACT);
      if (next === State.BALL_CONTACT) {
        game.toastTime = 0; $('toast').classList.add('hidden');
        $('contact-heading').querySelector('p').textContent = 'Tap a point on the ball';
      }
    }
    isPaused() { return $('conditions-dialog').open || $('help-dialog').open || $('highlight-dialog').open; }
    openHighlightPicker() { $('highlight-dialog').showModal(); }
    closeHighlightPicker() { $('highlight-dialog').close(); }
    setContactTight(tight) { document.body.classList.toggle('contact-tight', tight); }
    invalidContact() { $('contact-heading').querySelector('p').textContent = 'Tap inside the ball to strike it.'; }
    setHint(hint) { if ($('bottom-hint').textContent !== hint) $('bottom-hint').textContent = hint; }
    updateContactTimer() { $('contact-timer-fill').style.width = `${Math.max(0, 1 - this.game.stateTime / CONTACT_TIME) * 100}%`; }
    tickToast(dt) {
      const game = this.game;
      if (game.toastTime > 0) { game.toastTime -= dt; if (game.toastTime <= 0) $('toast').classList.add('hidden'); }
      else $('toast').classList.add('hidden');
    }
    static soundState(enabled) {
      $('sound-button').setAttribute('aria-pressed', String(enabled));
      $('sound-button').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
      $('sound-waves').setAttribute('d', enabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
    }
    updateSound(enabled) { DomUI.soundState(enabled); }
    showResult(model) {
      $('result-title').textContent = model.title;
      $('result-symbol').textContent = model.symbol;
      $('result-symbol').style.color = model.success ? 'var(--mint)' : '#f4ae8f';
      $('result-kicker').textContent = `${model.number}/${model.total}`;
      $('result-detail').textContent = model.detail;
      $('next-button').innerHTML = model.practice ? 'RETRY <span>↻</span>' : 'NEXT <span>→</span>';
    }
    showSummary(score, stats) {
      $('rating').textContent = score; $('total-goals').textContent = stats.goals; $('total-passes').textContent = stats.passes; $('total-misses').textContent = stats.misses;
      $('total-tackles').textContent = stats.tackles;
      $('summary-title').textContent = 'FULL TIME';
      $('summary-detail').textContent = score >= 75 ? 'Vision, touch, and a little nerve. A performance to remember.' : 'Every chance teaches you something. Go again and find your touch.';
    }
    updateConditionsUI() {
      const game = this.game;
      const env = game.environment;
      for (const input of $('conditions-dialog').querySelectorAll('input[type="radio"]')) input.checked = input.value === env[input.name];
      $('conditions-summary').textContent = env.label;
      $('conditions-icon').textContent = env.forecast.icon;
      $('conditions-button').setAttribute('aria-label', `Change conditions: ${env.label}`);
    }
    updateUI() {
      const game = this.game;
      $('score').textContent = game.stats.goals;
      $('chapter-number').textContent = `${game.index + 1}/${this.definitions.length}`;
      $('restart-button').disabled = [State.TITLE, State.SESSION_SUMMARY].includes(game.state);
      $('help-button').classList.toggle('hidden', Boolean(game.controllerPresentation().hideHelp));
      game.canvas.setAttribute('aria-label', game.controllerPresentation().ariaLabel || 'Football pitch. Drag back from the ball to aim, release, then tap the close-up ball to strike.');
      $('bottom-hint').textContent = game.state === State.INTERCEPTION ? 'Tap the ring to receive.' : game.state === State.AIMING ? 'Drag back to aim. Release, then tap the ball.' : game.state === State.BALL_CONTACT ? 'Tap a point on the ball.' : '';
      [...$('chapter-progress').children].forEach((el, i) => { el.className = i === game.index ? 'current' : game.outcomes[i] === true ? 'done' : game.outcomes[i] === false ? 'failed' : ''; });
      game.updateFlightUI();
    }
    updatePower(power) {
      const game = this.game; $('power-meter').classList.toggle('hidden', power <= 0); $('power-fill').style.width = `${Math.round(power * 100)}%`; $('power-value').textContent = power ? `${Math.round(power * 100)}%` : '—'; }
    toast(message, seconds = 2.2) {
      const game = this.game; $('toast').textContent = message; $('toast').classList.remove('hidden'); game.toastTime = seconds; }
    updateFlightUI() {
      const game = this.game;
      const followingMiss = game.pendingResult && ['high', 'wide'].includes(game.resolution?.kind) && !game.resolution.exited && game.resolution.crossing.z >= 35;
      const active = game.state === State.BALL_IN_MOTION && (!game.resolution || followingMiss);
      $('flight-meter').classList.toggle('hidden', !active);
      if (game.resolution && !followingMiss) {
        $('bottom-hint').textContent = game.results.flightLabel(game.resolution.kind, game.flight?.clearedKeeper); return;
      }
      if (!active) return;
      const b = game.ball, phase = b.z < 5 ? 'GROUND' : b.vz > 8 ? 'RISING' : b.vz < -8 ? 'DROPPING' : 'AT THE TOP';
      $('flight-height').style.width = `${clamp(b.z / FIELD.crossbar, 0, 1.25) * 80}%`;
      $('flight-label').textContent = b.z >= FIELD.crossbar ? 'ABOVE BAR' : phase;
      if (followingMiss && game.resolution.landing) $('flight-label').textContent = 'LANDED';
      $('bottom-hint').textContent = followingMiss ? `${game.resolution.kind === 'high' ? 'OVER THE BAR' : 'WIDE'} · ${game.resolution.landing ? 'LANDED OUTSIDE' : phase}` : `${(game.flight?.maxHeight || 0) > 45 || b.vz > 140 ? 'LOFTED KICK' : 'KICK'} · ${phase}`;
    }
  }
  window.ShoparFootball.DomUI = DomUI;
})();
