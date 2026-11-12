import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { networkExamples } from '../examples/catalog';
import { parseNetwork } from '../model/network';
import { simulateNetwork as simulate } from '../simulation/networkEngine';
import {
  flightDuration,
  flightElapsed,
  flightFrame,
  retimeFlight,
  type Flight,
} from '../simulation/simulationTiming';
describe('demo wireless isolation', () => {
  it('leases independent staff and guest subnets through their APs', () => {
    const network = createDemoNetwork();
    for (const [id, vlan] of [
      ['demo-staff-client', 40],
      ['demo-guest-client', 50],
    ] as const) {
      const client = network.devices.find((d) => d.id === id)!;
      expect(client.lease?.vlan).toBe(vlan);
      expect(client.ip).toMatch(new RegExp(`^192\\.168\\.${vlan}\\.`));
    }
    expect(network.devices.find((d) => d.id === 'demo-guest-client')?.lease?.dnsServerIds).toEqual([
      'demo-guest-dns',
    ]);
  });
  it.each([
    'demo-pc',
    'demo-dns',
    'demo-hyperv',
    'demo-camera1',
    'demo-staff-ap',
    'demo-firewall',
    'demo-router',
  ])('blocks guest access to %s with an ACL rather than missing connectivity', (destination) => {
    const result = simulate(createDemoNetwork(), {
      source: 'demo-guest-client',
      destination,
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    });
    expect(result.ok).toBe(false);
    expect(result.steps.join(' ')).toContain('ACL');
  });
  it('does not publish internal DNS zones to guests', () => {
    const result = simulate(createDemoNetwork(), {
      source: 'demo-guest-client',
      destination: 'npm.lab.home.arpa',
      protocol: 'TCP',
      port: 443,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('NXDOMAIN');
    expect(result.dns?.serverId).toBe('demo-guest-dns');
  });
  it('does not bypass guest isolation using the public NPM mapping', () => {
    expect(
      simulate(createDemoNetwork(), {
        source: 'demo-guest-client',
        destination: '203.0.113.10',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      }).ok,
    ).toBe(false);
  });
  it('creates independent, importable projects from the example registry', () => {
    const first = networkExamples[0].create();
    const second = networkExamples[0].create();
    first.devices[0].online = false;
    expect(second.devices[0].online).toBe(true);
    expect(parseNetwork(JSON.stringify(second)).devices).toHaveLength(22);
  });
});
describe('live animation speed', () => {
  function flight(): Flight {
    const network = createDemoNetwork();
    return {
      id: 'flight',
      startedAt: 100,
      elapsed: 0,
      speed: 1,
      route: network.devices.slice(0, 3),
      result: { ok: true, path: [], reason: '', steps: [] },
    };
  }
  it('preserves packet position when speed changes midway through a hop', () => {
    const before = flight();
    const after = retimeFlight(before, 5, 800);
    expect(flightElapsed(before, 800)).toBe(flightElapsed(after, 800));
    expect(flightFrame(flightElapsed(before, 800), before.route)).toEqual(
      flightFrame(flightElapsed(after, 800), after.route),
    );
    expect(flightElapsed(after, 1000)).toBe(1700);
  });
  it('keeps cumulative progress when slowing down after acceleration', () => {
    const faster = retimeFlight(flight(), 5, 800);
    const slower = retimeFlight(faster, 0.5, 1000);
    expect(flightElapsed(slower, 1200)).toBe(1800);
    expect(slower.id).toBe(faster.id);
    expect(slower.result).toBe(faster.result);
  });
  it('reaches the final position at the same logical completion time at every speed', () => {
    for (const speed of [0.5, 1, 2, 5]) {
      const current = retimeFlight(flight(), speed, 100);
      const end = 100 + flightDuration(current.route.length) / speed;
      expect(flightElapsed(current, end)).toBeCloseTo(flightDuration(current.route.length));
      expect(flightFrame(flightElapsed(current, end), current.route)).toEqual({
        x: current.route.at(-1)!.x,
        y: current.route.at(-1)!.y,
      });
    }
  });
});
