'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The HTML entry point is the load-order source of truth for browser and VM tests.
const root = path.resolve(__dirname, '../..');
function runtimeScripts() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\b([^>]*)>\s*<\/script>/gi)].map(([, attributes]) => {
    const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || !src.startsWith('./src/js/') || !/\bdefer\b/i.test(attributes) || /\basync\b|\btype\s*=/i.test(attributes)) {
      throw new Error('Runtime scripts must be relative, deferred classic scripts.');
    }
    return { filename: src, source: fs.readFileSync(path.resolve(root, src), 'utf8') };
  });
}
module.exports = { root, runtimeScripts };
