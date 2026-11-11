import { describe, expect, it } from 'vitest';
import { createDemoNetwork, demoScenarios } from './demoNetwork';
import { reconcileDhcp } from './dhcp';
import {
  blankProject,
  connectInternet,
  internetConnection,
  internetTargets,
  prepareInternet,
} from './internetModel';
import { internetProbe } from './internetTraffic';
import { parseNetwork, tracePath } from './network';
import { simulateNetwork as simulate } from './networkEngine';
import { moveNetworkGroup } from './networkGroups';
import type { Device, Network } from './networkTypes';
const get = (n: Network, id: string) => n.devices.find((d) => d.id === id)!;
describe('default Internet and public edge', () => {
  it('leaves one static Internet source in an otherwise empty project', () => {
    const n = blankProject();
    expect(n.devices).toHaveLength(1);
    expect(n.devices[0]).toMatchObject({ kind: 'internet', ip: '203.0.113.1', ipMode: 'static' });
    expect(n.links).toEqual([]);
    expect(internetConnection(n).error).toContain('odłączony');
  });
  it('adds a missing default Internet without replacing existing devices', () => {
    const n = createDemoNetwork();
    n.devices = n.devices.filter((d) => d.kind !== 'internet');
    n.links = n.links.filter((l) => !l.a.startsWith('internet') && !l.b.startsWith('internet'));
    const prepared = prepareInternet(n);
    expect(prepared.devices.filter((d) => d.kind === 'internet')).toHaveLength(1);
    expect(prepared.devices.some((d) => d.id === 'demo-docker')).toBe(true);
  });
  it('makes an attached router an edge and assigns a distinct public WAN', () => {
    let n = blankProject();
    const d: Device = {
      id: 'new-router',
      name: 'Router',
      kind: 'router',
      ip: '10.255.0.1',
      ipMode: 'static',
      vlan: 0,
      x: 0,
      y: 0,
      online: true,
      rules: [],
      defaultAcl: 'deny',
      edgeRole: 'internal',
    };
    n = { ...n, devices: [...n.devices, d] };
    const connected = connectInternet(n, n.devices[0].id, d.id, 'wan');
    expect(internetConnection(connected).error).toBe('');
    expect(get(connected, d.id).edgeRole).toBe('edge');
    expect(get(connected, d.id).wanIp).toBe('203.0.113.10');
    expect(internetProbe(connected, () => 0.1)?.destination).toBe('203.0.113.10');
  });
  it('does not report a missing Internet when the actual problem is a missing WAN', () => {
    const n = createDemoNetwork();
    get(n, 'demo-router').wanIp = '';
    get(n, 'demo-router').portForwards = [];
    expect(internetConnection(n).error).toContain('publicznego WAN');
    expect(internetConnection(n).internet?.kind).toBe('internet');
  });
  it('allows only one physical neighbor and requires a router or firewall', () => {
    const n = createDemoNetwork();
    const wan = get(n, 'internet-default');
    expect(() => connectInternet(n, wan.id, 'demo-firewall', 'extra')).toThrow('już');
    const blank = blankProject();
    blank.devices.push({ ...get(n, 'demo-pc'), id: 'pc' });
    expect(() => connectInternet(blank, blank.devices[0].id, 'pc', 'bad')).toThrow('a nie');
  });
  it('scans the first edge rather than any unrelated WAN object in the inventory', () => {
    const n = createDemoNetwork();
    n.devices.push({ ...get(n, 'demo-router'), id: 'unrelated', wanIp: '198.51.100.99' });
    expect(internetTargets(n)).toEqual(['203.0.113.10']);
    for (let i = 0; i < 30; i++) expect(internetProbe(n)?.destination).toBe('203.0.113.10');
  });
  it('distinguishes offline, disconnected and ambiguous Internet connections', () => {
    const n = createDemoNetwork();
    get(n, 'internet-default').online = false;
    expect(internetConnection(n).error).toContain('wyłączony');
    get(n, 'internet-default').online = true;
    n.links.push({ id: 'duplicate-wan', a: 'internet-default', b: 'demo-firewall' });
    expect(internetConnection(n).error).toContain('dokładnie jedno');
  });
});
describe('network section translation', () => {
  it('moves every member with one common delta without changing other VLANs or logical settings', () => {
    const n = createDemoNetwork();
    const before = structuredClone(n);
    const moved = moveNetworkGroup(n, 20, { x: 170, y: -90 });
    for (const d of n.devices) {
      const next = get(moved, d.id);
      expect(next.x).toBe(d.x + (d.vlan === 20 ? 170 : 0));
      expect(next.y).toBe(d.y + (d.vlan === 20 ? -90 : 0));
      expect(next.ip).toBe(d.ip);
    }
    expect(moved.links).toEqual(n.links);
    expect(moved.vlans).toEqual(n.vlans);
    expect(n).toEqual(before);
  });
  it('preserves hypervisor/VM offsets and permits restoring the entire group as one operation', () => {
    const n = createDemoNetwork();
    const moved = moveNetworkGroup(n, 20, { x: -120, y: 75 });
    const a = get(n, 'demo-docker');
    const b = get(n, 'demo-hyperv');
    const ma = get(moved, a.id);
    const mb = get(moved, b.id);
    expect(ma.x - mb.x).toBe(a.x - b.x);
    expect(ma.y - mb.y).toBe(a.y - b.y);
    expect(moveNetworkGroup(moved, 20, { x: 120, y: -75 })).toEqual(n);
  });
  it('does not move cameras when moving the server group', () => {
    const n = createDemoNetwork();
    expect(get(moveNetworkGroup(n, 20, { x: 100, y: 100 }), 'demo-camera1')).toEqual(
      get(n, 'demo-camera1'),
    );
  });
});
describe('demonstration laboratory', () => {
  it('round trips DNS, camera, Hyper-V and WAN configuration in JSON', () => {
    const n = createDemoNetwork();
    expect(parseNetwork(JSON.stringify(n))).toEqual(n);
    expect(get(n, 'demo-hyperv').hypervisorVendor).toBe('Hyper-V');
    expect(get(n, 'demo-camera1').lease?.dnsServerIds).toEqual(['demo-dns']);
    expect(internetConnection(n).edge?.id).toBe('demo-router');
  });
  for (const test of demoScenarios)
    it(test.label, () => {
      const n = createDemoNetwork();
      const r = simulate(n, test.probe);
      expect(r.ok, r.reason).toBe(test.expected);
      if (test.expected) expect(r.steps.length).toBe(tracePath(r).length);
    });
});
describe('DNS-based communication', () => {
  const probe = {
    source: 'demo-pc',
    destination: 'npm.lab.home.arpa',
    protocol: 'TCP' as const,
    port: 443,
    checkReply: true,
  };
  it('queries DNS through the network before sending application traffic', () => {
    const r = simulate(createDemoNetwork(), probe);
    expect(r.ok, r.reason).toBe(true);
    expect(r.dns).toMatchObject({
      ok: true,
      name: probe.destination,
      address: '192.168.20.20',
      serverId: 'demo-dns',
    });
    expect(r.dns?.queryPath).toContain('demo-dns');
    expect(r.path.at(-1)).toBe('demo-docker');
    expect(tracePath(r).at(-1)).toBe('demo-pc');
  });
  it('does not resolve names magically when no resolver is configured', () => {
    const n = createDemoNetwork();
    get(n, 'demo-pc').dnsServerIds = [];
    const r = simulate(n, probe);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('nie ma resolvera');
  });
  it('requires DNS port 53 and a working route, including ACL permissions', () => {
    const n = createDemoNetwork();
    get(n, 'demo-dns').services = [];
    expect(simulate(n, probe).ok).toBe(false);
    const other = createDemoNetwork();
    get(other, 'demo-firewall').rules = get(other, 'demo-firewall').rules.filter(
      (r) => r.id !== 'admin-lan',
    );
    const r = simulate(other, probe);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('DNS');
  });
  it('returns NXDOMAIN for an unknown name instead of looking up device labels', () => {
    const r = simulate(createDemoNetwork(), {
      ...probe,
      destination: 'nie-istnieje.lab.home.arpa',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('NXDOMAIN');
  });
  it('handles DNS names case-insensitively with an optional final dot', () =>
    expect(simulate(createDemoNetwork(), { ...probe, destination: 'NPM.LAB.HOME.ARPA.' }).ok).toBe(
      true,
    ));
  it('keeps application ACL independent of a successful DNS lookup', () => {
    const r = simulate(createDemoNetwork(), { ...probe, source: 'demo-camera1' });
    expect(r.dns?.ok).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('demo-firewall');
  });
  it('resolves device-linked camera records to their current DHCP lease', () => {
    const n = createDemoNetwork();
    const ip = get(n, 'demo-camera1').ip;
    const r = simulate(n, {
      source: 'demo-nvr',
      destination: 'kamera1.lab.home.arpa',
      protocol: 'TCP',
      port: 554,
      checkReply: true,
    });
    expect(r.dns?.address).toBe(ip);
    expect(r.ok, r.reason).toBe(true);
  });
  it('keeps DNS options from a valid lease until explicit renewal', () => {
    const n = createDemoNetwork();
    const pc = get(n, 'demo-pc');
    n.vlans.find((v) => v.id === 10)!.dnsServerIds = [];
    expect(pc.lease?.dnsServerIds).toEqual(['demo-dns']);
    expect(simulate(n, probe).ok).toBe(true);
    const renewed = reconcileDhcp(n, Date.now(), pc.id);
    expect(get(renewed, pc.id).lease?.dnsServerIds).toEqual([]);
    expect(simulate(renewed, probe).ok).toBe(false);
  });
});
