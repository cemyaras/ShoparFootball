/* Ordered startup definitions using the common create(context) controller factory. */
(() => {
  'use strict';
  class HighlightRegistry {
    constructor() { this.entries = []; this.byId = new Map(); }
    register(definition) {
      if (!definition.id || !definition.title || typeof definition.create !== 'function') {
        throw new Error('A highlight needs an id, title and create(context) controller factory; legacy adapter factory entries must be migrated.');
      }
      if (this.byId.has(definition.id)) throw new Error(`Duplicate highlight: ${definition.id}`);
      this.entries.push(definition); this.byId.set(definition.id, definition);
      return definition;
    }
    get(id) { return this.byId.get(id); }
    all() { return this.entries.slice(); }
  }
  window.ShoparFootball.HighlightRegistry = HighlightRegistry;
  window.ShoparFootball.Highlights = new HighlightRegistry();
})();
