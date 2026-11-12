import { describe, expect, it } from 'vitest';
import { makePort } from '../model/ports';
import { reconcileDhcp } from '../model/dhcp';
import { diagnoseNetwork } from '../model/diagnostics';
import { selectInterface } from '../model/interfaces';
import { parseNetwork } from '../model/network';
import { simulateNetwork } from '../simulation/networkEngine';
import type { Device, Network, NetworkInterface } from '../model/networkTypes';
function node(id: string, kind: Device['kind'], vlan: number, ip: string): Device {
  return { id, name: id, kind, vlan, ip, ipMode: 'static', online: true, rules: [], x: 0, y: 0 };
}
function nic(id: string, vlan: number, ip: string, gateway = '', metric = 100): NetworkInterface {
  return {
    id,
    name: id,
    portId: id,
    enabled: true,
    vlan,
    ip,
    ipMode: 'static',
    prefix: 24,
    gateway,
    metric,
  };
}
function lab(): Network {
  const a = {
    ...node('a', 'server', 10, '192.168.10.2'),
    ports: [makePort('lan10', 'rj45', 10), makePort('lan20', 'rj45', 20)],
    interfaces: [
      nic('lan10', 10, '192.168.10.2', '192.168.10.1', 100),
      nic('lan20', 20, '192.168.20.2', '192.168.20.1', 20),
    ],
  };
  const r = {
    ...node('r', 'router', 0, '10.255.0.1'),
    defaultAcl: 'allow' as const,
    ports: [10, 20, 30].map((v) => makePort(`p${v}`, 'rj45', v)),
  };
  return {
    name: 'Multihoming',
    devices: [
      a,
      r,
      ...[10, 20, 30].map((v) => ({
        ...node(`s${v}`, 'switch', v, `192.168.${v}.254`),
        ports: ['host', 'router', 'extra'].map((id) => makePort(id, 'rj45', v)),
      })),
      { ...node('b', 'workstation', 20, '192.168.20.3'), ports: [makePort('eth0', 'rj45', 20)] },
      { ...node('c', 'workstation', 30, '192.168.30.3'), ports: [makePort('eth0', 'rj45', 30)] },
    ],
    vlans: [10, 20, 30].map((v) => ({
      id: v,
      name: `VLAN ${v}`,
      cidr: `192.168.${v}.0/24`,
      gateway: `192.168.${v}.1`,
      gatewayDeviceId: 'r',
      color: '#718fae',
      dhcpEnabled: true,
      dhcpServerId: 'r',
      dhcpStart: `192.168.${v}.100`,
      dhcpEnd: `192.168.${v}.110`,
    })),
    links: [
      ...[10, 20].map((v) => ({
        id: `a-${v}`,
        a: 'a',
        b: `s${v}`,
        aPortId: `lan${v}`,
        bPortId: 'host',
        cable: 'cat6' as const,
      })),
      ...[10, 20, 30].map((v) => ({
        id: `r-${v}`,
        a: 'r',
        b: `s${v}`,
        aPortId: `p${v}`,
        bPortId: 'router',
        cable: 'cat6' as const,
      })),
      { id: 'b20', a: 'b', b: 's20', aPortId: 'eth0', bPortId: 'extra', cable: 'cat6' },
      { id: 'c30', a: 'c', b: 's30', aPortId: 'eth0', bPortId: 'extra', cable: 'cat6' },
    ],
  };
}
const ping = {
  source: 'a',
  destination: 'b',
  protocol: 'ICMP' as const,
  port: 0,
  checkReply: true,
};

describe('multiple network interfaces', () => {
  it('selects the connected adapter, source IP and physical port without visiting a router', () => {
    const result = simulateNetwork(lab(), ping);
    expect(result.ok, result.reason).toBe(true);
    expect(result.packet?.sourceIp).toBe('192.168.20.2');
    expect(result.sourceInterfaceId).toBe('lan20');
    expect(result.path).toEqual(['a', 's20', 'b']);
    expect(result.returnPath).toEqual(['b', 's20', 'a']);
  });
  it('uses the lowest-metric default gateway for an off-link destination and checks the return route', () => {
    const result = simulateNetwork(lab(), { ...ping, destination: 'c' });
    expect(result.ok, result.reason).toBe(true);
    expect(result.path).toEqual(['a', 's20', 'r', 's30', 'c']);
    expect(result.packet?.sourceIp).toBe('192.168.20.2');
    expect(result.returnPath).toEqual(['c', 's30', 'r', 's20', 'a']);
  });
  it('can pin a source adapter and address a secondary adapter by its IP', () => {
    const n = lab();
    const pinned = simulateNetwork(n, { ...ping, destination: 'c', sourceInterfaceId: 'lan10' });
    expect(pinned.ok, pinned.reason).toBe(true);
    expect(pinned.sourceInterfaceId).toBe('lan10');
    const inbound = simulateNetwork(n, { ...ping, source: 'b', destination: '192.168.20.2' });
    expect(inbound.ok, inbound.reason).toBe(true);
    expect(inbound.destinationInterfaceId).toBe('lan20');
  });
  it('never forwards between host cards in place of a router', () => {
    const n = lab();
    n.devices.find((d) => d.id === 'r')!.online = false;
    const client = {
      ...node('x', 'workstation', 10, '192.168.10.3'),
      ports: [makePort('eth0', 'rj45', 10)],
    };
    n.devices.push(client);
    n.links.push({ id: 'x10', a: 'x', b: 's10', aPortId: 'eth0', bPortId: 'extra', cable: 'cat6' });
    expect(simulateNetwork(n, { ...ping, source: 'x' }).ok).toBe(false);
  });
  it('withdraws a link-down adapter from automatic source selection', () => {
    const n = lab();
    n.devices[0].ports![1].enabled = false;
    const result = simulateNetwork(n, { ...ping, destination: 'c' });
    expect(result.ok, result.reason).toBe(true);
    expect(result.sourceInterfaceId).toBe('lan10');
  });
  it('does not use an inaccessible gateway or fabricate an on-link route from the VLAN description', () => {
    const n = lab();
    n.devices[0].interfaces![1].prefix = 16;
    n.devices[0].interfaces![0].enabled = false;
    const result = simulateNetwork(n, { ...ping, destination: 'c' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ARP/L2');
    n.devices[0].interfaces![1].prefix = 24;
    n.devices[0].interfaces![1].gateway = '10.20.0.1';
    expect(diagnoseNetwork(n).some((d) => d.code === 'gateway-offlink')).toBe(true);
    expect(simulateNetwork(n, { ...ping, destination: 'c' }).ok).toBe(false);
  });
  it('uses longest prefix before metric and rejects a disabled explicitly selected NIC', () => {
    const n = lab();
    const a = n.devices[0];
    a.interfaces![0].prefix = 16;
    a.interfaces![0].metric = 1;
    expect(selectInterface(a, '192.168.20.3')?.id).toBe('lan20');
    a.interfaces![1].enabled = false;
    expect(simulateNetwork(n, { ...ping, sourceInterfaceId: 'lan20' }).ok).toBe(false);
  });
  it('obtains independent DHCP leases, mask, gateway and DNS per NIC', () => {
    const n = lab();
    for (const i of n.devices[0].interfaces!) {
      i.ipMode = 'auto';
      i.ip = '';
      i.gateway = '';
    }
    const leased = reconcileDhcp(n);
    const a = leased.devices[0];
    expect(a.interfaces?.map((i) => i.ip)).toEqual(['192.168.10.100', '192.168.20.100']);
    expect(a.interfaces?.map((i) => i.gateway)).toEqual(['192.168.10.1', '192.168.20.1']);
    expect(a.interfaces?.map((i) => i.lease?.vlan)).toEqual([10, 20]);
    expect(parseNetwork(JSON.stringify(leased))).toEqual(leased);
    expect(simulateNetwork(leased, ping).ok).toBe(true);
  });
  it('keeps a valid secondary NIC lease during server outage and expires it later', () => {
    const n = lab();
    for (const i of n.devices[0].interfaces!) {
      i.ipMode = 'auto';
      i.ip = '';
    }
    const now = Date.now();
    const leased = reconcileDhcp(n, now);
    leased.devices.find((d) => d.id === 'r')!.online = false;
    expect(reconcileDhcp(leased, now + 1000).devices[0].interfaces![1].ip).toBe('192.168.20.100');
    expect(reconcileDhcp(leased, now + 121 * 60000).devices[0].interfaces![1].ip).toBe('');
  });
  it('reports secondary IP conflicts and prevents using the conflicting source', () => {
    const n = lab();
    n.devices[0].interfaces![1].ip = '192.168.20.3';
    expect(diagnoseNetwork(n).some((d) => d.code === 'ip-conflict')).toBe(true);
    expect(simulateNetwork(n, { ...ping, destination: 'c' }).reason).toContain('Konflikt');
  });
  it('rejects malformed NIC bindings and invalid masks during import', () => {
    const n = lab();
    n.devices[0].interfaces![1].portId = 'missing';
    expect(() => parseNetwork(JSON.stringify(n))).toThrow('portu');
    n.devices[0].interfaces![1].portId = 'lan20';
    n.devices[0].interfaces![1].prefix = 33;
    expect(() => parseNetwork(JSON.stringify(n))).toThrow('prefiksu');
  });
});

it('routes through explicit static L3 interfaces using connected routes without user routes', () => {
  const n = lab();
  const router = n.devices.find((d) => d.id === 'r')!;
  router.routingMode = 'static';
  router.routes = [];
  router.interfaces = [10, 20, 30].map((v) => ({
    ...nic(`p${v}`, v, `192.168.${v}.1`),
    gateway: '',
  }));
  router.ip = router.interfaces[0].ip;
  router.vlan = 10;
  for (const v of n.vlans) delete v.gatewayDeviceId;
  n.devices.find((d) => d.id === 'c')!.interfaces = [
    nic('eth0', 30, '192.168.30.3', '192.168.30.1'),
  ];
  const result = simulateNetwork(n, { ...ping, destination: 'c' });
  expect(result.ok, result.reason).toBe(true);
  expect(result.path).toContain('r');
});

it('delivers DNAT to a secondary NIC and returns through that connection instead of the primary address', () => {
  const n = lab();
  const router = n.devices.find((d) => d.id === 'r')!;
  router.edgeRole = 'edge';
  router.wanIp = '203.0.113.10';
  router.outboundNat = true;
  router.ports!.push({ ...makePort('wan'), mode: 'auto' });
  router.portForwards = [
    {
      id: 'secondary',
      enabled: true,
      protocol: 'TCP',
      externalIp: router.wanIp,
      externalPort: 8443,
      internalIp: '192.168.20.2',
      internalPort: 443,
    },
  ];
  n.devices[0].services = [{ id: 'web', name: 'HTTPS', protocol: 'TCP', port: 443, enabled: true }];
  n.devices.push({
    ...node('internet', 'internet', 0, '198.51.100.1'),
    ports: [{ ...makePort('wan'), mode: 'auto' }],
  });
  n.links.push({ id: 'wan', a: 'internet', b: 'r', aPortId: 'wan', bPortId: 'wan', cable: 'cat6' });
  const result = simulateNetwork(n, {
    source: 'internet',
    destination: router.wanIp,
    protocol: 'TCP',
    port: 8443,
    checkReply: true,
  });
  expect(result.ok, result.reason).toBe(true);
  expect(result.packet?.destinationIp).toBe('192.168.20.2');
  expect(result.returnPath).toEqual(['a', 's20', 'r', 'internet']);
});

it('duplicates static interfaces with new unique addresses and preserves masks and addressing modes', async () => {
  const { duplicateNetworkDevice } = await import('../project/projectActions');
  const n = lab();
  const copy = duplicateNetworkDevice(n, n.devices[0]);
  expect(copy.interfaces?.map((i) => i.ipMode)).toEqual(['static', 'static']);
  expect(copy.interfaces?.[0].ip).not.toBe(n.devices[0].interfaces![0].ip);
  expect(copy.interfaces?.[1].ip).not.toBe(n.devices[0].interfaces![1].ip);
  expect(copy.interfaces?.map((i) => i.prefix)).toEqual([24, 24]);
  expect(
    parseNetwork(JSON.stringify({ ...n, devices: [...n.devices, copy] })).devices,
  ).toHaveLength(n.devices.length + 1);
});
it('includes secondary network memberships in VLAN locking and group movement', async () => {
  const { vlanReferences } = await import('../project/vlanEditing');
  const { moveNetworkGroup } = await import('../canvas/networkGroups');
  const n = lab();
  expect(vlanReferences(n, 20)).toContain('interfejsy IP');
  expect(moveNetworkGroup(n, 20, { x: 30, y: 40 }).devices[0]).toMatchObject({ x: 30, y: 40 });
  expect(n.devices[0]).toMatchObject({ x: 0, y: 0 });
});

it('resolves a static next-hop router through a shared L2 switch instead of requiring a direct cable', () => {
  const n = lab();
  const r = n.devices.find((d) => d.id === 'r')!;
  const r2 = {
    ...node('r2', 'router', 20, '192.168.20.4'),
    defaultAcl: 'allow' as const,
    routingMode: 'static' as const,
    ports: [makePort('transit', 'rj45', 20), makePort('remote', 'rj45', 30)],
    interfaces: [nic('transit', 20, '192.168.20.4'), nic('remote', 30, '192.168.30.1')],
    routes: [{ id: 'back', destination: '192.168.10.0/24', nextHopId: 'r', metric: 1 }],
  };
  r.interfaces = [nic('p10', 10, '192.168.10.1'), nic('p20', 20, '192.168.20.1')];
  r.ip = r.interfaces[0].ip;
  r.vlan = 10;
  r.routingMode = 'static';
  r.routes = [{ id: 'via-l2', destination: '192.168.30.0/24', nextHopId: 'r2', metric: 1 }];
  n.devices.push(r2);
  n.devices.find((d) => d.id === 's20')!.ports!.push(makePort('r2', 'rj45', 20));
  n.links = n.links.filter((l) => l.id !== 'r-30');
  n.links.push(
    { id: 'r2-lan20', a: 'r2', b: 's20', aPortId: 'transit', bPortId: 'r2', cable: 'cat6' },
    { id: 'r2-lan30', a: 'r2', b: 's30', aPortId: 'remote', bPortId: 'router', cable: 'cat6' },
  );
  n.vlans.find((v) => v.id === 30)!.gatewayDeviceId = 'r2';
  const result = simulateNetwork(n, { ...ping, destination: 'c', sourceInterfaceId: 'lan10' });
  expect(result.ok, result.reason).toBe(true);
  expect(result.path).toEqual(['a', 's10', 'r', 's20', 'r2', 's30', 'c']);
  expect(result.returnPath).toEqual(['c', 's30', 'r2', 's20', 'r', 's10', 'a']);
  expect(() => parseNetwork(JSON.stringify(n))).not.toThrow();
});
