import { describe, expect, it } from 'vitest';
import { fitCamera, toWorld, zoomAt } from './canvasGeometry';
import { example } from './fixtures/legacyNetwork';

import { flightDuration, flightFrame, HOP_MS, START_MS } from './simulationTiming';
describe('canvas coordinates', () => {
  it('maps CSS pixels to world coordinates without relying on SVG letterboxing', () =>
    expect(toWorld({ x: 350, y: 180 }, { x: 50, y: 30, zoom: 1.5 })).toEqual({ x: 200, y: 100 }));
  it('keeps the same world point under the pointer when zoom changes', () => {
    const camera = { x: -125, y: 78, zoom: 0.73 };
    const anchor = { x: 431, y: 227 };
    const before = toWorld(anchor, camera);
    const after = toWorld(anchor, zoomAt(camera, anchor, 1.9));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it('bounds zoom and handles an empty canvas', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100 }, 100).zoom).toBe(3);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100 }, 0.001).zoom).toBe(0.2);
    expect(fitCamera([], 800, 600)).toEqual({ x: 400, y: 300, zoom: 1 });
  });
  it('fits devices within a resized workspace', () => {
    for (const [width, height] of [
      [1100, 700],
      [760, 330],
      [330, 300],
    ]) {
      const c = fitCamera(example.devices, width, height);
      for (const d of example.devices) {
        expect(d.x * c.zoom + c.x).toBeGreaterThan(0);
        expect(d.x * c.zoom + c.x).toBeLessThan(width);
        expect(d.y * c.zoom + c.y).toBeGreaterThan(0);
        expect(d.y * c.zoom + c.y).toBeLessThan(height);
      }
    }
  });
});
describe('packet animation timeline', () => {
  const route = [
    { ...example.devices[0], x: 0, y: 0 },
    { ...example.devices[1], x: 100, y: 50 },
    { ...example.devices[2], x: 200, y: 100 },
  ];
  it('starts at the source and interpolates along the first physical connection', () => {
    expect(flightFrame(0, route)).toEqual({ x: 0, y: 0 });
    const p = flightFrame(START_MS + HOP_MS * 0.39, route);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(25);
  });
  it('pauses at intermediate devices before forwarding to the next connection', () => {
    expect(flightFrame(START_MS + HOP_MS * 0.9, route)).toEqual({ x: 100, y: 50 });
    const p = flightFrame(START_MS + HOP_MS * 1.39, route);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(75);
  });
  it('ends at the last hop before completing the result', () => {
    const duration = flightDuration(route.length);
    expect(duration).toBeGreaterThan(START_MS + 2 * HOP_MS);
    expect(flightFrame(duration, route)).toEqual({ x: 200, y: 100 });
  });
});
