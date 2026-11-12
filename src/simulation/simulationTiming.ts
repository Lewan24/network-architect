import type { Device, Probe, Result } from '../model/networkTypes';

export const HOP_MS = 1000;
export const START_MS = 350;
export const ARRIVAL_ADVANCE_MS = 220;
const FINISH_PAUSE_MS = 450;
export type TrafficLog = {
  id: string;
  time: string;
  probe: Probe;
  result: Result;
  status: 'pending' | 'complete' | 'cancelled';
  names: Record<string, string>;
  reached?: number;
};
export type Flight = {
  id: string;
  startedAt: number;
  /** Logical milliseconds accumulated before the latest speed change. */
  elapsed: number;
  speed: number;
  route: Device[];
  result: Result;
};
export function flightElapsed(
  flight: Pick<Flight, 'elapsed' | 'startedAt' | 'speed'>,
  now: number,
) {
  return flight.elapsed + Math.max(0, now - flight.startedAt) * flight.speed;
}
export function retimeFlight(flight: Flight, speed: number, now: number): Flight {
  return { ...flight, elapsed: flightElapsed(flight, now), startedAt: now, speed };
}
export function flightDuration(pathLength: number) {
  return START_MS + Math.max(0, pathLength - 1) * HOP_MS + FINISH_PAUSE_MS;
}
export function flightFrame(elapsed: number, route: Device[]) {
  if (!route.length) return { x: 0, y: 0 };
  const position = Math.max(0, (elapsed - START_MS) / HOP_MS);
  const index = Math.min(route.length - 1, Math.floor(position));
  const from = route[index];
  const to = route[Math.min(index + 1, route.length - 1)];
  const progress = Math.min(1, (position - index) / 0.78);
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}
