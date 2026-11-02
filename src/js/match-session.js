/* A bounded match schedule and score, independent of actors and presentation. */
(() => {
  'use strict';
  class MatchSession {
    constructor(random = Math.random) {
      const attacks = ['one-on-one', 'from-distance', 'through-ball', 'two-against-two', 'read-the-game'];
      for (let i = attacks.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); [attacks[i], attacks[j]] = [attacks[j], attacks[i]];
      }
      this.schedule = [attacks[0], 'win-the-ball', attacks[1], 'cut-the-pass', attacks[2], 'save-the-shot'];
      if (random() < .25) {
        if (random() < .5) this.schedule[[0, 2, 4][Math.floor(random() * 3)]] = 'take-the-penalty';
        else this.schedule[5] = 'save-the-penalty';
      }
      this.cursor = 0; this.continuation = false; this.history = []; this.score = { home: 0, away: 0 }; this.resolved = false;
    }
    get highlightId() { return this.continuation ? 'save-the-shot' : this.schedule[this.cursor]; }
    get needsSave() { return !this.continuation && ['missed_tackle', 'opponent_escaped', 'pass_through'].includes(this.history.at(-1)?.kind); }
    record(kind, success) {
      if (this.resolved) return;
      this.resolved = true;
      if (kind === 'goal') this.score.home++;
      if (kind === 'shot_conceded' || kind === 'penalty_conceded') this.score.away++;
      this.history.push({ cursor: this.cursor, continuation: this.continuation, id: this.highlightId, kind, success });
    }
    advance() {
      if (!this.resolved) return 'waiting';
      if (this.needsSave) this.continuation = true;
      else {
        if (this.cursor === this.schedule.length - 1) return 'summary';
        this.cursor++; this.continuation = false;
      }
      this.resolved = false; return 'next';
    }
    get result() { return this.score.home > this.score.away ? 'VICTORY' : this.score.home < this.score.away ? 'DEFEAT' : 'DRAW'; }
  }
  window.ShoparFootball.MatchSession = MatchSession;
})();
