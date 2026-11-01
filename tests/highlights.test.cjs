'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

function catalog() {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script => /\/core\.js$|\/highlights\//.test(script.filename))) {
    vm.runInNewContext(source, { window }, { filename });
  }
  return window.ShoparFootball;
}

test('the catalog retains the seven ordered IDs, titles and starting positions', () => {
  const entries = catalog().Highlights.all();
  assert.equal(JSON.stringify(entries.map(({ id, title, player }) => [id, title, player])), JSON.stringify([
    ['one-on-one', 'One on one.', [500, 365]], ['from-distance', 'From distance.', [540, 520]],
    ['through-ball', 'The through ball.', [600, 476]], ['two-against-two', 'Two against two.', [379, 425]],
    ['read-the-game', 'Read the game.', [485, 428]], ['win-the-ball', 'Win the Ball', [370, 520]],
    ['cut-the-pass', 'Cut the Pass', [550, 530]]
  ]));
  assert.equal(entries.filter(entry => entry.category === 'defense').length, 2);
  assert.equal(entries.filter(entry => entry.keeperEligible).length, 5);
});

test('registry rejects ambiguous IDs and returns ordered list snapshots without cloning definitions', () => {
  const { HighlightRegistry, Highlights } = catalog(), registry = new HighlightRegistry();
  const entry = Highlights.get('one-on-one'); registry.register(entry);
  assert.equal(registry.get(entry.id), entry);
  assert.throws(() => registry.register(entry), /Duplicate highlight/);
  assert.throws(() => registry.register({ id: 'incomplete', title: 'Incomplete' }), /adapter factory/);
  const copy = registry.all(); copy.pop(); assert.equal(registry.all().length, 1);
  assert.equal(registry.all()[0], entry);
});

test('all catalog entries use create(context) and adapter-only registrations are rejected', () => {
  const namespace = catalog();
  assert.equal(namespace.LegacyHighlights, undefined);
  for (const definition of namespace.Highlights.all()) {
    assert.equal(typeof definition.create, 'function'); assert.equal(definition.createAdapter, undefined);
  }
  const registry = new namespace.HighlightRegistry();
  assert.throws(() => registry.register({ id: 'old-adapter', title: 'Old adapter', createAdapter() {} }), /create\(context\)/);
});
