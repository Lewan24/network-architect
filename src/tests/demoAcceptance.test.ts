import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { diagnoseNetwork } from '../model/diagnostics';
import { hardwareState, portFor } from '../model/ports';
import { simulateNetwork } from '../simulation/networkEngine';
import { networkAreaPolygon } from '../canvas/networkAreas';
import type { Network, Probe } from '../model/networkTypes';
const get = (n: Network, id: string) => n.devices.find((d) => d.id === id)!;
const test = (
  network: Network,
  source: string,
  destination: string,
  port = 443,
  protocol: Probe['protocol'] = 'TCP',
) => simulateNetwork(network, { source, destination, port, protocol, checkReply: true });
const employees = ['demo-laptop', 'demo-staff-client'];
const cameras = ['demo-camera1', 'demo-camera2'];

describe('demo operational acceptance', () => {
  it('has valid hardware, no diagnostic issues and correct leases on every client', () => {
    const n = createDemoNetwork();
    expect(diagnoseNetwork(n)).toEqual([]);
    expect([...hardwareState(n).links.values()].every((l) => l.up)).toBe(true);
    for (const [id, vlan] of [
      ['demo-pc', 10],
      ['demo-laptop', 40],
      ['demo-staff-client', 40],
      ['demo-guest-client', 50],
      ['demo-camera1', 30],
      ['demo-camera2', 30],
    ] as const) {
      expect(get(n, id).lease?.vlan, id).toBe(vlan);
      expect(get(n, id).ip).toMatch(new RegExp(`^192\\.168\\.${vlan}\\.`));
    }
    expect(get(n, 'demo-printer')).toMatchObject({
      ipMode: 'static',
      vlan: 60,
      ip: '192.168.60.20',
    });
  });
  it.each(employees)(
    '%s prints by DNS name over IPP and RAW with a working return route',
    (source) => {
      const n = createDemoNetwork();
      for (const port of [631, 9100]) {
        const result = test(n, source, 'drukarka.lab.home.arpa', port);
        expect(result.ok, result.reason).toBe(true);
        expect(result.path).toContain('demo-firewall');
        expect(result.path.at(-1)).toBe('demo-printer');
        expect(result.returnPath?.at(-1)).toBe(source);
        expect(result.dns?.address).toBe('192.168.60.20');
      }
    },
  );
  it.each(employees)(
    '%s can use approved services and Internet, but not device administration or CCTV',
    (source) => {
      const n = createDemoNetwork();
      for (const [target, port] of [
        ['demo-docker', 443],
        ['demo-app', 3000],
        ['demo-nas', 445],
        ['demo-nvr', 443],
      ] as const) {
        const result = test(n, source, target, port);
        expect(result.ok, result.reason).toBe(true);
      }
      expect(test(n, source, 'internet-default', 0, 'ICMP').ok).toBe(true);
      for (const [target, port] of [
        ['demo-printer', 443],
        ['demo-docker', 81],
        ['demo-hyperv', 443],
        ['demo-camera1', 554],
        ['demo-camera2', 443],
      ] as const) {
        const result = test(n, source, target, port);
        expect(result.ok, `${target}:${port}`).toBe(false);
        expect(result.path.at(-1)).toBe('demo-firewall');
        expect(result.reason).toContain('staff-private');
      }
    },
  );
  it.each([
    'demo-printer',
    'demo-camera1',
    'demo-camera2',
    'demo-nvr',
    'demo-dns',
    'demo-pc',
    'demo-laptop',
  ])('blocks a guest from %s at the firewall', (target) => {
    const result = test(
      createDemoNetwork(),
      'demo-guest-client',
      target,
      target === 'demo-printer' ? 631 : 443,
    );
    expect(result.ok).toBe(false);
    expect(result.path.at(-1)).toBe('demo-firewall');
    expect(result.reason).toContain('guest-private');
  });
  it.each(cameras)('powers %s by PoE and permits NVR RTSP including the reply', (camera) => {
    const n = createDemoNetwork();
    const hw = hardwareState(n);
    expect(get(n, camera)).toMatchObject({ powerSource: 'poe', powerWatts: 12 });
    expect(hw.powered.get(camera)).toBe(true);
    const result = test(n, 'demo-nvr', camera, 554);
    expect(result.ok, result.reason).toBe(true);
    expect(result.path).toContain('demo-camera-switch');
    expect(result.path).toContain('demo-firewall');
    expect(result.returnPath?.at(-1)).toBe('demo-nvr');
    expect(result.bottleneckMbps).toBe(100);
    // A reply is allowed, but a new camera-initiated session is not.
    expect(test(n, camera, 'demo-nvr', 443).ok).toBe(false);
    for (const protocol of ['UDP', 'TCP'] as const)
      expect(test(n, camera, 'demo-dns', 53, protocol).ok).toBe(true);
    for (const target of ['demo-printer', 'demo-docker', 'internet-default']) {
      const blocked = test(n, camera, target, target === 'demo-printer' ? 631 : 443);
      expect(blocked.ok).toBe(false);
      expect(blocked.path.at(-1)).toBe('demo-firewall');
    }
  });
  it('limits direct camera access to NVR/admin rather than the whole server VLAN', () => {
    const n = createDemoNetwork();
    for (const source of ['demo-docker', 'demo-app', 'demo-nas', 'demo-dns'])
      for (const camera of cameras) {
        const r = test(n, source, camera, 554);
        expect(r.ok, r.reason).toBe(false);
        expect(r.reason).toContain('server-private');
      }
    for (const camera of cameras) expect(test(n, 'demo-pc', camera, 443).ok).toBe(true);
    expect(test(n, 'demo-pc', 'demo-printer', 443).ok).toBe(true);
  });
  it('keeps printers from initiating into employee networks or the Internet', () => {
    const n = createDemoNetwork();
    for (const target of ['demo-staff-client', 'demo-pc', 'demo-camera1', 'internet-default'])
      expect(test(n, 'demo-printer', target, 0, 'ICMP').ok).toBe(false);
    expect(test(n, 'demo-printer', 'demo-dns', 53, 'UDP').ok).toBe(true);
    expect(test(n, 'demo-printer', 'demo-dns', 53, 'TCP').ok).toBe(true);
  });
  it('uses an actual two-ended office trunk and compatible SR optics to CCTV', () => {
    const n = createDemoNetwork();
    const office = n.links.find((l) => l.a === 'demo-firewall' && l.b === 'demo-lan-switch')!;
    for (const side of ['a', 'b'] as const)
      expect(portFor(n, office, side)).toMatchObject({
        mode: 'trunk',
        nativeVlan: 10,
        allowedVlans: [10, 40, 60],
      });
    const fiber = n.links.find((l) => l.b === 'demo-camera-switch')!;
    expect(fiber).toMatchObject({ a: 'demo-server-switch', cable: 'om3', lengthMeters: 35 });
    expect(hardwareState(n).links.get(fiber.id)).toMatchObject({ up: true, speedMbps: 10000 });
    for (const side of ['a', 'b'] as const) expect(portFor(n, fiber, side)?.module).toBe('10g-sr');
  });
  it('loses one camera on budget exhaustion and recovers when capacity is restored', () => {
    const n = createDemoNetwork();
    const pse = get(n, 'demo-camera-switch');
    expect(hardwareState(n).poe.get(pse.id)).toMatchObject({ budget: 60, allocated: 30.8 });
    pse.poeBudgetWatts = 15.4;
    expect(hardwareState(n).powered.get('demo-camera1')).toBe(true);
    expect(hardwareState(n).powered.get('demo-camera2')).toBe(false);
    expect(test(n, 'demo-nvr', 'demo-camera1', 554).ok).toBe(true);
    expect(test(n, 'demo-nvr', 'demo-camera2', 554).ok).toBe(false);
    pse.poeBudgetWatts = 60;
    expect(test(n, 'demo-nvr', 'demo-camera2', 554).ok).toBe(true);
  });
  it('distinguishes an interrupted optical uplink from PoE and leaves employee printing working', () => {
    const n = createDemoNetwork();
    const fiber = n.links.find((l) => l.cable === 'om3')!;
    portFor(n, fiber, 'b')!.enabled = false;
    const hw = hardwareState(n);
    expect(hw.powered.get('demo-camera1')).toBe(true);
    expect(hw.links.get(fiber.id)?.up).toBe(false);
    expect(test(n, 'demo-nvr', 'demo-camera1', 554).ok).toBe(false);
    expect(test(n, 'demo-laptop', 'demo-printer', 631).ok).toBe(true);
  });
});

describe('demo layout', () => {
  it('keeps device hit areas and labels separate', () => {
    const n = createDemoNetwork();
    for (let i = 0; i < n.devices.length; i++)
      for (const b of n.devices.slice(i + 1)) {
        const a = n.devices[i];
        const half = (d: typeof a) => Math.max(58, d.name.length * 3.6);
        expect(
          Math.abs(a.x - b.x) >= half(a) + half(b) + 4 || Math.abs(a.y - b.y) >= 182,
          `${a.name} overlaps ${b.name}`,
        ).toBe(true);
      }
  });
  it('keeps VLAN area polygons from overlapping', () => {
    const n = createDemoNetwork();
    const groups = n.vlans.map((v) => ({
      id: v.id,
      polygon: networkAreaPolygon(n.devices.filter((d) => d.vlan === v.id)),
    }));
    for (let i = 0; i < groups.length; i++)
      for (const b of groups.slice(i + 1)) {
        const a = groups[i];
        const separated = [a.polygon, b.polygon].some((polygon) =>
          polygon.some((p, j) => {
            const q = polygon[(j + 1) % polygon.length],
              axis = { x: q.y - p.y, y: p.x - q.x };
            const project = (poly: typeof polygon) =>
              poly.map((point) => point.x * axis.x + point.y * axis.y);
            const left = project(a.polygon),
              right = project(b.polygon);
            return (
              Math.max(...left) <= Math.min(...right) || Math.max(...right) <= Math.min(...left)
            );
          }),
        );
        expect(separated, `VLAN ${a.id} overlaps VLAN ${b.id}`).toBe(true);
      }
  });
});
