'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

test('FootballGame class loads without DOM, startup effects or an early registration snapshot', () => {
  const window = {}, sandbox = { window }; let reads = 0;
  for (const { source, filename } of runtimeScripts().filter(s => /\/(core|physics|game)\.js$/.test(s.filename))) {
    if (filename.endsWith('/game.js')) window.ShoparFootball.Highlights = { all() { reads++; throw new Error('Too early'); } };
    vm.runInNewContext(source, sandbox, { filename });
  }
  assert.equal(typeof window.ShoparFootball.FootballGame, 'function');
  assert.equal(window.footballGame, undefined); assert.equal(reads, 0);
});

test('the final deferred bootstrap constructs one application and publishes the inspection instance', () => {
  let constructed = 0;
  class Game { constructor() { constructed++; } }
  const scripts = runtimeScripts(), bootstrap = scripts.at(-1);
  assert.equal(bootstrap.filename, './src/js/bootstrap.js');
  assert.ok(scripts.findIndex(s => s.filename.endsWith('/game.js')) < scripts.length - 1);
  const window = { ShoparFootball: { FootballGame: Game } };
  vm.runInNewContext(bootstrap.source, { window }, { filename: bootstrap.filename });
  assert.equal(constructed, 1); assert.ok(window.footballGame instanceof Game);
});
