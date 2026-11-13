import { prepareHardware } from '../model/ports';
import { connectInternet } from '../model/internetModel';
import { portUnavailable } from '../model/portConnections';
import { describe, it, expect } from 'vitest';
import type { Device, Kind, Network } from '../model/networkTypes';
import { simulateNetwork } from '../simulation/networkEngine';
import { parseNetwork } from '../model/network';
const host = (id: string, kind: Kind, ip: string, vlan = 0): Device => ({
  id,
  name: id,
  kind,
  ip,
  vlan,
  ipMode: 'static',
  x: 0,
  y: 0,
  online: true,
  rules: [],
  defaultAcl: 'allow',
});
function fixture(): Network {
  const client = {
    ...host('client', 'workstation', '10.0.10.10', 10),
    dnsServerIds: ['public-dns'],
  };
  const a = {
    ...host('edge-a', 'gateway', '10.0.10.1', 10),
    wanIp: '203.0.113.10',
    outboundNat: true,
  };
  const b = {
    ...host('edge-b', 'gateway', '10.0.20.1', 20),
    wanIp: '203.0.113.20',
    outboundNat: true,
    portForwards: [
      {
        id: 'https',
        protocol: 'TCP' as const,
        externalIp: '203.0.113.20',
        externalPort: 443,
        internalIp: '10.0.20.2',
        internalPort: 443,
        enabled: true,
      },
    ],
  };
  const dns = {
    ...host('public-dns', 'dns', '198.51.100.53'),
    publicDns: true,
    dnsRecords: [{ id: 'app', name: 'app.example.com', address: '203.0.113.20' }],
  };
  const proxy = {
    ...host('proxy', 'server', '10.0.20.2', 20),
    services: [
      {
        id: 'proxy-service',
        name: 'Nginx',
        protocol: 'TCP' as const,
        port: 443,
        enabled: true,
        type: 'proxy' as const,
        proxyHosts: [
          { id: 'app', domain: 'app.example.com', target: '10.0.20.3', port: 8080, enabled: true },
        ],
      },
    ],
  };
  const backend = {
    ...host('backend', 'server', '10.0.20.3', 20),
    services: [{ id: 'app', name: 'App', protocol: 'TCP' as const, port: 8080, enabled: true }],
  };
  return {
    name: 'Public DNS and proxy',
    devices: [
      client,
      a,
      b,
      dns,
      proxy,
      backend,
      host('wan-a', 'internet', '203.0.113.1'),
      host('wan-b', 'internet', '203.0.113.2'),
      host('switch', 'switch', '10.0.20.4', 20),
    ],
    vlans: [
      {
        id: 10,
        name: 'A',
        cidr: '10.0.10.0/24',
        gateway: '10.0.10.1',
        gatewayDeviceId: a.id,
        color: '#ffffff',
      },
      {
        id: 20,
        name: 'B',
        cidr: '10.0.20.0/24',
        gateway: '10.0.20.1',
        gatewayDeviceId: b.id,
        color: '#ffffff',
      },
    ],
    links: [
      ['client', 'edge-a'],
      ['edge-a', 'wan-a'],
      ['wan-a', 'wan-b'],
      ['wan-b', 'edge-b'],
      ['wan-a', 'public-dns'],
      ['edge-b', 'switch'],
      ['switch', 'proxy'],
      ['switch', 'backend'],
    ].map(([a, b], i) => ({ id: `link-${i}`, a, b })),
  };
}
const probe = {
  source: 'client',
  destination: 'app.example.com',
  protocol: 'TCP' as const,
  port: 443,
  checkReply: true,
};
describe('public DNS → WAN → DNAT → reverse proxy', () => {
  it('resolves over Internet and reaches the backend across two public networks', () => {
    const n = fixture();
    const r = simulateNetwork(n, probe);
    expect(r.ok, JSON.stringify(r, null, 2)).toBe(true);
    expect(r.dns?.queryPath).toContain('wan-a');
    expect(r.dns?.queryPath).toContain('public-dns');
    expect(r.path).toContain('wan-b');
    expect(r.path.at(-1)).toBe('backend');
    expect(r.steps.join(' ')).toContain('Host/SNI');
    expect(r.returnPath?.[0]).toBe('backend');
    expect(r.returnPath?.at(-1)).toBe('client');
  });
  it('fails for unavailable DNS, missing records, NAT, proxy routes or backend ports', () => {
    for (const change of [
      (n: Network) => {
        n.devices.find((d) => d.id === 'public-dns')!.online = false;
      },
      (n: Network) => {
        n.devices.find((d) => d.id === 'public-dns')!.dnsRecords = [];
      },
      (n: Network) => {
        n.devices.find((d) => d.id === 'edge-b')!.portForwards = [];
      },
      (n: Network) => {
        n.devices.find((d) => d.id === 'proxy')!.services![0].proxyHosts = [];
      },
      (n: Network) => {
        n.devices.find((d) => d.id === 'backend')!.services = [];
      },
      (n: Network) => {
        n.devices.find((d) => d.id === 'edge-a')!.outboundNat = false;
      },
      (n: Network) => {
        n.links = n.links.filter((l) => l.id !== 'link-2');
      },
    ]) {
      const n = fixture();
      change(n);
      expect(simulateNetwork(n, probe).ok).toBe(false);
    }
  });
  it('supports shared Internet uplinks with explicit physical port configuration', () => {
    const n = prepareHardware(fixture());
    const internet = n.devices.find((d) => d.id === 'wan-a')!;
    expect(portUnavailable(n, internet, internet.ports![0])).toBeUndefined();
    expect(simulateNetwork(n, probe).ok).toBe(true);
    expect(connectInternet(n, 'wan-b', 'public-dns', 'extra-dns').links.at(-1)?.id).toBe(
      'extra-dns',
    );
  });
  it('keeps TCP port scanning independent of virtual host routing', () => {
    const n = fixture();
    const r = simulateNetwork(n, { ...probe, destination: '203.0.113.20' });
    expect(r.ok, r.reason).toBe(true);
    expect(r.path.at(-1)).toBe('proxy');
  });
  it('rejects private answers from a public DNS zone', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'public-dns')!.dnsRecords![0].address = '10.0.20.2';
    expect(simulateNetwork(n, probe).ok).toBe(false);
  });
  it('reports a closed backend port after a successful proxy connection', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'backend')!.services = [];
    const r = simulateNetwork(n, probe);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('8080');
    expect(r.path.at(-1)).toBe('backend');
  });
  it('detects cycles between reverse proxies', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'backend')!.services![0] = {
      id: 'loop',
      name: 'Loop',
      protocol: 'TCP',
      port: 8080,
      enabled: true,
      type: 'proxy',
      proxyHosts: [
        { id: 'back', domain: 'app.example.com', target: '10.0.20.2', port: 443, enabled: true },
      ],
    };
    const r = simulateNetwork(n, probe);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('pętlę');
  });
  it('preserves configuration in project exports and rejects invalid proxy ports', () => {
    const n = fixture();
    expect(
      parseNetwork(JSON.stringify(n)).devices.find((d) => d.id === 'proxy')?.services?.[0].type,
    ).toBe('proxy');
    n.devices.find((d) => d.id === 'proxy')!.services![0].proxyHosts![0].port = 0;
    expect(() => parseNetwork(JSON.stringify(n))).toThrow('proxy');
  });
});
