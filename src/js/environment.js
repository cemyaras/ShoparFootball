/* Procedural venues and weather. Presentation stays independent of match physics. */
(() => {
  'use strict';
  const PITCHES = Object.freeze({
    stadium: { name: 'Stadium', outside: '#142b1a', ground: '#339137', stripe: '#3ca240', line: '#ffffff' },
    street: { name: 'Street', outside: '#30383e', ground: '#515a60', stripe: '#515a60', line: '#efe3bb' },
    dirt: { name: 'Dirt', outside: '#726346', ground: '#b38355', stripe: '#b38355', line: '#fff1d0' }
  });
  const WEATHER = Object.freeze({
    sunny: { name: 'Sunny', icon: '☀' }, cloudy: { name: 'Cloudy', icon: '☁' },
    rain: { name: 'Rain', icon: '☂' }, snow: { name: 'Snow', icon: '❄' }
  });
  const STORAGE_KEY = 'shopar-football.conditions';

  class FootballEnvironment {
    constructor() {
      this.pitch = 'stadium'; this.weather = 'sunny';
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
        if (saved) this.set(saved.pitch, saved.weather, false);
      } catch { /* Direct-file or private browsing can deny storage. */ }
    }
    set(pitch, weather, persist = true) {
      if (Object.hasOwn(PITCHES, pitch)) this.pitch = pitch;
      if (Object.hasOwn(WEATHER, weather)) this.weather = weather;
      if (persist) {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ pitch: this.pitch, weather: this.weather })); } catch { /* Keep playing without storage. */ }
      }
    }
    get palette() { return PITCHES[this.pitch]; }
    get forecast() { return WEATHER[this.weather]; }
    get label() { return `${this.palette.name} · ${this.forecast.name}`; }
    drawRunoff(c, wide = false) {
      if (wide) {
        // The angled camera shows ground beyond the touchlines and in front of the pitch.
        c.fillStyle = this.pitch === 'street' ? '#394148' : this.pitch === 'dirt' ? '#7d6240' : '#1d3823';
        c.fillRect(-1500, -32, 4000, 3500);
        if (this.pitch === 'stadium') {
          c.fillStyle = 'rgba(255,255,255,.03)';
          for (let y = -32; y < 2000; y += 120) c.fillRect(-1500, y, 4000, 60);
        }
      }
      // A short apron behind the net, bounded by the existing venue backdrop.
      c.fillStyle = this.pitch === 'street' ? '#465057' : this.pitch === 'dirt' ? '#9c784f' : '#28482e';
      c.fillRect(76, -32, 848, 116);
      c.fillStyle = 'rgba(255,255,255,.035)';
      for (let i = 0; i < 90; i++) c.fillRect(83 + i * 137 % 830, -25 + i * 37 % 104, 2, 3);
    }
    drawSurroundings(c, rearOffset = 0, projection) {
      c.save();
      if (projection) {
        c.transform(...projection.upright(0, -32));
        c.translate(0, -82);
      } else c.translate(0, rearOffset);
      if (this.pitch === 'street') {
        // Apartment fronts, a painted brick wall, and chain-link fencing.
        for (let i = projection ? -4 : 0; i < (projection ? 14 : 10); i++) {
          const x = 36 + i * 96;
          c.fillStyle = ['#58636b', '#746b62', '#4c5962'][i % 3]; c.fillRect(x, -100, 90, 100);
          c.fillStyle = '#c1af7d';
          for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) c.fillRect(x + 10 + col * 25, -90 + row * 28, 9, 14);
        }
        c.fillStyle = '#71594e'; c.fillRect(48, -2, 904, 78);
        c.strokeStyle = '#8d7160'; c.lineWidth = 1;
        for (let y = 0; y < 76; y += 12) {
          c.beginPath(); c.moveTo(48, y); c.lineTo(952, y); c.stroke();
          for (let x = 48 + (y % 24 ? 20 : 0); x < 952; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 12); c.stroke(); }
        }
        c.save(); c.translate(125, 48); c.rotate(-.06); c.fillStyle = '#e0cf8b'; c.font = 'italic 900 22px Arial'; c.fillText('PLAY LOCAL', 0, 0); c.restore();
        c.fillStyle = '#8ab9b5'; c.font = '900 18px Arial'; c.fillText('SHOPAR / STREET CLUB', 651, 47);
        c.save(); c.beginPath(); c.rect(48, -30, 904, 107); c.clip();
        c.strokeStyle = 'rgba(177,196,199,.32)'; c.lineWidth = 1;
        for (let x = -60; x < 1050; x += 18) { c.beginPath(); c.moveTo(x, -30); c.lineTo(x + 107, 77); c.moveTo(x, 77); c.lineTo(x + 107, -30); c.stroke(); }
        c.restore(); c.strokeStyle = '#a2afb0'; c.lineWidth = 3;
        for (let x = 48; x <= 952; x += 113) { c.beginPath(); c.moveTo(x, -35); c.lineTo(x, 78); c.stroke(); }
        c.fillStyle = '#a4a79e'; c.fillRect(48, 77, 904, 5);
      } else if (this.pitch === 'dirt') {
        c.fillStyle = '#92916a'; c.fillRect(projection ? -1000 : 0, -100, projection ? 3000 : 1000, 178);
        for (let i = projection ? -12 : 0; i < (projection ? 27 : 15); i++) {
          const x = 15 + i * 72, y = -10 + i % 3 * 8;
          c.fillStyle = '#67533b'; c.fillRect(x - 3, y - 4, 6, 58);
          c.fillStyle = i % 2 ? '#4c6446' : '#5c744b'; c.beginPath(); c.arc(x, y - 12, 27 + i % 4 * 3, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#a28c64'; c.fillRect(32, 38, 936, 43);
        c.strokeStyle = '#d4c39c'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(45, 60); c.lineTo(955, 60); c.stroke();
        for (let x = 45; x < 960; x += 65) { c.beginPath(); c.moveTo(x, 45); c.lineTo(x, 81); c.stroke(); }
        for (const x of [175, 755]) {
          c.fillStyle = '#4e4536'; c.fillRect(x + 8, 55, 5, 19); c.fillRect(x + 65, 55, 5, 19);
          c.fillStyle = '#ba955e'; c.fillRect(x, 46, 78, 7); c.fillRect(x, 57, 78, 6);
        }
        c.fillStyle = '#e1ce9c'; c.font = 'bold 10px Arial'; c.fillText('THE LOCAL GROUND', 90, 30);
      }
      c.restore();
      if (this.pitch === 'street') {
        c.save();
        if (projection) c.transform(...projection.ground);
        c.fillStyle = '#a4a79e'; c.fillRect(53, 84, 17, 600); c.fillRect(930, 84, 17, 600);
        c.restore();
      }
    }
    drawSurface(c) {
      const p = this.palette;
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? p.stripe : p.ground; c.fillRect(76, 84 + i * 60, 848, 60); }
      c.save(); c.beginPath(); c.rect(76, 84, 848, 600); c.clip();
      if (this.pitch === 'street') {
        c.strokeStyle = '#424b50'; c.lineWidth = 2;
        for (let i = 0; i < 16; i++) {
          const x = 90 + (i * 173) % 810, y = 95 + (i * 127) % 570;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y + 17); c.lineTo(x + 7, y + 31); c.lineTo(x + 24, y + 46); c.stroke();
        }
        c.fillStyle = '#434d53'; c.fillRect(96, 453, 148, 51); c.fillRect(766, 317, 117, 74);
      } else if (this.pitch === 'dirt') {
        for (let i = 0; i < 35; i++) {
          c.fillStyle = i % 2 ? 'rgba(126,83,48,.16)' : 'rgba(232,191,126,.2)';
          c.beginPath(); c.ellipse(88 + (i * 173) % 830, 95 + (i * 131) % 580, 16 + i % 5 * 11, 7 + i % 3 * 5, i, 0, Math.PI * 2); c.fill();
        }
        c.strokeStyle = 'rgba(102,68,38,.18)'; c.lineWidth = 3;
        for (let i = 0; i < 20; i++) { const x = 100 + (i * 137) % 800, y = 110 + (i * 97) % 550; c.beginPath(); c.arc(x, y, 15, .2, 1.7); c.stroke(); }
      }
      c.fillStyle = this.pitch === 'dirt' ? 'rgba(68,48,28,.18)' : 'rgba(255,255,255,.045)';
      for (let i = 0; i < 240; i++) c.fillRect(83 + (i * 137) % 830, 90 + (i * 97) % 585, 2, this.pitch === 'stadium' ? 4 : 2);
      if (this.weather === 'rain') {
        c.fillStyle = this.pitch === 'dirt' ? 'rgba(80,65,44,.25)' : 'rgba(166,198,215,.18)';
        for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(100 + (i * 193) % 790, 115 + (i * 137) % 540, 14 + i % 3 * 12, 3 + i % 4, -.12, 0, Math.PI * 2); c.fill(); }
      } else if (this.weather === 'snow') {
        c.fillStyle = 'rgba(237,245,246,.28)';
        for (let i = 0; i < 42; i++) { c.beginPath(); c.ellipse(85 + (i * 193) % 830, 95 + (i * 137) % 580, 10 + i % 4 * 9, 3 + i % 3 * 3, -.2, 0, Math.PI * 2); c.fill(); }
      }
      c.restore();
    }
    drawAtmosphere(c, time, reducedMotion, view) {
      const { scale, width, height } = view, left = -view.x / scale, top = -view.y / scale;
      c.save();
      const tint = { sunny: 'rgba(255,213,121,.035)', cloudy: 'rgba(47,65,86,.18)', rain: 'rgba(27,48,74,.22)', snow: 'rgba(192,214,228,.13)' };
      c.fillStyle = tint[this.weather]; c.fillRect(-4000, -4000, 8000, 8000);
      const t = reducedMotion ? 0 : time;
      if (this.weather === 'rain') {
        c.strokeStyle = 'rgba(203,225,243,.52)'; c.lineWidth = 1 / scale;
        const count = reducedMotion ? 25 : 100;
        c.beginPath();
        for (let i = 0; i < count; i++) { const x = left + (((i * 137 - t * 55) % (width + 40) + width + 40) % (width + 40) - 20) / scale, y = top + ((i * 97 + t * 280) % (height + 40) - 20) / scale; c.moveTo(x, y); c.lineTo(x - 3 / scale, y + 9 / scale); }
        c.stroke();
      } else if (this.weather === 'snow') {
        c.fillStyle = 'rgba(243,249,255,.8)';
        const count = reducedMotion ? 20 : 65;
        for (let i = 0; i < count; i++) { const x = left + (i * 137 + Math.sin(t + i) * 8 + t * 9) % (width + 40) / scale - 20 / scale, y = top + ((i * 97 + t * (18 + i % 5 * 4)) % (height + 40) - 20) / scale; c.beginPath(); c.arc(x, y, (1 + i % 3 * .4) / scale, 0, Math.PI * 2); c.fill(); }
      }
      c.restore();
    }
  }
  window.FootballEnvironment = FootballEnvironment;
})();
