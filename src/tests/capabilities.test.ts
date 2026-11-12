import { describe, expect, it } from 'vitest';
import { example } from './fixtures/legacyNetwork';
import {
  applyVlans,
  defaultVlans,
  parseNetwork,
  topologyLinks,
  validateDeviceConfig,
} from '../model/network';
import { selectRoute, simulateNetwork as simulate } from '../simulation/networkEngine';
import type { Device, Network, Probe } from '../model/networkTypes';
function fixture() {
  const n = structuredClone(example);
  const fw = n.devices.find((d) => d.id === 'fw')!;
  fw.rules = [];
  fw.defaultAcl = 'allow';
  fw.portForwards = [
    {
      id: 'base',
      externalIp: fw.wanIp!,
      externalPort: 443,
      internalIp: '10.0.20.10',
      internalPort: 443,
      protocol: 'TCP',
      enabled: true,
    },
  ];
  fw.staticNat = [];
  n.devices.find((d) => d.id === 'web')!.services = [
    { id: 'web80', name: 'HTTP', protocol: 'TCP', port: 80, enabled: true },
    { id: 'web443', name: 'HTTPS', protocol: 'TCP', port: 443, enabled: true },
    { id: 'dns', name: 'DNS', protocol: 'UDP', port: 53, enabled: true },
  ];
  return n;
}
const probe: Probe = { source: 'wan', destination: '203.0.113.10', protocol: 'TCP', port: 443 };
const fwOf = (n: Network) => n.devices.find((d) => d.id === 'fw')!;
function publish(n: Network) {
  const fw = fwOf(n);
  fw.wanIp = '198.51.100.10';
  fw.portForwards = [
    {
      id: 'publish',
      protocol: 'TCP',
      externalIp: fw.wanIp,
      externalPort: 8443,
      internalIp: '10.0.20.10',
      internalPort: 80,
      enabled: true,
    },
  ];
  return fw;
}
function node(id: string, kind: Device['kind'], ip: string, vlan: number): Device {
  return { id, kind, name: id, ip, vlan, ipMode: 'static', x: 0, y: 0, online: true, rules: [] };
}
function switched(kind: Device['kind']): Network {
  return {
    name: 'Switch test',
    vlans: defaultVlans.map((v) => ({
      ...v,
      ...(kind === 'switch-l3' ? { gatewayDeviceId: 'sw' } : {}),
    })),
    devices: [
      node('pc', 'workstation', '10.0.10.2', 10),
      {
        ...node('sw', kind, kind === 'switch-unmanaged' ? '' : '10.0.10.1', 10),
        rules: [
          {
            id: 'icmp',
            action: 'allow',
            protocol: 'ICMP',
            port: '*',
            source: '*',
            destination: '*',
          },
        ],
      },
      node('srv', 'server', '10.0.20.2', 20),
    ],
    links: [
      { id: 'a', a: 'pc', b: 'sw' },
      { id: 'b', a: 'sw', b: 'srv' },
    ],
  };
}
describe('ACL defaults', () => {
  it('denies unmatched traffic with deny any', () => {
    const n = fixture();
    fwOf(n).defaultAcl = 'deny';
    const r = simulate(n, probe);
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('fw');
    expect(r.reason).toContain('deny any');
  });
  it('lets a permit rule override default deny', () => {
    const n = fixture();
    const fw = fwOf(n);
    fw.defaultAcl = 'deny';
    fw.rules = [
      {
        id: 'allow',
        action: 'allow',
        protocol: 'TCP',
        port: '443',
        source: '*',
        destination: '10.0.20.10',
      },
    ];
    expect(simulate(n, probe).ok).toBe(true);
    expect(simulate(n, { ...probe, port: 22 }).ok).toBe(false);
  });
  it('evaluates router ACL before reaching the firewall', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'rt')!.defaultAcl = 'deny';
    n.devices.find((d) => d.id === 'rt')!.rules = [];
    const r = simulate(n, probe);
    expect(r.ok).toBe(false);
    expect(r.path).toEqual(['wan', 'rt']);
  });
});
describe('switch capabilities', () => {
  const p: Probe = { source: 'pc', destination: 'srv', protocol: 'ICMP', port: 0 };
  it('does not route between VLANs on L2', () =>
    expect(simulate(switched('switch'), p).ok).toBe(false));
  it('routes between VLANs on L3', () => expect(simulate(switched('switch-l3'), p).ok).toBe(true));
  it('respects the VLAN allow list on L3', () => {
    const n = switched('switch-l3');
    n.devices[1].allowedVlans = [10];
    expect(simulate(n, p).ok).toBe(false);
    n.devices[1].allowedVlans = [10, 20];
    expect(simulate(n, p).ok).toBe(true);
  });
  it('does not mistake managed L2 VLAN transport for routing', () => {
    const n = switched('switch');
    n.devices[1].allowedVlans = [10, 20];
    expect(simulate(n, p).ok).toBe(false);
    n.devices[2].vlan = 10;
    n.devices[2].ip = '10.0.10.3';
    expect(simulate(n, p).ok).toBe(true);
  });
  it('switches unmanaged traffic but has no IP management endpoint', () => {
    const n = switched('switch-unmanaged');
    n.devices[2].vlan = 10;
    n.devices[2].ip = '10.0.10.3';
    expect(simulate(n, p).ok).toBe(true);
    expect(simulate(n, { ...p, destination: 'sw' }).ok).toBe(false);
    expect(() => applyVlans(n, n.vlans)).not.toThrow();
    expect(parseNetwork(JSON.stringify(n)).devices[1].ip).toBe('');
  });
});
describe('port forwarding and NAT', () => {
  it('translates public destination and port before the firewall ACL', () => {
    const n = fixture();
    const fw = publish(n);
    fw.defaultAcl = 'deny';
    fw.rules = [
      {
        id: 'web',
        action: 'allow',
        protocol: 'TCP',
        port: '80',
        source: '*',
        destination: '10.0.20.10',
      },
    ];
    const r = simulate(n, { ...probe, destination: '198.51.100.10', port: 8443 });
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['wan', 'rt', 'fw', 'sv', 'web']);
    expect(r.packet?.destinationIp).toBe('10.0.20.10');
    expect(r.packet?.port).toBe(80);
    expect(r.steps[2]).toContain('DNAT');
  });
  it('does not bypass deny ACL after DNAT', () => {
    const n = fixture();
    publish(n).defaultAcl = 'deny';
    const r = simulate(n, { ...probe, destination: '198.51.100.10', port: 8443 });
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('fw');
  });
  it('does not publish a mismatched protocol or disabled forwarding rule', () => {
    const n = fixture();
    const fw = publish(n);
    expect(simulate(n, { ...probe, destination: fw.wanIp!, port: 8443, protocol: 'UDP' }).ok).toBe(
      false,
    );
    fw.portForwards![0].enabled = false;
    expect(simulate(n, { ...probe, destination: fw.wanIp!, port: 8443 }).ok).toBe(false);
  });
  it('maps static NAT inbound for UDP without changing the port', () => {
    const n = fixture();
    fwOf(n).staticNat = [
      { id: 'nat', publicIp: '198.51.100.20', privateIp: '10.0.20.10', enabled: true },
    ];
    const r = simulate(n, { ...probe, destination: '198.51.100.20', protocol: 'UDP', port: 53 });
    expect(r.ok).toBe(true);
    expect(r.packet?.destinationIp).toBe('10.0.20.10');
    expect(r.packet?.port).toBe(53);
  });
  it('maps static NAT outbound source toward the internet', () => {
    const n = fixture();
    fwOf(n).staticNat = [
      { id: 'nat', publicIp: '198.51.100.20', privateIp: '10.0.20.10', enabled: true },
    ];
    const r = simulate(n, {
      ...probe,
      source: 'web',
      destination: '8.8.8.8',
      protocol: 'UDP',
      port: 53,
    });
    expect(r.ok).toBe(true);
    expect(r.path).toEqual(['web', 'sv', 'fw', 'rt', 'wan']);
    expect(r.packet?.sourceIp).toBe('198.51.100.20');
    expect(r.packet?.destinationIp).toBe('8.8.8.8');
  });
  it('gives a matching port forward precedence over static NAT', () => {
    const n = fixture();
    const fw = publish(n);
    fw.staticNat = [{ id: 'nat', publicIp: fw.wanIp!, privateIp: '10.0.20.20', enabled: true }];
    expect(simulate(n, { ...probe, destination: fw.wanIp!, port: 8443 }).path.at(-1)).toBe('web');
  });
  it('stops at the firewall if the translated target is missing or disconnected', () => {
    const n = fixture();
    const fw = publish(n);
    fw.portForwards![0].internalIp = '10.0.99.9';
    let r = simulate(n, { ...probe, destination: fw.wanIp!, port: 8443 });
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('fw');
    fw.portForwards![0].internalIp = '10.0.20.10';
    n.links = n.links.filter((l) => l.b !== 'web');
    r = simulate(n, { ...probe, destination: fw.wanIp!, port: 8443 });
    expect(r.ok).toBe(false);
    expect(r.path.at(-1)).toBe('fw');
  });
  it('rejects duplicate active public socket mappings', () => {
    const n = fixture();
    const fw = publish(n);
    fw.portForwards!.push({ ...fw.portForwards![0], id: 'copy' });
    expect(() => validateDeviceConfig(fw, n)).toThrow('tego samego');
  });
});
describe('static routing', () => {
  it('uses longest prefix and then lowest metric', () => {
    const n = fixture();
    const rt = n.devices.find((d) => d.id === 'rt')!;
    rt.routes = [
      { id: 'default', destination: '0.0.0.0/0', nextHopId: 'wan', metric: 0 },
      { id: 'specific-high', destination: '203.0.113.0/24', nextHopId: 'wan', metric: 20 },
      { id: 'specific-low', destination: '203.0.113.0/24', nextHopId: 'fw', metric: 10 },
    ];
    expect(selectRoute(rt, '203.0.113.10')?.id).toBe('specific-low');
    rt.routingMode = 'static';
    expect(simulate(n, probe).ok).toBe(true);
  });
  it('stops at the router when no route matches', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'rt')!.routingMode = 'static';
    const r = simulate(n, probe);
    expect(r.ok).toBe(false);
    expect(r.path).toEqual(['wan', 'rt']);
    expect(r.reason).toContain('brak trasy');
  });
  it('uses the public address for routing before DNAT', () => {
    const n = fixture();
    const fw = publish(n);
    const rt = n.devices.find((d) => d.id === 'rt')!;
    rt.routingMode = 'static';
    rt.routes = [{ id: 'wan-public', destination: '198.51.100.0/24', nextHopId: 'fw', metric: 10 }];
    expect(simulate(n, { ...probe, destination: fw.wanIp!, port: 8443 }).ok).toBe(true);
  });
  it('reports an offline next hop and routing loops', () => {
    const n = fixture();
    const rt = n.devices.find((d) => d.id === 'rt')!;
    rt.routingMode = 'static';
    rt.routes = [{ id: 'default', destination: '0.0.0.0/0', nextHopId: 'fw', metric: 10 }];
    fwOf(n).online = false;
    expect(simulate(n, probe).reason).toContain('wyłączony');
    fwOf(n).online = true;
    rt.routes[0].nextHopId = 'wan';
    expect(simulate(n, probe).reason).toContain('pętla');
  });
  it('rejects a configured next hop that is not a direct neighbor', () => {
    const n = fixture();
    const rt = n.devices.find((d) => d.id === 'rt')!;
    rt.routes = [{ id: 'bad', destination: '0.0.0.0/0', nextHopId: 'web', metric: 10 }];
    expect(() => validateDeviceConfig(rt, n)).toThrow('bezpośrednio');
  });
  it('retains a route across saving a project with a disconnected next hop', () => {
    const n = fixture();
    const rt = n.devices.find((d) => d.id === 'rt')!;
    rt.routingMode = 'static';
    rt.routes = [{ id: 'route', destination: '0.0.0.0/0', nextHopId: 'fw', metric: 10 }];
    n.links = n.links.filter((l) => l.id !== 'rt-fw');
    const restored = parseNetwork(JSON.stringify(n));
    expect(restored.devices.find((d) => d.id === 'rt')!.routes).toEqual(rt.routes);
    expect(simulate(restored, probe).reason).toContain('odłączony');
  });
});
describe('virtual infrastructure', () => {
  it('connects VMs through the host virtual switch in both directions', () => {
    const n = fixture();
    const out = simulate(n, { ...probe, source: 'vm1', destination: 'web' });
    expect(out.ok).toBe(true);
    expect(out.path).toEqual(['vm1', 'hv', 'sv', 'web']);
    expect(simulate(n, { ...probe, source: 'web', destination: 'vm1' }).path.at(-2)).toBe('hv');
    expect(topologyLinks(n).some((l) => l.id === 'virtual:vm1')).toBe(true);
  });
  it('requires an active hypervisor', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'hv')!.online = false;
    expect(simulate(n, { ...probe, source: 'web', destination: 'vm1' }).ok).toBe(false);
  });
  it('does not let a VM bypass its missing host with a direct physical link', () => {
    const n = fixture();
    n.devices.find((d) => d.id === 'vm1')!.hostId = '';
    n.links.push({ id: 'bypass', a: 'vm1', b: 'fw' });
    expect(simulate(n, { ...probe, source: 'vm1', destination: 'web' }).ok).toBe(false);
  });
  it('isolates different VM VLANs on the same hypervisor without a router', () => {
    const n = fixture();
    fwOf(n).online = false;
    n.devices.push({
      ...n.devices.find((d) => d.id === 'vm1')!,
      id: 'vm2',
      ip: '10.0.10.99',
      vlan: 10,
    });
    const r = simulate(n, { ...probe, source: 'vm1', destination: 'vm2' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('VLAN');
  });
  it('retains host, ACL, routing and NAT settings during export and import', () =>
    expect(parseNetwork(JSON.stringify(example))).toEqual(example));
  it('does not confuse a hypervisor management interface with its guest virtual switch', () => {
    const n: Network = {
      name: 'Management',
      vlans: defaultVlans,
      devices: [
        node('pc', 'workstation', '10.0.10.2', 10),
        { ...node('host', 'server', '10.0.20.2', 20), serverRole: 'hypervisor' },
      ],
      links: [{ id: 'direct', a: 'pc', b: 'host' }],
    };
    expect(simulate(n, { ...probe, source: 'pc', destination: 'host' }).ok).toBe(false);
  });
});
