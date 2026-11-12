import { useCallback, useEffect, useRef, useState } from 'react';
import { internetConnection } from '../model/internetModel';
import { internetProbe } from './internetTraffic';
import { tracePath } from '../model/network';
import { simulateNetwork as simulate } from './networkEngine';
import type { Network, Probe } from '../model/networkTypes';
import {
  ARRIVAL_ADVANCE_MS,
  HOP_MS,
  START_MS,
  flightDuration,
  flightElapsed,
  retimeFlight,
  type Flight,
  type TrafficLog,
} from './simulationTiming';

export function useSimulation(network: Network, notify: (message: string) => void) {
  const [logs, setLogs] = useState<TrafficLog[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [hop, setHop] = useState(0);
  const [random, setRandom] = useState(false);
  const busy = useRef(false);
  const [speed, setSpeed] = useState(1);
  function changeSpeed(value: number) {
    const next = Math.max(0.5, Math.min(5, value));
    if (!Number.isFinite(next)) return;
    setSpeed(next);
    const now = performance.now();
    setFlight((current) => (current ? retimeFlight(current, next, now) : null));
  }
  const [sequence, setSequence] = useState(0);
  const start = useCallback(
    (probe: Probe) => {
      if (busy.current) return;
      if (
        probe.protocol !== 'ICMP' &&
        (!Number.isInteger(probe.port) || probe.port < 1 || probe.port > 65535)
      ) {
        notify('Port musi być liczbą od 1 do 65535.');
        return;
      }
      const result = simulate(network, probe);
      const id = crypto.randomUUID();
      setSequence((s) => s + 1);
      const route = tracePath(result)
        .map((id) => network.devices.find((d) => d.id === id)!)
        .filter(Boolean);
      if (!route.length) {
        setLogs((l) =>
          [
            {
              id,
              time: new Date().toLocaleTimeString('pl-PL'),
              probe: { ...probe },
              result,
              status: 'complete' as const,
              names: Object.fromEntries(network.devices.map((d) => [d.id, d.name])),
            },
            ...l,
          ].slice(0, 100),
        );
        setActiveId(id);
        return;
      }
      busy.current = true;
      setLogs((l) =>
        [
          {
            id,
            time: new Date().toLocaleTimeString('pl-PL'),
            probe: { ...probe },
            result,
            status: 'pending' as const,
            names: Object.fromEntries(network.devices.map((d) => [d.id, d.name])),
          },
          ...l,
        ].slice(0, 100),
      );
      setActiveId(id);
      setHop(0);
      setFlight({ id, startedAt: performance.now(), elapsed: 0, speed, route, result });
    },
    [network, notify, speed],
  );
  useEffect(() => {
    if (!flight) return;
    const elapsed = flightElapsed(flight, performance.now());
    const timers = flight.route
      .slice(1)
      .map((_, i) => ({ hop: i + 1, at: START_MS + (i + 1) * HOP_MS - ARRIVAL_ADVANCE_MS }))
      .filter((step) => step.at > elapsed)
      .map((step) => setTimeout(() => setHop(step.hop), (step.at - elapsed) / flight.speed));
    setHop(
      Math.min(
        flight.route.length - 1,
        Math.max(0, Math.floor((elapsed - START_MS + ARRIVAL_ADVANCE_MS) / HOP_MS)),
      ),
    );
    const done = setTimeout(
      () => {
        setLogs((logs) => logs.map((l) => (l.id === flight.id ? { ...l, status: 'complete' } : l)));
        busy.current = false;
        setFlight(null);
      },
      Math.max(0, flightDuration(flight.route.length) - elapsed) / flight.speed,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [flight]);
  useEffect(() => {
    if (!random || flight) return;
    const timer = setTimeout(() => {
      const probe = internetProbe(network);
      if (!probe) {
        setRandom(false);
        notify(internetConnection(network).error || 'Nie ma publicznego adresu WAN do skanowania.');
        return;
      }
      start(probe);
    }, 800 / speed);
    return () => clearTimeout(timer);
  }, [random, flight, network, start, notify, sequence, speed]);
  function stop() {
    busy.current = false;
    setRandom(false);
    setFlight(null);
    setLogs((l) =>
      l.map((log) =>
        log.status === 'pending' ? { ...log, status: 'cancelled', reached: hop } : log,
      ),
    );
  }
  return {
    logs,
    active: logs.find((l) => l.id === activeId),
    flight,
    hop,
    random,
    setRandom,
    speed,
    changeSpeed,
    start,
    stop,
    invalidate: () => {
      stop();
      setActiveId(null);
    },
    inspect: (id: string) => {
      if (!busy.current) setActiveId(id);
    },
    clear: () => {
      if (!busy.current) {
        setLogs([]);
        setActiveId(null);
      }
    },
  };
}
