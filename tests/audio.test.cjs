'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

function fixture(AudioContext) {
  const attributes = new Map();
  const document = { getElementById: id => ({ setAttribute: (key, value) => attributes.set(`${id}.${key}`, value) }) };
  const window = { AudioContext };
  for (const { source, filename } of runtimeScripts().filter(script => /\/(core|audio)\.js$|\/platform\/ui\.js$/.test(script.filename))) vm.runInNewContext(source, { window, document }, { filename });
  return { audio: new window.ShoparFootball.AudioSystem(window.ShoparFootball.DomUI.soundState), attributes };
}
function contextStub() {
  const contexts = [];
  class Context {
    constructor() { this.currentTime = 10; this.destination = {}; this.notes = []; this.resumes = 0; contexts.push(this); }
    resume() { this.resumes++; return Promise.resolve(); }
    createOscillator() {
      const note = { envelope: [], frequency: { setValueAtTime(value, at) { note.pitch = [value, at]; } },
        connect() {}, start(at) { note.startAt = at; }, stop(at) { note.stopAt = at; } };
      this.notes.push(note); return note;
    }
    createGain() {
      const note = this.notes[this.notes.length - 1];
      return { connect() {}, gain: { setValueAtTime: (...args) => note.envelope.push(args), exponentialRampToValueAtTime: (...args) => note.envelope.push(args) } };
    }
  }
  return { Context, contexts };
}

test('audio stays muted until enabled, updates controls and reuses its context after muting', () => {
  const { Context, contexts } = contextStub(), { audio, attributes } = fixture(Context);
  audio.play('goal'); assert.equal(contexts.length, 0); assert.equal(audio.enabled, false);
  audio.toggle(); assert.equal(contexts.length, 1); assert.equal(contexts[0].resumes, 1);
  assert.equal(attributes.get('sound-button.aria-pressed'), 'true');
  assert.equal(attributes.get('sound-button.aria-label'), 'Mute sound');
  assert.equal(contexts[0].notes.length, 1);
  audio.toggle(); audio.play('goal'); assert.equal(contexts[0].notes.length, 1);
  assert.equal(attributes.get('sound-button.aria-pressed'), 'false');
  assert.equal(attributes.get('sound-button.aria-label'), 'Enable sound');
  audio.toggle(); assert.equal(contexts.length, 1); assert.equal(contexts[0].resumes, 2);
});

test('game cues retain their pitches, waveforms, timing and gain envelopes', () => {
  const { Context } = contextStub(), { audio } = fixture(Context);
  audio.toggle();
  for (const [kind, pitches, type, peak] of [
    ['tap', [520], 'sine', .065], ['kick', [140, 75], 'triangle', .14],
    ['save', [220, 110], 'sine', .065], ['bounce', [105], 'triangle', .065],
    ['goal', [440, 554, 659, 880], 'sine', .065]
  ]) {
    audio.context.notes = []; audio.play(kind);
    assert.equal(audio.context.notes.length, pitches.length);
    pitches.forEach((pitch, i) => {
      const note = audio.context.notes[i], at = 10 + i * .09;
      assert.deepEqual(note.pitch, [pitch, at]); assert.equal(note.type, type);
      assert.equal(note.startAt, at); assert.equal(note.stopAt, at + .2);
      assert.deepEqual(note.envelope, [[.0001, at], [peak, at + .012], [.0001, at + .18]]);
    });
  }
});

test('unavailable audio leaves gameplay usable and the sound control muted', () => {
  for (const unavailable of [undefined, class { constructor() { throw new Error('Unavailable'); } }]) {
    const { audio, attributes } = fixture(unavailable);
    assert.doesNotThrow(() => { audio.toggle(); audio.play('kick'); });
    assert.equal(audio.enabled, false); assert.equal(audio.context, null);
    assert.equal(attributes.get('sound-button.aria-pressed'), 'false');
  }
});

test('audio can load and handle unavailable hardware without any DOM or UI module', () => {
  const window = {};
  const { source, filename } = runtimeScripts().find(script => script.filename.endsWith('/audio.js'));
  vm.runInNewContext(source, { window }, { filename });
  const audio = new window.ShoparFootball.AudioSystem();
  assert.doesNotThrow(() => { audio.toggle(); audio.play('goal'); });
  assert.equal(audio.enabled, false);
});
