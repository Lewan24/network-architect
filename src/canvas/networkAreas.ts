import type { Point } from './canvasGeometry';

function hull(points: Point[]) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: Point[]) => {
    const out: Point[] = [];
    for (const p of items) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
/** Areas follow their members, so dragging a device or group recalculates the boundary. */
export function networkAreaPolygon(members: Point[]): Point[] {
  if (!members.length) return [];
  return hull(
    members.flatMap((d) => [
      { x: d.x - 85, y: d.y },
      { x: d.x, y: d.y - 90 },
      { x: d.x + 85, y: d.y },
      { x: d.x, y: d.y + 85 },
    ]),
  );
}
