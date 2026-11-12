import { describe, expect, it } from 'vitest';
import { example } from './fixtures/legacyNetwork';
import { parseNetwork, validIp } from '../model/network';
import { simulateNetwork as simulate } from '../simulation/networkEngine';
import type { Probe } from '../model/networkTypes';
const ping: Probe = { source: 'pc1', destination: 'web', protocol: 'ICMP', port: 443 };
describe('network simulation', () => {
  it('routes between VLANs through a firewall', () => {
    const r = simulate(example, ping);
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['pc1', 'sw', 'fw', 'sv', 'web']);
  });
  it('blocks SSH at the firewall', () => {
    const r = simulate(example, { ...ping, protocol: 'TCP', port: 22 });
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('fw');
    expect(r.reason).toContain('22');
  });
  it('allows HTTPS via an explicit rule', () =>
    expect(simulate(example, { ...ping, protocol: 'TCP', port: 443 }).ok).toBe(true));
  it('stops when a required device is offline', () => {
    const n = structuredClone(example);
    n.devices.find((d) => d.id === 'fw')!.online = false;
    expect(simulate(n, ping).ok).toBe(false);
  });
  it('does not forward through application servers', () => {
    const n = structuredClone(example);
    n.links = n.links.filter((l) => l.b !== 'db');
    n.links.push({ id: 'web-db', a: 'web', b: 'db' });
    expect(simulate(n, { ...ping, destination: 'db' }).ok).toBe(false);
  });
  it('isolates VLANs without a routing device', () => {
    const n = structuredClone(example);
    n.devices.find((d) => d.id === 'pc2')!.vlan = 30;
    n.devices.find((d) => d.id === 'pc2')!.ipMode = 'static';
    const r = simulate(n, { ...ping, destination: 'pc2' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('VLAN');
  });
  it('uses the first matching firewall rule and source IP', () => {
    const n = structuredClone(example);
    n.devices
      .find((d) => d.id === 'fw')!
      .rules.unshift({
        id: 'block',
        action: 'deny',
        protocol: 'ANY',
        port: '*',
        source: '10.0.10.11',
        destination: '*',
      });
    expect(simulate(n, ping).ok).toBe(false);
    expect(simulate(n, { ...ping, source: 'pc2' }).ok).toBe(true);
  });
  it('rejects same-source and missing-source probes', () => {
    expect(simulate(example, { ...ping, destination: 'pc1' }).ok).toBe(false);
    expect(simulate(example, { ...ping, source: 'missing' }).ok).toBe(false);
  });
});
describe('project import', () => {
  it('round trips the project', () =>
    expect(parseNetwork(JSON.stringify(example))).toEqual(example));
  it('rejects unknown device types and dangling links', () => {
    const n = structuredClone(example);
    n.links[0].b = 'missing';
    expect(() => parseNetwork(JSON.stringify(n))).toThrow();
  });
  it('validates IP addresses', () => {
    expect(validIp('10.0.0.255')).toBe(true);
    expect(validIp('256.0.0.1')).toBe(false);
    expect(validIp('10.0.1')).toBe(false);
  });
});
