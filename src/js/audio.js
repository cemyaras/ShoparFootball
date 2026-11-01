/* Optional synthesized game audio. Kept separate from simulation and rendering. */
(() => {
  'use strict';

  class AudioSystem {
    constructor(onStateChange = () => {}) { this.enabled = false; this.context = null; this.onStateChange = onStateChange; }
    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume().catch(() => { }); } catch { this.enabled = false; }
      }
      this.onStateChange(this.enabled);
      if (this.enabled) this.play('tap');
    }
    play(kind) {
      if (!this.enabled || !this.context) return;
      const ctx = this.context, now = ctx.currentTime;
      const notes = kind === 'goal' ? [440, 554, 659, 880] : kind === 'kick' ? [140, 75] : kind === 'save' ? [220, 110] : kind === 'bounce' ? [105] : [520];
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), at = now + i * .09;
        osc.type = ['kick', 'bounce'].includes(kind) ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(kind === 'kick' ? .14 : .065, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + .18);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + .2);
      });
    }
  }

  const namespace = window.ShoparFootball ||= {};
  namespace.AudioSystem = AudioSystem;
})();
