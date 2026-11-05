/* Shared world constants, math and geometry. No DOM or game lifecycle dependencies. */
(() => {
  'use strict';

  const State = Object.freeze({ TITLE: 'TITLE', HIGHLIGHT_INTRO: 'HIGHLIGHT_INTRO', AIMING: 'AIMING', BALL_CONTACT: 'BALL_CONTACT', BALL_IN_MOTION: 'BALL_IN_MOTION', INTERCEPTION: 'INTERCEPTION', DEFENDING: 'DEFENDING', RESULT: 'RESULT', SESSION_SUMMARY: 'SESSION_SUMMARY' });
  const W = 1000, H = 740;
  const HEIGHT_PROJECTION = .52;
  const BACKDROP_SHIFT = -55;
  const STADIUM_OFFSET = -48 + BACKDROP_SHIFT;
  const BALL_GRAVITY = 260, MISS_PLAYBACK = .42;
  // Projected mouth: 200 × 58.24; standing keeper: 40.7 units tall.
  // Net depth is separate from upright height; all heights use the ball's projection.
  const GOAL = Object.freeze({ height: 112, depth: 48, postWidth: 5, keeperScale: 1.1, keeperOffset: 16, keeperReach: 70, keeperReaction: .28 });
  // Keep player/ball proportions in world space, independent of viewport or DPR.
  const SPRITES = Object.freeze({ playerHeight: 37, farScale: 1.1, nearScale: 1.6, ballToPlayer: .23, maxAirScale: 1.18, airGrowth: .0018, footOffset: 10 });
  const FIELD = { left: 76, right: 924, top: 84, bottom: 684, goalLeft: 400, goalRight: 600, crossbar: GOAL.height };
  const CONTACT_TIME = 6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const length = (x, y) => Math.hypot(x, y);
  const distance = (a, b) => length(a.x - b.x, a.y - b.y);

  const namespace = window.ShoparFootball ||= {};
  namespace.Core = {
    State, W, H, HEIGHT_PROJECTION, BACKDROP_SHIFT, STADIUM_OFFSET, BALL_GRAVITY, MISS_PLAYBACK, GOAL, SPRITES, FIELD, CONTACT_TIME, clamp, lerp, length, distance,
    makePlayer(x, y, team, number) { return { x, y, startX: x, startY: y, tx: x, ty: y, team, number, step: 0, celebration: 0 }; },
    depthScale(y) {
      const nearGoal = FIELD.top + GOAL.keeperOffset;
      return lerp(SPRITES.farScale, SPRITES.nearScale, clamp((y - nearGoal) / (FIELD.bottom - nearGoal), 0, 1));
    },
    playerScale(player) { return player.team === 'keeper' ? GOAL.keeperScale : this.depthScale(player.y); },
    possessionPosition(player) {
      const offset = SPRITES.footOffset * this.playerScale(player);
      return { x: player.x + offset, y: player.y + offset };
    },
    ballGeometry(ball) {
      const groundRadius = SPRITES.playerHeight * SPRITES.ballToPlayer * .5 * this.depthScale(ball.y);
      const airScale = clamp(1 + Math.max(0, ball.z) * SPRITES.airGrowth, 1, SPRITES.maxAirScale);
      return { groundRadius, radius: groundRadius * airScale, height: ball.z * HEIGHT_PROJECTION };
    },
    goalCorners() {
      const plane = y => [
        { x: FIELD.goalLeft, y, z: GOAL.height }, { x: FIELD.goalRight, y, z: GOAL.height },
        { x: FIELD.goalLeft, y, z: 0 }, { x: FIELD.goalRight, y, z: 0 }
      ];
      return [...plane(FIELD.top), ...plane(FIELD.top - GOAL.depth)];
    },
    goalGeometry() {
      const top = FIELD.top - FIELD.crossbar * HEIGHT_PROJECTION;
      return { left: FIELD.goalLeft, right: FIELD.goalRight, bottom: FIELD.top, top, backTop: top - GOAL.depth, backBottom: FIELD.top - GOAL.depth, inset: 8 };
    }
  };
})();
