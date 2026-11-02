/* Session-owned state and progression. No DOM, actors, input or rendering dependencies. */
(() => {
  'use strict';
  const { clamp } = window.ShoparFootball.Core;
  const freshStats = () => ({ goals: 0, passes: 0, misses: 0, receives: 0, tackles: 0, saves: 0 });
  class Session {
    constructor(definitions) {
      this.highlightMemory = new Map(); this.match = null;
      this.definitions = definitions; this.index = 0; this.practiceIndex = null;
      this.stats = freshStats(); this.outcomes = [];
      this.keeperPlan = Array(definitions.length).fill('line');
    }
    get seriesIndices() { return this.definitions.flatMap((s, i) => s.practiceOnly ? [] : [i]); }
    get displayNumber() { return this.practiceIndex === null ? this.seriesIndices.indexOf(this.index) + 1 : this.index + 1; }
    get displayCount() { return this.practiceIndex === null ? this.seriesIndices.length : this.definitions.length; }
    memoryFor(id) {
      if (!this.highlightMemory.has(id)) this.highlightMemory.set(id, {});
      return this.highlightMemory.get(id);
    }
    begin(practiceIndex, makeKeeperPlan) {
      this.match = null; this.practiceIndex = practiceIndex;
      this.keeperPlan = makeKeeperPlan();
      this.stats = freshStats(); this.outcomes = []; this.index = practiceIndex ?? this.seriesIndices[0];
    }
    beginMatch(makeKeeperPlan, random = Math.random) {
      this.begin(null, makeKeeperPlan);
      this.match = new window.ShoparFootball.MatchSession(random);
      this.index = this.definitions.findIndex(entry => entry.id === this.match.highlightId);
    }
    recordReception(offBall) { if (offBall) this.stats.receives++; else this.stats.passes++; }
    captureCheckpoint() { this.scenarioSnapshot = { ...this.stats }; }
    restoreCheckpoint() { this.stats = { ...this.scenarioSnapshot }; this.outcomes[this.index] = undefined; }
    advance() {
      if (this.match) {
        const action = this.match.advance();
        if (action === 'next') this.index = this.definitions.findIndex(entry => entry.id === this.match.highlightId);
        return action;
      }
      if (this.practiceIndex !== null) return 'retry';
      const next = this.seriesIndices.find(index => index > this.index);
      if (next === undefined) return 'summary';
      this.index = next; return 'next';
    }
    createKeeperPlan(random = Math.random) {
      const eligible = this.definitions.map((scenario, index) => scenario.keeperEligible && !scenario.practiceOnly ? index : -1).filter(index => index >= 0);
      const plan = eligible.map((_, index) => index < 2 ? 'advanced' : 'line');
      for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; }
      const profiles = [];
      eligible.forEach((index, i) => { profiles[index] = plan[i]; });
      return profiles;
    }
    rating() {
      return clamp(Math.round((this.stats.goals + this.stats.tackles + (this.stats.saves || 0)) * (84 / this.seriesIndices.length) + Math.min(this.stats.passes, 3) * 3 + this.stats.receives * 7), 0, 100);
    }
  }
  window.ShoparFootball.Session = Session;
})();
