// Build a native stroke toward a projected target, accounting for the touch lift.
export function strokeTo(start, target, bend, touch, steps, waves = 1) {
  const sample = endY => {
    const dx = target.x - start.x, dy = endY - start.y;
    const length = Math.hypot(dx, dy) || 1;
    return Array.from({ length: steps }, (_, i) => {
      const t = (i + 1) / steps, curve = bend * Math.sin(waves * Math.PI * t);
      return { x: start.x + dx * t - dy / length * curve, y: start.y + dy * t + dx / length * curve };
    });
  };
  if (!touch) return sample(target.y);
  let low = target.y, high = target.y + 95;
  for (let i = 0; i < 48; i++) {
    const y = (low + high) / 2;
    const travel = Math.max(...sample(y).map(p => Math.hypot(p.x - start.x, p.y - start.y)));
    const t = Math.min(1, travel / 70);
    if (y - 95 * t * t * (3 - 2 * t) < target.y) low = y; else high = y;
  }
  return sample((low + high) / 2);
}

// Playwright stores view snapshots as JSON, so use the serialized ground matrix.
export function screen(snapshot, point) {
  const { view, rect } = snapshot;
  const [a, b, c, d, e, f] = view.projection.ground;
  return { x: rect.left + view.x + (a * point.x + c * point.y + e) * view.scale,
    y: rect.top + view.y + (b * point.x + d * point.y + f - .52 * (point.z || 0)) * view.scale };
}
