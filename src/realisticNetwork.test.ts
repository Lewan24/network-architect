import { describe, expect, it } from 'vitest';
import { dhcpStatus, discoverDhcp, reconcileDhcp } from './dhcp';
import { internetProbe } from './internetTraffic';
import {
  matchesAclAddress,
  parseNetwork,
  publicAddresses,
  tracePath,
  validateNetworkServices,
  validateVlans,
} from './network';
import { simulateNetwork as simulate } from './networkEngine';
import type { Device, Network, Probe } from './networkTypes';
function node(id: string, kind: Device['kind'], ip: string, vlan: number): Device {
  return { id, kind, name: id, ip, vlan, ipMode: 'static', online: true, x: 0, y: 0, rules: [] };
}
function lab(): Network {
  return {
    name: 'Realistic lab',
    vlans: [
      {
        id: 1,
        name: 'LAN',
        cidr: '192.168.0.0/24',
        gateway: '192.168.0.1',
        gatewayDeviceId: 'edge',
        color: '#718fae',
        dhcpEnabled: true,
        dhcpServerId: 'edge',
        dhcpStart: '192.168.0.100',
        dhcpEnd: '192.168.0.102',
        leaseMinutes: 2,
      },
      {
        id: 10,
        name: 'VLAN 10',
        cidr: '192.168.10.0/24',
        gateway: '192.168.10.1',
        gatewayDeviceId: 'edge',
        color: '#6b9e99',
        dhcpEnabled: true,
        dhcpServerId: 'edge',
        dhcpStart: '192.168.10.100',
        dhcpEnd: '192.168.10.110',
        leaseMinutes: 2,
      },
    ],
    devices: [
      node('internet', 'internet', '198.51.100.200', 0),
      {
        ...node('edge', 'gateway', '192.168.0.1', 1),
        wanIp: '203.0.113.10',
        outboundNat: true,
        defaultAcl: 'deny',
        rules: [
          {
            id: 'lan',
            action: 'allow',
            protocol: 'ANY',
            port: '*',
            source: 'vlan:1',
            destination: '*',
            ingress: 'lan',
          },
          {
            id: 'https',
            action: 'allow',
            protocol: 'TCP',
            port: '443',
            source: '*',
            destination: 'device:server',
            ingress: 'wan',
          },
        ],
        portForwards: [
          {
            id: 'https',
            externalIp: '203.0.113.10',
            externalPort: 443,
            protocol: 'TCP',
            internalIp: '192.168.0.10',
            internalPort: 443,
            enabled: true,
          },
        ],
      },
      { ...node('sw', 'switch', '192.168.0.2', 1), allowedVlans: [1, 10] },
      { ...node('client', 'workstation', '', 1), ipMode: 'auto' },
      { ...node('laptop', 'workstation', '', 10), ipMode: 'auto' },
      {
        ...node('server', 'server', '192.168.0.10', 1),
        services: [{ id: 'https', name: 'HTTPS', protocol: 'TCP', port: 443, enabled: true }],
      },
    ],
    links: [
      { id: 'wan', a: 'internet', b: 'edge', mode: 'auto' },
      { id: 'trunk', a: 'edge', b: 'sw', mode: 'trunk', allowedVlans: [1, 10] },
      { id: 'pc', a: 'sw', b: 'client', mode: 'access', accessVlan: 1 },
      { id: 'wifi-client', a: 'sw', b: 'laptop', mode: 'access', accessVlan: 10 },
      { id: 'srv', a: 'sw', b: 'server', mode: 'access', accessVlan: 1 },
    ],
  };
}
const incoming: Probe = {
  source: 'internet',
  destination: '203.0.113.10',
  protocol: 'TCP',
  port: 443,
  checkReply: true,
};
const get = (n: Network, id: string) => n.devices.find((d) => d.id === id)!;
describe('DHCP exchange and lease lifecycle', () => {
  it('binds clients to the correct subnet through a managed L2 trunk', () => {
    const n = reconcileDhcp(lab());
    expect(get(n, 'client').ip).toBe('192.168.0.100');
    expect(get(n, 'laptop').ip).toBe('192.168.10.100');
    expect(get(n, 'client').lease?.serverId).toBe('edge');
    expect(discoverDhcp(n, get(n, 'client')).path).toEqual(['client', 'sw', 'edge']);
  });
  it('does not assign an address merely because a VLAN exists', () => {
    const n = lab();
    n.vlans[0].dhcpEnabled = false;
    const resolved = reconcileDhcp(n);
    expect(get(resolved, 'client').ip).toBe('');
    expect(get(resolved, 'client').lease).toBeUndefined();
    expect(dhcpStatus(resolved, get(resolved, 'client')).message).toContain('wyłączone');
  });
  it('requires an active server and working L2 connectivity for a new lease', () => {
    const n = lab();
    get(n, 'edge').online = false;
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
    get(n, 'edge').online = true;
    n.links = n.links.filter((l) => l.id !== 'trunk');
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
  });
  it('honors access VLAN and allowed trunk VLANs during DHCP discovery', () => {
    const n = lab();
    n.links.find((l) => l.id === 'pc')!.accessVlan = 10;
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
    const other = lab();
    other.links.find((l) => l.id === 'trunk')!.allowedVlans = [1];
    expect(get(reconcileDhcp(other), 'laptop').ip).toBe('');
    expect(get(reconcileDhcp(other), 'client').ip).not.toBe('');
  });
  it('retains a valid lease during a DHCP outage, then expires it', () => {
    const now = Date.now();
    const n = reconcileDhcp(lab(), now);
    get(n, 'edge').online = false;
    const before = reconcileDhcp(n, now + 60000);
    expect(get(before, 'client').ip).toBe('192.168.0.100');
    expect(dhcpStatus(before, get(before, 'client'), now + 60000).message).toContain(
      'pozostaje aktywna',
    );
    const after = reconcileDhcp(n, now + 120001);
    expect(get(after, 'client').ip).toBe('');
  });
  it('renews at half the lease period when the server is reachable', () => {
    const now = Date.now();
    const n = reconcileDhcp(lab(), now);
    const renewed = reconcileDhcp(n, now + 61000);
    expect(get(renewed, 'client').ip).toBe(get(n, 'client').ip);
    expect(get(renewed, 'client').lease!.obtainedAt).toBe(now + 61000);
    expect(get(n, 'client').lease!.obtainedAt).toBe(now);
  });
  it('avoids static addresses and does not invent addresses when the pool is exhausted', () => {
    const n = lab();
    n.devices.push(node('reserved', 'printer', '192.168.0.100', 1));
    for (let i = 0; i < 3; i++) {
      const id = 'pc' + i;
      n.devices.push({ ...node(id, 'workstation', '', 1), ipMode: 'auto' });
      n.links.push({ id, a: 'sw', b: id, mode: 'access', accessVlan: 1 });
    }
    const resolved = reconcileDhcp(n);
    const addresses = resolved.devices
      .filter((d) => d.ipMode === 'auto' && d.vlan === 1)
      .map((d) => d.ip);
    expect(addresses.filter(Boolean).sort()).toEqual(['192.168.0.101', '192.168.0.102']);
    expect(addresses.filter((ip) => !ip)).toHaveLength(2);
  });
  it('reserves gateway, network and broadcast addresses', () => {
    const n = lab();
    n.vlans[0].dhcpStart = '192.168.0.1';
    n.vlans[0].dhcpEnd = '192.168.0.3';
    expect(get(reconcileDhcp(n), 'client').ip).toBe('192.168.0.3');
    expect(() => validateVlans([{ ...n.vlans[0], dhcpStart: '192.168.0.0' }])).toThrow();
    expect(() => validateVlans([{ ...n.vlans[0], dhcpEnd: '192.168.0.255' }])).toThrow();
  });
  it('does not turn an unmanaged or managed L2 switch into a DHCP server', () => {
    const n = lab();
    n.vlans[0].dhcpServerId = 'sw';
    expect(() => validateNetworkServices(n)).toThrow('Switch L2');
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
  });
  it('serializes waiting clients and active leases without losing their addressing mode', () => {
    const n = reconcileDhcp(lab());
    expect(parseNetwork(JSON.stringify(n))).toEqual(n);
    n.vlans[0].dhcpEnabled = false;
    get(n, 'client').ip = '';
    delete get(n, 'client').lease;
    expect(parseNetwork(JSON.stringify(n)).devices.find((d) => d.id === 'client')!.ipMode).toBe(
      'auto',
    );
  });
});
describe('DHCP relay and subnet boundaries', () => {
  function remote() {
    const n = lab();
    n.devices.push(node('dhcp', 'server', '192.168.10.50', 10));
    n.links.push({ id: 'remote', a: 'sw', b: 'dhcp', mode: 'access', accessVlan: 10 });
    n.vlans[0].dhcpServerId = 'dhcp';
    return n;
  }
  it('does not forward DHCP broadcasts across a router without relay', () => {
    const n = remote();
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
    expect(discoverDhcp(n, get(n, 'client')).message).toContain('relay');
  });
  it('uses relay and validates a bidirectional UDP/67 path', () => {
    const n = remote();
    n.vlans[0].relayDeviceId = 'edge';
    const resolved = reconcileDhcp(n);
    expect(get(resolved, 'client').ip).toBe('192.168.0.100');
    expect(discoverDhcp(resolved, get(resolved, 'client')).message).toContain('relay');
  });
  it('rejects a layer-2 relay and unreachable relay', () => {
    const n = remote();
    n.vlans[0].relayDeviceId = 'sw';
    expect(() => validateNetworkServices(n)).toThrow('Relay');
    n.vlans[0].relayDeviceId = 'edge';
    get(n, 'edge').online = false;
    expect(get(reconcileDhcp(n), 'client').ip).toBe('');
  });
});
describe('Internet visibility, NAT and ACL references', () => {
  it('never sends Internet traffic directly to a private device ID or address', () => {
    for (const destination of ['server', '192.168.0.10', 'client', '192.168.0.100']) {
      const result = simulate(lab(), { ...incoming, destination });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('publicznym');
      expect(result.path).toEqual(['internet', 'edge']);
    }
  });
  it('scans only public WAN addresses and varies ports without inspecting the private inventory', () => {
    const n = lab();
    let seed = 123;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const probes = Array.from({ length: 300 }, () => internetProbe(n, rng)!);
    expect(probes.every((p) => p.destination === '203.0.113.10')).toBe(true);
    expect(new Set(probes.map((p) => p.port)).size).toBeGreaterThan(40);
    expect(
      internetProbe(
        {
          ...n,
          devices: n.devices.map((d) =>
            d.id === 'edge' ? { ...d, wanIp: '', portForwards: [] } : d,
          ),
        },
        rng,
      ),
    ).toBeNull();
  });
  it('does not treat a private configured WAN address as an Internet destination', () => {
    const n = lab();
    get(n, 'edge').wanIp = '192.168.0.99';
    get(n, 'edge').portForwards = [];
    expect(publicAddresses(n)).toEqual([]);
  });
  it('requires both DNAT and a matching WAN ACL permit', () => {
    const n = lab();
    expect(simulate(n, incoming).ok).toBe(true);
    get(n, 'edge').rules = [];
    const denied = simulate(n, incoming);
    expect(denied.ok).toBe(false);
    expect(denied.path.at(-1)).toBe('edge');
    expect(denied.reason).toContain('deny any');
  });
  it('does not expose private nodes when a public port has no mapping', () => {
    const n = lab();
    const r = simulate(n, { ...incoming, port: 3389 });
    expect(r.ok).toBe(false);
    expect(r.path).toEqual(['internet', 'edge']);
  });
  it('resolves selected devices and VLANs dynamically after DHCP allocation', () => {
    const n = reconcileDhcp(lab());
    expect(matchesAclAddress('device:client', '192.168.0.100', n)).toBe(true);
    expect(matchesAclAddress('vlan:10', '192.168.10.100', n)).toBe(true);
    expect(matchesAclAddress('vlan:10', '192.168.0.100', n)).toBe(false);
    expect(matchesAclAddress('192.168.0.0/25', '192.168.0.100', n)).toBe(true);
    n.devices.push(node('reservation', 'printer', '192.168.0.100', 1));
    delete get(n, 'client').lease;
    get(n, 'client').ip = '';
    const changed = reconcileDhcp(n);
    expect(get(changed, 'client').ip).toBe('192.168.0.101');
    expect(matchesAclAddress('device:client', '192.168.0.101', changed)).toBe(true);
    expect(matchesAclAddress('device:missing', '192.168.0.101', changed)).toBe(false);
  });
  it('applies LAN-only ACL entries only to traffic originating in the LAN', () => {
    const n = lab();
    get(n, 'edge').rules = [
      {
        id: 'lan-only',
        action: 'allow',
        protocol: 'ANY',
        port: '*',
        source: '*',
        destination: '*',
        ingress: 'lan',
      },
    ];
    expect(simulate(n, incoming).ok).toBe(false);
    expect(
      simulate(n, {
        source: 'client',
        destination: '8.8.8.8',
        protocol: 'UDP',
        port: 53,
        checkReply: true,
      }).ok,
    ).toBe(true);
  });
});
describe('service checks and responses', () => {
  it('requires outbound NAT before private hosts can reach the Internet', () => {
    const n = lab();
    get(n, 'edge').outboundNat = false;
    const r = simulate(n, { source: 'client', destination: '8.8.8.8', protocol: 'UDP', port: 53 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('NAT wyjściowy');
  });
  it('can explicitly expose a service on the public edge itself without forwarding to a LAN host', () => {
    const n = lab();
    const edge = get(n, 'edge');
    edge.portForwards = [];
    edge.outboundNat = false;
    edge.services = [{ id: 'vpn', name: 'VPN', protocol: 'UDP', port: 51820, enabled: true }];
    edge.rules = [
      {
        id: 'vpn-wan',
        action: 'allow',
        protocol: 'UDP',
        port: '51820',
        source: '*',
        destination: 'device:edge',
        ingress: 'wan',
      },
    ];
    const r = simulate(n, { ...incoming, protocol: 'UDP', port: 51820 });
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['internet', 'edge']);
    expect(r.returnPath).toEqual(['edge', 'internet']);
  });
  it('installs connected SVI routes even when static routing has no user routes', () => {
    const n = lab();
    get(n, 'edge').routingMode = 'static';
    get(n, 'edge').routes = [];
    const forwarded = simulate(n, { ...incoming, checkReply: false });
    expect(forwarded.ok).toBe(true);
    const response = simulate(n, incoming);
    expect(response.ok).toBe(false);
    expect(response.reason).toContain('odpowiedzi');
  });
  it('allows router-on-a-stick to visit the same L2 switch in different VLANs', () => {
    const r = simulate(lab(), {
      source: 'client',
      destination: 'laptop',
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    });
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['client', 'sw', 'edge', 'sw', 'laptop']);
    expect(r.returnPath).toEqual(['laptop', 'sw', 'edge', 'sw', 'client']);
  });
  it('checks the active service after the port forward and animates a response path', () => {
    const r = simulate(lab(), incoming);
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['internet', 'edge', 'sw', 'server']);
    expect(r.returnPath).toEqual(['server', 'sw', 'edge', 'internet']);
    expect(tracePath(r)).toEqual(['internet', 'edge', 'sw', 'server', 'sw', 'edge', 'internet']);
    expect(r.steps.length).toBe(tracePath(r).length);
  });
  it('distinguishes a closed port from an ACL drop', () => {
    const n = lab();
    get(n, 'server').services = [];
    const r = simulate(n, incoming);
    expect(r.ok).toBe(false);
    expect(r.verdict).toBe('closed');
    expect(r.path.at(-1)).toBe('server');
    expect(r.reason).toContain('zamknięty');
  });
  it('checks source DHCP and physical reachability before an ordinary ping can succeed', () => {
    const n = lab();
    n.vlans[0].dhcpEnabled = false;
    const r = simulate(n, { source: 'client', destination: 'server', protocol: 'ICMP', port: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('DHCP');
  });
  it('does not route a same-subnet ARP across a layer-3 boundary', () => {
    const n = lab();
    n.links = n.links.filter((l) => l.id !== 'srv');
    n.links.push({ id: 'bad-segment', a: 'edge', b: 'server', mode: 'access', accessVlan: 1 });
    const r = simulate(n, { source: 'client', destination: 'server', protocol: 'ICMP', port: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ARP/L2');
  });
  it('uses stateful return permission but still validates the return route', () => {
    const n = lab();
    const edge = get(n, 'edge');
    edge.routingMode = 'static';
    edge.routes = [
      { id: 'connected-lan', destination: '192.168.0.0/24', nextHopId: 'sw', metric: 0 },
    ];
    const forward = simulate(n, { ...incoming, checkReply: false });
    expect(forward.ok).toBe(true);
    const reply = simulate(n, incoming);
    expect(reply.ok).toBe(false);
    expect(reply.verdict).toBe('unreachable');
    expect(reply.reason).toContain('odpowiedzi');
  });
  it('returns outbound masqueraded traffic through reverse connection NAT', () => {
    const r = simulate(lab(), {
      source: 'client',
      destination: '8.8.8.8',
      protocol: 'UDP',
      port: 53,
      checkReply: true,
    });
    expect(r.ok).toBe(true);
    expect(r.packet?.sourceIp).toBe('203.0.113.10');
    expect(r.returnPath?.at(-1)).toBe('client');
    expect(r.steps.some((s) => s.includes('reverse NAT'))).toBe(true);
  });
});
