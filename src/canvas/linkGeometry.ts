import type { Link } from '../model/networkTypes';
import type { Point } from './canvasGeometry';

/** Parallel physical cables need distinct hit targets, labels and packet trajectories. */
export function cableGeometry(link: Link, a: Point, b: Point, links: Link[]) {
  const siblings = links.filter(
    (l) => (l.a === link.a && l.b === link.b) || (l.a === link.b && l.b === link.a),
  );
  const index = Math.max(
    0,
    siblings.findIndex((l) => l.id === link.id),
  );
  const offset = (index - (siblings.length - 1) / 2) * 25;
  // Canonical orientation keeps the curve on its own side when endpoint order differs.
  const sign = link.a < link.b ? 1 : -1;
  const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: (-(b.y - a.y) / distance) * sign, y: ((b.x - a.x) / distance) * sign };
  const middle = { x: (a.x + b.x) / 2 + normal.x * offset, y: (a.y + b.y) / 2 + normal.y * offset };
  const path =
    siblings.length < 2
      ? `M${a.x} ${a.y}L${b.x} ${b.y}`
      : `M${a.x} ${a.y}Q${(a.x + b.x) / 2 + normal.x * offset * 2} ${(a.y + b.y) / 2 + normal.y * offset * 2} ${b.x} ${b.y}`;
  return {
    path,
    middle,
    at: (t: number) => ({
      x: a.x + (b.x - a.x) * t + normal.x * offset * 4 * t * (1 - t),
      y: a.y + (b.y - a.y) * t + normal.y * offset * 4 * t * (1 - t),
    }),
  };
}
