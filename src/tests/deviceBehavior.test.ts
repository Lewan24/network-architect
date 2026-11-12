import { describe, expect, it } from 'vitest';
import { defaultServices, deviceCategories, kinds } from '../devices/deviceCatalog';
import { createDemoNetwork } from '../examples/demoNetwork';
import { discoverDhcp, reconcileDhcp } from '../model/dhcp';
import { applyVlans, parseNetwork, validateNetworkServices } from '../model/network';
import type { Device, Kind, Network, Probe } from '../model/networkTypes';
import { createNetworkDevice } from '../project/projectActions';
import { simulateNetwork } from '../simulation/networkEngine';

function node(id: string, kind: Kind, vlan = 10, ip = `10.0.${vlan}.2`): Device {
  return { id, kind, vlan, ip, name: id, ipMode: 'static', x: 0, y: 0, online: true, rules: [] };
}
function lab(kind: Kind = 'switch-l3'): Network {
  return {
    name: 'Audit',
    vlans: [10, 20, 99].map((id) => ({
      id,
      name: `VLAN ${id}`,
      cidr: `10.0.${id}.0/24`,
      gateway: `10.0.${id}.1`,
      color: '#839bbf',
    })),
    devices: [
      node('a', 'workstation'),
      node('b', 'workstation', 10, '10.0.10.3'),
      node(
        'sw',
        kind,
        kind === 'switch-unmanaged' ? 10 : 99,
        kind === 'switch-unmanaged' ? '' : '10.0.99.2',
      ),
    ],
    links: [
      { id: 'a-sw', a: 'a', b: 'sw', mode: 'access', accessVlan: 10 },
      { id: 'b-sw', a: 'b', b: 'sw', mode: 'access', accessVlan: 10 },
    ],
  };
}
const ping: Probe = { source: 'a', destination: 'b', protocol: 'ICMP', port: 0, checkReply: true };

describe('device behavior audit', () => {
  it.each(Object.keys(kinds) as Kind[])(
    '%s has a category and creates an independently editable device',
    (kind) => {
      expect(deviceCategories[kinds[kind].category]).toBeTruthy();
      const device = createNetworkDevice(lab(), kind, { x: 13, y: 23 });
      expect(device.kind).toBe(kind);
      expect(device.services).toEqual(defaultServices(kind));
      expect(device.online).toBe(true);
    },
  );
  it.each(['switch', 'switch-l3', 'switch-unmanaged'] as const)(
    '%s switches local traffic without a gateway or data-plane IP',
    (kind) => {
      const n = lab(kind);
      // Managed switch has a management VLAN of 99, while clients are in VLAN 10.
      n.devices[2].ip = '';
      expect(simulateNetwork(n, ping).ok).toBe(true);
      n.devices[2].online = false;
      expect(simulateNetwork(n, ping).ok).toBe(false);
    },
  );
  it('applies L3 ACL only when routing rather than switching in the same VLAN', () => {
    const n = lab();
    n.devices[2].defaultAcl = 'deny';
    expect(simulateNetwork(n, ping).ok).toBe(true);
    n.vlans.forEach((v) => {
      v.gatewayDeviceId = 'sw';
    });
    n.devices[1] = node('b', 'workstation', 20);
    n.links[1].accessVlan = 20;
    expect(simulateNetwork(n, ping).ok).toBe(false);
    n.devices[2].defaultAcl = 'allow';
    expect(simulateNetwork(n, ping).ok).toBe(true);
  });
  it('honors a managed switch VLAN list and access port restrictions', () => {
    const n = lab('switch');
    n.devices[2].allowedVlans = [99];
    expect(simulateNetwork(n, ping).ok).toBe(false);
    n.devices[2].allowedVlans = [10];
    expect(simulateNetwork(n, ping).ok).toBe(true);
    n.links[1].accessVlan = 20;
    expect(simulateNetwork(n, ping).ok).toBe(false);
  });
  it.each(['router', 'firewall', 'gateway', 'switch-l3'] as const)(
    '%s owns its SVI IP independently of its management address',
    (kind) => {
      const n = lab(kind);
      n.vlans[0].gatewayDeviceId = 'sw';
      n.devices[2].defaultAcl = 'allow';
      const result = simulateNetwork(n, { ...ping, destination: '10.0.10.1' });
      expect(result.ok, result.reason).toBe(true);
      expect(result.packet?.destinationIp).toBe('10.0.10.1');
      expect(result.returnPath).toEqual(['sw', 'a']);
    },
  );
  it('never masquerades an unknown private address into the Internet', () => {
    const n = createDemoNetwork();
    const result = simulateNetwork(n, {
      source: 'demo-pc',
      destination: '172.20.123.123',
      protocol: 'ICMP',
      port: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.path).not.toContain('internet-default');
    expect(result.reason).toContain('nie wskazuje');
  });
  it.each(['server', 'dns', 'workstation', 'printer', 'camera', 'mobile-phone'] as const)(
    '%s is an endpoint and cannot bridge two other clients',
    (kind) => {
      const n = lab(kind);
      n.devices[2] = node('sw', kind, 10, '10.0.10.4');
      expect(simulateNetwork(n, { ...ping, destination: 'sw' }).ok).toBe(true);
      expect(simulateNetwork(n, ping).ok).toBe(false);
    },
  );
  it('requires an L3 device for a gateway and a supported DHCP server', () => {
    for (const kind of [
      'switch',
      'switch-unmanaged',
      'workstation',
      'printer',
      'camera',
      'mobile-phone',
      'accesspoint',
      'vm',
    ] as const) {
      const n = lab(kind);
      n.vlans[0].gatewayDeviceId = 'sw';
      expect(() => validateNetworkServices(n)).toThrow('Brama');
      delete n.vlans[0].gatewayDeviceId;
      Object.assign(n.vlans[0], { dhcpEnabled: true, dhcpServerId: 'sw' });
      expect(() => validateNetworkServices(n)).toThrow('DHCP');
    }
  });
  it('models printer and camera service presets with their actual protocols', () => {
    expect(defaultServices('printer')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'IPP', protocol: 'TCP', port: 631 }),
        expect.objectContaining({ protocol: 'TCP', port: 9100 }),
      ]),
    );
    expect(defaultServices('camera').some((s) => s.port === 8000)).toBe(false);
    expect(defaultServices('camera')).toContainEqual(
      expect.objectContaining({ name: 'RTSP', protocol: 'TCP', port: 554 }),
    );
    expect(defaultServices('dns').map((s) => [s.protocol, s.port])).toEqual([
      ['UDP', 53],
      ['TCP', 53],
    ]);
  });
});

describe('VM VLAN routing audit', () => {
  it('routes between guest VLANs only through the configured router', () => {
    const n = createDemoNetwork();
    const guest = n.devices.find((d) => d.id === 'demo-app')!;
    n.devices.find((d) => d.id === 'demo-server-switch')!.allowedVlans = [10, 20];
    const uplink = n.links.find(
      (l) => [l.a, l.b].includes('demo-server-switch') && [l.a, l.b].includes('demo-firewall'),
    )!;
    uplink.mode = 'trunk';
    uplink.allowedVlans = [10, 20];
    const hostUplink = n.links.find(
      (l) => [l.a, l.b].includes('demo-server-switch') && [l.a, l.b].includes('demo-hyperv'),
    )!;
    hostUplink.mode = 'trunk';
    hostUplink.allowedVlans = [10, 20];
    guest.vlan = 10;
    guest.ip = '192.168.10.250';
    const probe: Probe = {
      source: 'demo-docker',
      destination: guest.id,
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    };
    const allowed = simulateNetwork(n, probe);
    expect(allowed.ok, allowed.reason).toBe(true);
    expect(allowed.path).toContain('demo-firewall');
    n.devices.find((d) => d.id === 'demo-firewall')!.online = false;
    expect(simulateNetwork(n, probe).ok).toBe(false);
  });
});

describe('DHCP and wireless behavior audit', () => {
  it('reserves every existing valid lease before allocating to a newly prepended client', () => {
    const now = Date.now();
    const n = reconcileDhcp(createDemoNetwork(), now);
    const oldClient = n.devices.find((d) => d.id === 'demo-pc')!;
    const newcomer = createNetworkDevice(n, 'workstation', { x: 0, y: 0 });
    n.devices.unshift(newcomer);
    n.links.push({ id: 'newcomer', a: newcomer.id, b: 'demo-lan-switch' });
    const resolved = reconcileDhcp(n, now + 1000);
    expect(resolved.devices.find((d) => d.id === oldClient.id)?.lease).toEqual(oldClient.lease);
    expect(resolved.devices.find((d) => d.id === newcomer.id)?.ip).not.toBe(oldClient.ip);
  });
  it('does not invent leases when changing a subnet with no DHCP server', () => {
    const n = lab('switch');
    n.devices[0].ipMode = 'auto';
    n.devices = n.devices.filter((d) => d.id !== 'b');
    n.links = n.links.filter((l) => l.id !== 'b-sw');
    const changed = applyVlans(
      n,
      n.vlans.map((v) => (v.id === 10 ? { ...v, cidr: '10.2.0.0/24', gateway: '10.2.0.1' } : v)),
    );
    expect(reconcileDhcp(changed).devices[0].ip).toBe('');
    expect(changed.devices[0].lease).toBeUndefined();
  });
  it('does not serve DHCP from an unaddressed application server', () => {
    const n = lab();
    n.devices[2] = { ...node('sw', 'server', 10, ''), ipMode: 'auto' };
    n.devices[0].ipMode = 'auto';
    Object.assign(n.vlans[0], { dhcpEnabled: true, dhcpServerId: 'sw' });
    expect(discoverDhcp(n, n.devices[0]).state).toBe('waiting');
    expect(reconcileDhcp(n).devices[0].lease).toBeUndefined();
  });
  it('separates AP management from the SSID VLAN for DHCP and data traffic', () => {
    const n = createDemoNetwork();
    const ap = n.devices.find((d) => d.id === 'demo-staff-ap')!;
    ap.wifiVlan = 40;
    ap.vlan = 20;
    ap.ipMode = 'static';
    ap.ip = '192.168.20.250';
    delete ap.lease;
    n.links = n.links.filter(
      (l) =>
        !((l.a === ap.id && l.b === 'demo-firewall') || (l.b === ap.id && l.a === 'demo-firewall')),
    );
    n.devices.find((d) => d.id === 'demo-server-switch')!.allowedVlans = [20, 40];
    const upstream = n.links.find(
      (l) => [l.a, l.b].includes('demo-server-switch') && [l.a, l.b].includes('demo-firewall'),
    )!;
    upstream.mode = 'trunk';
    upstream.allowedVlans = [20, 40];
    n.links.push({
      id: 'ap-uplink',
      a: ap.id,
      b: 'demo-server-switch',
      mode: 'trunk',
      allowedVlans: [20, 40],
    });
    const client = n.devices.find((d) => d.id === 'demo-staff-client')!;
    client.ip = '';
    delete client.lease;
    const resolved = parseNetwork(JSON.stringify(reconcileDhcp(n)));
    expect(resolved.devices.find((d) => d.id === client.id)?.lease?.vlan).toBe(40);
    expect(
      simulateNetwork(resolved, {
        source: client.id,
        destination: 'demo-dns',
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      }).ok,
    ).toBe(true);
    expect(
      simulateNetwork(resolved, {
        source: 'demo-dns',
        destination: ap.id,
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      }).ok,
    ).toBe(true);
    n.links.find((l) => l.id === 'ap-uplink')!.allowedVlans = [20];
    expect(reconcileDhcp(n).devices.find((d) => d.id === client.id)?.lease).toBeUndefined();
  });
});

describe('DNS transport audit', () => {
  it('uses TCP/53 when the resolver does not offer UDP/53', () => {
    const n = createDemoNetwork();
    const dns = n.devices.find((d) => d.id === 'demo-dns')!;
    dns.services = dns.services!.filter((s) => s.protocol === 'TCP');
    const result = simulateNetwork(n, {
      source: 'demo-pc',
      destination: 'app.lab.home.arpa',
      protocol: 'TCP',
      port: 3000,
      checkReply: true,
    });
    expect(result.ok, result.reason).toBe(true);
    expect(result.dns?.ok).toBe(true);
    expect(result.dns?.querySteps.some((s) => s.includes('TCP'))).toBe(true);
  });
  it('lets a DNS server use its own configured resolver locally', () => {
    const n = createDemoNetwork();
    const dns = n.devices.find((d) => d.id === 'demo-dns')!;
    dns.dnsServerIds = [dns.id];
    const result = simulateNetwork(n, {
      source: dns.id,
      destination: 'app.lab.home.arpa',
      protocol: 'TCP',
      port: 3000,
      checkReply: true,
    });
    expect(result.ok, result.reason).toBe(true);
    expect(result.dns?.queryPath).toEqual([dns.id]);
    dns.services = [];
    expect(
      simulateNetwork(n, {
        source: dns.id,
        destination: 'app.lab.home.arpa',
        protocol: 'TCP',
        port: 3000,
      }).ok,
    ).toBe(false);
  });
});

describe('IPv4 configuration audit', () => {
  it('reports an address conflict instead of choosing an arbitrary live host', () => {
    const n = lab();
    n.devices[1].ip = n.devices[0].ip;
    const result = simulateNetwork(n, ping);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Konflikt');
  });
  it('does not treat a static address outside the selected subnet as reachable', () => {
    const n = lab();
    n.devices[0].ip = '10.0.20.77';
    expect(simulateNetwork(n, ping).ok).toBe(false);
  });
});

describe('DHCP relay connected routes', () => {
  it('uses connected SVI routes on a static router without user routes', () => {
    const n = lab();
    n.devices[0] = { ...node('a', 'workstation', 10, ''), ipMode: 'auto' };
    n.devices[1] = node('b', 'server', 20);
    n.devices[2].routingMode = 'static';
    n.devices[2].routes = [];
    n.links[1].accessVlan = 20;
    for (const v of n.vlans) v.gatewayDeviceId = 'sw';
    Object.assign(n.vlans[0], { dhcpEnabled: true, dhcpServerId: 'b', relayDeviceId: 'sw' });
    expect(discoverDhcp(n, n.devices[0]).state).toBe('bound');
    expect(reconcileDhcp(n).devices[0].lease?.serverId).toBe('b');
  });
});
