export type Point = {
  x: number;
  y: number;
};
export type Camera = Point & {
  zoom: number;
};
export function toWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}
export function zoomAt(camera: Camera, anchor: Point, zoom: number): Camera {
  zoom = Math.min(3, Math.max(0.2, zoom));
  const world = toWorld(anchor, camera);
  return { x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom, zoom };
}
export function fitCamera(points: Point[], width: number, height: number): Camera {
  if (!points.length) return { x: width / 2, y: height / 2, zoom: 1 };
  const minX = Math.min(...points.map((p) => p.x)) - 100;
  const maxX = Math.max(...points.map((p) => p.x)) + 100;
  const minY = Math.min(...points.map((p) => p.y)) - 110;
  const maxY = Math.max(...points.map((p) => p.y)) + 90;
  const zoom = Math.min(
    1.35,
    Math.max(0.2, Math.min((width - 60) / (maxX - minX), (height - 100) / (maxY - minY))),
  );
  return {
    x: width / 2 - ((minX + maxX) / 2) * zoom,
    y: height / 2 - ((minY + maxY) / 2) * zoom + 8,
    zoom,
  };
}
