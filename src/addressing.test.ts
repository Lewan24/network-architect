import { describe, expect, it } from 'vitest';
import { example } from './fixtures/legacyNetwork';
import { allocateIp, applyVlans, hostInVlan, parseNetwork, subnet, validateVlans } from './network';
import type { Network, Vlan } from './networkTypes';
const vlan: Vlan = {
  id: 30,
  name: 'Laboratorium',
  cidr: '172.16.0.128/29',
  gateway: '172.16.0.129',
  color: '#839bbf',
};
function empty(): Network {
  return { name: 'Test', devices: [], links: [], vlans: [{ ...vlan }] };
}
describe('VLAN address pools', () => {
  it('allocates from CIDR boundaries and reserves the gateway', () =>
    expect(allocateIp(empty(), 30)).toBe('172.16.0.130'));
  it('normalizes a CIDR that contains a host address', () =>
    expect(subnet('172.16.0.133/29').canonical).toBe('172.16.0.128/29'));
  it('excludes network and broadcast addresses', () => {
    expect(hostInVlan('172.16.0.128', vlan)).toBe(false);
    expect(hostInVlan('172.16.0.135', vlan)).toBe(false);
    expect(hostInVlan('172.16.0.134', vlan)).toBe(true);
  });
  it('avoids addresses already used by static devices', () => {
    const net = empty();
    net.devices.push({ ...example.devices[0], ip: '172.16.0.130', ipMode: 'static' });
    expect(allocateIp(net, 30)).toBe('172.16.0.131');
  });
  it('keeps an existing device address when it remains valid', () =>
    expect(allocateIp(example, 10, 'pc1')).toBe('10.0.10.11'));
  it('replaces a gateway address when switching to automatic addressing', () => {
    const n = structuredClone(example);
    n.devices.find((d) => d.id === 'sw')!.ip = '10.0.10.1';
    expect(allocateIp(n, 10, 'sw')).toBe('10.0.10.3');
  });
  it('reports pool exhaustion without reusing a host address', () => {
    const net = empty();
    net.vlans[0] = { ...vlan, cidr: '172.16.0.128/30' };
    net.devices.push({ ...example.devices[0], ip: '172.16.0.130' });
    expect(() => allocateIp(net, 30)).toThrow('Brak wolnych adresów');
  });
  it('rejects overlapping VLAN subnets', () =>
    expect(() => validateVlans([vlan, { ...vlan, id: 40, cidr: '172.16.0.128/28' }])).toThrow(
      'nakładać',
    ));
  it('rejects duplicate IDs, invalid masks and invalid gateways', () => {
    expect(() => validateVlans([vlan, { ...vlan }])).toThrow('unikalne');
    expect(() => subnet('10.0.0.0/33')).toThrow();
    expect(() => validateVlans([{ ...vlan, gateway: '172.16.1.1' }])).toThrow('Brama');
  });
  it('rejects removing a VLAN while devices reference it', () =>
    expect(() =>
      applyVlans(
        example,
        example.vlans.filter((v) => v.id !== 10),
      ),
    ).toThrow('jest używany'));
  it('readdresses automatic devices atomically after a subnet change', () => {
    const net = structuredClone(example);
    net.devices = net.devices.map((d) => (d.vlan === 10 ? { ...d, ipMode: 'auto' } : d));
    const next = applyVlans(
      net,
      net.vlans.map((v) =>
        v.id === 10
          ? {
              ...v,
              cidr: '10.2.0.0/24',
              gateway: '10.2.0.1',
              dhcpStart: '10.2.0.2',
              dhcpEnd: '10.2.0.253',
            }
          : v,
      ),
    );
    const hosts = next.devices.filter((d) => d.vlan === 10);
    expect(hosts.every((d) => d.ip.startsWith('10.2.0.'))).toBe(true);
    expect(new Set(hosts.map((d) => d.ip)).size).toBe(hosts.length);
    expect(hosts.some((d) => d.ip === '10.2.0.1')).toBe(false);
    expect(net.devices.find((d) => d.id === 'pc1')!.ip).toBe('10.0.10.11');
  });
  it('preserves static IPs and prevents silently moving them outside a subnet', () => {
    const next = applyVlans(
      example,
      example.vlans.map((v) => ({ ...v, name: v.name + ' nowa' })),
    );
    expect(next.devices.find((d) => d.id === 'web')!.ip).toBe('10.0.20.10');
    expect(() =>
      applyVlans(
        example,
        example.vlans.map((v) =>
          v.id === 20
            ? {
                ...v,
                cidr: '10.3.0.0/24',
                gateway: '10.3.0.1',
                dhcpStart: '10.3.0.2',
                dhcpEnd: '10.3.0.253',
              }
            : v,
        ),
      ),
    ).toThrow('Statyczny IP');
  });
});
describe('project migration', () => {
  it('loads legacy projects without changing existing IPs', () => {
    const old = {
      name: example.name,
      links: example.links,
      devices: example.devices.map(({ ipMode, ...d }) => d),
    };
    const migrated = parseNetwork(JSON.stringify(old));
    expect(migrated.vlans.map((v) => v.id)).toEqual([10, 20]);
    expect(migrated.devices.map((d) => d.ip)).toEqual(example.devices.map((d) => d.ip));
    expect(migrated.devices.every((d) => d.ipMode === 'static')).toBe(true);
  });
  it('round trips automatic addressing and VLAN pool settings', () =>
    expect(parseNetwork(JSON.stringify(example))).toEqual(example));
  it('rejects a reference to an undefined VLAN', () => {
    const net = structuredClone(example);
    net.devices[0].vlan = 999;
    expect(() => parseNetwork(JSON.stringify(net))).toThrow('nieistniejącego');
  });
});
