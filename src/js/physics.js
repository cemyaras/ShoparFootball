/* Ball launch, integration, movement and goal-line classification. No presentation effects. */
(() => {
  'use strict';
  const Core = window.ShoparFootball.Core;
  const { clamp, length, BALL_GRAVITY, FIELD, GOAL, HEIGHT_PROJECTION } = Core;

  window.ShoparFootball.Physics = {
    kickVelocity(kick, contact) {
      const r = length(contact.x, contact.y), edge = Math.max(0, r - .78), accuracy = contact.timedOut ? .15 : edge * .18;
      const angle = Math.atan2(kick.dy, kick.dx) + (contact.timedOut ? .12 : contact.x * accuracy);
      // Off-centre contact trades forward pace for lift or a weaker topped strike.
      const top = Math.max(0, -contact.y), under = Math.max(0, contact.y);
      const transfer = 1 - .38 * Math.pow(top, 1.3) - .16 * under * under;
      const speed = (220 + kick.power * 530) * transfer * (1 - edge * .2) * (contact.timedOut ? .68 : 1);
      const loftPower = .65 + .7 * kick.power;
      const loft = Math.max(0, 62 + contact.y * 245);
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: loft * loftPower, spin: -contact.x * .82 };
    },
    integrateBall(ball, dt, restitution = .46) {
      // Rotate velocity rather than adding lateral energy on every frame.
      // Smaller steps keep landings and curvature consistent at different frame rates.
      let impact = null;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const airborne = ball.z > .001 || ball.vz > 0;
        const turn = ball.spin * (airborne ? .80 : .12) * h;
        const cos = Math.cos(turn), sin = Math.sin(turn), vx = ball.vx;
        ball.vx = vx * cos - ball.vy * sin; ball.vy = vx * sin + ball.vy * cos;
        const decay = Math.exp(-(airborne ? .10 : .49) * h);
        const travel = (1 - decay) / (airborne ? .10 : .49);
        ball.x += ball.vx * travel; ball.y += ball.vy * travel;
        ball.vx *= decay; ball.vy *= decay;
        if (airborne) {
          const nextZ = ball.z + ball.vz * h - .5 * BALL_GRAVITY * h * h;
          if (nextZ <= 0) {
            const hitTime = clamp((ball.vz + Math.sqrt(ball.vz * ball.vz + 2 * BALL_GRAVITY * ball.z)) / BALL_GRAVITY, 0, h);
            const hitSpeed = Math.max(0, BALL_GRAVITY * hitTime - ball.vz);
            const rebound = hitSpeed > 38 ? hitSpeed * restitution : 0, rest = h - hitTime;
            ball.z = rebound ? Math.max(0, rebound * rest - .5 * BALL_GRAVITY * rest * rest) : 0;
            ball.vz = rebound ? rebound - BALL_GRAVITY * rest : 0;
            ball.vx *= .88; ball.vy *= .88; ball.spin *= .65;
            if (hitSpeed > 38) impact = { x: ball.x, y: ball.y, strength: clamp(hitSpeed / 250, .2, 1) };
          } else { ball.z = nextZ; ball.vz -= BALL_GRAVITY * h; }
        }
        ball.spin *= Math.exp(-h * (airborne ? .23 : 2.8));
        ball.rotation += length(ball.vx, ball.vy) * h * .045 + ball.spin * h * 4;
      }
      ball.age += dt;
      return impact;
    },
    movePlayer(p, tx, ty, speed, dt) {
      const dx = tx - p.x, dy = ty - p.y, d = length(dx, dy), move = Math.min(d, speed * dt);
      if (d > .1) { p.x += dx / d * move; p.y += dy / d * move; p.step += move * .085; } p.tx = tx; p.ty = ty;
    },
    containGoalBall(ball, previous, backRebound = .015, backLateralRetention = .45) {
      const radius = Core.ballGeometry({ x: ball.x, y: FIELD.top, z: 0 }).groundRadius;
      const back = FIELD.top - GOAL.depth, roof = GOAL.height;
      const leftLimit = FIELD.goalLeft + radius, rightLimit = FIELD.goalRight - radius;
      const backLimit = back + radius, roofLimit = roof - radius / HEIGHT_PROJECTION;
      const contacts = [];
      const hit = (surface, axis, limit, plane) => {
        const travel = ball[axis] - previous[axis];
        const fraction = travel ? clamp((limit - previous[axis]) / travel, 0, 1) : 0;
        const point = { x: Core.lerp(previous.x, ball.x, fraction), y: Core.lerp(previous.y, ball.y, fraction),
          z: Core.lerp(previous.z, ball.z, fraction) };
        point[axis] = plane;
        point.x = clamp(point.x, FIELD.goalLeft, FIELD.goalRight);
        point.y = clamp(point.y, back, FIELD.top);
        point.z = clamp(point.z, 0, roof);
        contacts.push({ fraction, surface, ...point });
      };
      if (ball.y <= backLimit && ball.vy < 0) hit('back', 'y', backLimit, back);
      if (ball.x <= leftLimit && ball.vx < 0) hit('left', 'x', leftLimit, FIELD.goalLeft);
      if (ball.x >= rightLimit && ball.vx > 0) hit('right', 'x', rightLimit, FIELD.goalRight);
      if (ball.z >= roofLimit && ball.vz > 0) hit('roof', 'z', roofLimit, roof);

      if (ball.y <= backLimit && ball.vy < 0) {
        ball.vy = -ball.vy * backRebound;
        ball.vx *= backLateralRetention;
      }
      if ((ball.x <= leftLimit && ball.vx < 0) || (ball.x >= rightLimit && ball.vx > 0)) ball.vx *= -.2;
      if (ball.y > FIELD.top - radius && ball.vy > 0) ball.vy *= -.2;
      if (ball.z >= roofLimit && ball.vz > 0) ball.vz *= -.2;
      ball.x = clamp(ball.x, leftLimit, rightLimit);
      ball.y = clamp(ball.y, backLimit, FIELD.top - radius);
      ball.z = Math.min(ball.z, roofLimit);
      return contacts.reduce((first, contact) => !first || contact.fraction < first.fraction ? contact : first, null);
    },
    goalLineOutcome(x, z) {
      // Airborne enlargement is a readability effect, not a larger collision sphere.
      const radius = Core.ballGeometry({ x, y: FIELD.top, z: 0 }).groundRadius;
      const contactRadius = radius + GOAL.postWidth / 2;
      const height = z * HEIGHT_PROJECTION, barHeight = FIELD.crossbar * HEIGHT_PROJECTION;
      // Distance to finite, round-ended frame segments; corners have no box-shaped hit area.
      const postHeight = clamp(height, 0, barHeight);
      const leftDistance = Math.hypot(x - FIELD.goalLeft, height - postHeight);
      const rightDistance = Math.hypot(x - FIELD.goalRight, height - postHeight);
      if (Math.min(leftDistance, rightDistance) <= contactRadius) return 'post';
      const barX = clamp(x, FIELD.goalLeft, FIELD.goalRight);
      if (Math.hypot(x - barX, height - barHeight) <= contactRadius) return 'bar';
      const inside = x > FIELD.goalLeft + contactRadius && x < FIELD.goalRight - contactRadius;
      if (inside && height < barHeight - contactRadius) return 'goal';
      return height > barHeight + contactRadius && x > FIELD.goalLeft && x < FIELD.goalRight ? 'high' : 'wide';
    }
  };
})();
