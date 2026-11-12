import { describe, expect, it } from 'vitest';
import {
  hardwareState,
  makePort,
  physicalLinkState,
  prepareHardware,
  transferVlan,
} from '../model/ports';
import { diagnoseNetwork } from '../model/diagnostics';
import { parseNetwork } from '../model/network';
import { reconcileDhcp } from '../model/dhcp';
import { simulateNetwork } from '../simulation/networkEngine';
import type { Device, Link, Network, Port } from '../model/networkTypes';

function device(id: string, kind: Device['kind'], ip = '192.168.10.2'): Device {
  return {
    id,
    name: id,
    kind,
    ip,
    vlan: 10,
    ipMode: 'static',
    x: 0,
    y: 0,
    online: true,
    rules: [],
  };
}
function wire(a = 'a', b = 'b', aPortId = 'eth0', bPortId = 'eth0'): Link {
  return { id: `${a}-${b}`, a, b, aPortId, bPortId, cable: 'cat6', lengthMeters: 3 };
}
function pair(): Network {
  return {
    name: 'Hardware',
    devices: ['a', 'b'].map((id, i) => ({
      ...device(id, 'workstation', `192.168.10.${i + 2}`),
      ports: [makePort('eth0', 'rj45', 10)],
    })),
    links: [wire()],
    vlans: [
      { id: 10, name: 'LAN', cidr: '192.168.10.0/24', gateway: '192.168.10.1', color: '#718fae' },
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
const port = (n: Network, index = 0) => n.devices[index].ports![0];

describe('physical ports and media', () => {
  it('keeps stable finite port assignments through repeated normalization and JSON', () => {
    const original = pair();
    delete original.links[0].aPortId;
    delete original.links[0].bPortId;
    const n = prepareHardware(original);
    expect(n.links[0].aPortId).toBe('eth0');
    expect(prepareHardware(n)).toEqual(n);
    expect(parseNetwork(JSON.stringify(n))).toEqual(n);
    expect(original.links[0].aPortId).toBeUndefined();
  });
  it('does not invent another port when all ports are occupied', () => {
    const n = pair();
    n.devices.push({ ...device('c', 'workstation', '192.168.10.4'), ports: [makePort('eth0')] });
    n.links.push({ id: 'extra', a: 'a', b: 'c' });
    const prepared = prepareHardware(n);
    expect(prepared.links[1].aPortId).toBeUndefined();
    expect(prepared.devices[0].ports).toHaveLength(1);
    expect(physicalLinkState(prepared, prepared.links[1]).up).toBe(false);
  });
  it('rejects two cables assigned to the same physical socket', () => {
    const n = pair();
    n.devices.push({ ...device('c', 'workstation'), ports: [makePort('eth0')] });
    n.links.push(wire('a', 'c'));
    expect(physicalLinkState(n, n.links[0]).errors.join(' ')).toContain('więcej niż jeden');
    expect(physicalLinkState(n, n.links[1]).up).toBe(false);
  });
  it('permits several wireless clients on an AP radio, but one association on a client radio', () => {
    const n = pair();
    n.devices = [
      { ...device('ap', 'accesspoint'), ports: [makePort('radio0', 'wifi', 10)] },
      ...['a', 'b'].map((id) => ({
        ...device(id, 'mobile-phone'),
        ports: [makePort('wlan0', 'wifi', 10)],
      })),
    ];
    n.links = ['a', 'b'].map((id) => ({ ...wire('ap', id, 'radio0', 'wlan0'), cable: 'wireless' }));
    expect(n.links.every((l) => physicalLinkState(n, l).up)).toBe(true);
    n.links.push({ ...wire('b', 'a', 'wlan0', 'wlan0'), cable: 'wireless' });
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
  });
  it('negotiates the highest common configured port/media profile', () => {
    const n = pair();
    port(n).speeds = [100, 1000];
    port(n, 1).speeds = [10, 100];
    expect(physicalLinkState(n, n.links[0])).toMatchObject({ up: true, speedMbps: 100 });
    port(n).speedMbps = 1000;
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
  });
  it('reports duplex mismatch as degradation rather than a fictitious unplugged link', () => {
    const n = pair();
    Object.assign(port(n), { speedMbps: 100, duplex: 'full' });
    const state = physicalLinkState(n, n.links[0]);
    expect(state.up).toBe(true);
    expect(state.warnings.join(' ')).toContain('Duplex mismatch');
    expect(diagnoseNetwork(n).some((d) => d.code === 'link-degraded')).toBe(true);
  });
  it('enforces disabled ports in DHCP and the packet path', () => {
    const n = pair();
    port(n).enabled = false;
    const result = simulateNetwork(n, ping);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('wyłączony');
    expect(diagnoseNetwork(n).some((d) => d.code === 'link-down')).toBe(true);
  });
  it.each(['cat5e', 'cat6', 'cat6a'] as const)(
    'enforces the 100 m channel budget for %s',
    (cable) => {
      const n = pair();
      n.links[0].cable = cable;
      n.links[0].lengthMeters = 100;
      expect(physicalLinkState(n, n.links[0]).up).toBe(true);
      n.links[0].lengthMeters = 100.1;
      expect(physicalLinkState(n, n.links[0]).up).toBe(false);
    },
  );
  it('limits Cat 6 to a compliant slower profile beyond 55 m, and honors forced speed', () => {
    const n = pair();
    for (const d of n.devices) d.ports![0].speeds = [1000, 10000];
    n.links[0].lengthMeters = 60;
    expect(physicalLinkState(n, n.links[0]).speedMbps).toBe(1000);
    for (const d of n.devices) d.ports![0].speedMbps = 10000;
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
    n.links[0].cable = 'cat6a';
    expect(physicalLinkState(n, n.links[0]).speedMbps).toBe(10000);
  });
  it.each([
    ['om3', '10g-sr', 300],
    ['om4', '10g-sr', 400],
    ['os2', '10g-lr', 10000],
    ['om3', '1g-sx', 550],
    ['os2', '1g-lx', 10000],
  ] as const)('checks %s optics %s against its %i m profile', (cable, module, limit) => {
    const n = pair();
    for (const d of n.devices) d.ports = [{ ...makePort('eth0', 'sfp+', 10), module }];
    Object.assign(n.links[0], { cable, lengthMeters: limit });
    expect(physicalLinkState(n, n.links[0]).up).toBe(true);
    n.links[0].lengthMeters = limit + 1;
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
  });
  it('rejects missing optics, mismatched optics and an incompatible fiber', () => {
    const n = pair();
    for (const d of n.devices) d.ports = [makePort('eth0', 'sfp+', 10)];
    n.links[0].cable = 'om3';
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
    port(n).module = '10g-sr';
    port(n, 1).module = '10g-lr';
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
    port(n, 1).module = '10g-sr';
    n.links[0].cable = 'os2';
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
  });
  it('supports the passive DAC profile without optical modules', () => {
    const n = pair();
    for (const d of n.devices) d.ports = [makePort('eth0', 'sfp+', 10)];
    Object.assign(n.links[0], { cable: 'dac', lengthMeters: 7 });
    expect(physicalLinkState(n, n.links[0])).toMatchObject({ up: true, speedMbps: 10000 });
    n.links[0].lengthMeters = 8;
    expect(physicalLinkState(n, n.links[0]).up).toBe(false);
  });
});

describe('independent 802.1Q endpoints', () => {
  function trunks() {
    const n = pair();
    for (const d of n.devices) {
      d.kind = 'switch';
      d.ports = [
        { ...makePort('eth0'), mode: 'trunk', nativeVlan: 10, allowedVlans: [10, 20, 30] },
      ];
    }
    return n;
  }
  it('preserves tagged traffic through a native VLAN mismatch but maps untagged traffic to the receiver PVID', () => {
    const n = trunks();
    port(n, 1).nativeVlan = 20;
    expect(transferVlan(n, n.links[0], 'a', 30)).toEqual({ vlan: 30 });
    expect(transferVlan(n, n.links[0], 'a', 10)).toEqual({ vlan: 20 });
    expect(transferVlan(n, n.links[0], 'b', 20)).toEqual({ vlan: 10 });
    const issues = diagnoseNetwork(n);
    expect(issues.some((d) => d.code === 'native-mismatch')).toBe(true);
    expect(issues.some((d) => d.code === 'link-down')).toBe(false);
  });
  it('supports explicit native tagging and allowed VLAN lists on either endpoint', () => {
    const n = trunks();
    port(n, 1).nativeVlan = 20;
    port(n).tagNative = true;
    expect(transferVlan(n, n.links[0], 'a', 10)).toEqual({ vlan: 10 });
    port(n, 1).allowedVlans = [20];
    expect(transferVlan(n, n.links[0], 'a', 10).error).toContain('odfiltrowany');
  });
  it('connects an untagged access endpoint to a matching native VLAN', () => {
    const n = trunks();
    Object.assign(port(n), { mode: 'access', accessVlan: 10 });
    expect(transferVlan(n, n.links[0], 'a', 10)).toEqual({ vlan: 10 });
    expect(transferVlan(n, n.links[0], 'b', 30).error).toContain('tagowana');
  });
});

describe('PoE class reservations and operational state', () => {
  function poeNetwork(): Network {
    const n = pair();
    n.devices = [
      {
        ...device('sw', 'switch'),
        poeBudgetWatts: 30,
        ports: [0, 1].map((i) => ({ ...makePort(`eth${i}`, 'rj45', 10), poe: 'at' as const })),
      },
      ...['a', 'b'].map((id, i) => ({
        ...device(id, 'camera', `192.168.10.${i + 3}`),
        ports: [makePort('eth0', 'rj45', 10)],
        powerSource: 'poe' as const,
        powerWatts: 12,
      })),
    ];
    n.links = ['a', 'b'].map((id, i) => wire('sw', id, `eth${i}`, 'eth0'));
    return n;
  }
  it('reserves PSE class power, not just the consumer wattage, without changing the saved online flag', () => {
    const n = poeNetwork();
    const hw = hardwareState(n);
    expect(hw.poe.get('sw')?.allocated).toBe(15.4);
    expect([...hw.powered].filter(([id, on]) => id !== 'sw' && on)).toHaveLength(1);
    expect(hw.powerErrors.get('b')).toContain('budżet');
    expect(n.devices.find((d) => d.id === 'b')?.online).toBe(true);
    expect(hardwareState({ ...n, devices: n.devices.slice().reverse() }).powered).toEqual(
      hw.powered,
    );
  });
  it('restores data access after increasing the budget without toggling the consumer', () => {
    const n = poeNetwork();
    expect(simulateNetwork(n, ping).ok).toBe(false);
    n.devices[0].poeBudgetWatts = 30.8;
    expect(simulateNetwork(n, ping).ok).toBe(true);
    expect(hardwareState(n).poe.get('sw')?.allocated).toBe(30.8);
  });
  it('enforces guaranteed PD power and PSE standards at class boundaries', () => {
    const n = poeNetwork();
    n.devices[0].poeBudgetWatts = 100;
    n.devices[0].ports![0].poe = 'af';
    n.devices[1].powerWatts = 12.95;
    expect(hardwareState(n).powered.get('a')).toBe(true);
    n.devices[1].powerWatts = 12.96;
    expect(hardwareState(n).powered.get('a')).toBe(false);
    n.devices[0].ports![0].poe = 'at';
    n.devices[1].powerWatts = 25.5;
    expect(hardwareState(n).powered.get('a')).toBe(true);
    n.devices[1].powerWatts = 25.6;
    expect(hardwareState(n).powered.get('a')).toBe(false);
  });
  it('does not send PoE through fiber or an overlong copper channel', () => {
    const n = poeNetwork();
    n.links[0].cable = 'os2';
    expect(hardwareState(n).powered.get('a')).toBe(false);
    n.links[0].cable = 'cat6';
    n.links[0].lengthMeters = 101;
    expect(hardwareState(n).powered.get('a')).toBe(false);
  });
  it('allows an unpowered DHCP client to recover once PoE is available', () => {
    const n = poeNetwork();
    n.devices[1].ipMode = 'auto';
    n.devices[1].ip = '';
    n.devices[0].poeBudgetWatts = 0;
    n.devices[0].kind = 'switch-l3';
    Object.assign(n.vlans[0], { gatewayDeviceId: 'sw', dhcpEnabled: true, dhcpServerId: 'sw' });
    expect(reconcileDhcp(n).devices[1].ip).toBe('');
    n.devices[0].poeBudgetWatts = 60;
    expect(reconcileDhcp(n).devices[1].lease?.serverId).toBe('sw');
  });
});

it('rejects malformed hardware imports instead of accepting invalid port and NIC values', () => {
  const n = pair();
  (port(n) as Port).speeds = [];
  expect(() => parseNetwork(JSON.stringify(n))).toThrow('prędkości');
});

it('uses Type 3/4 class boundaries and rejects power above the supported PD profile', () => {
  const n = pair();
  n.devices[0].kind = 'switch';
  port(n).poe = 'bt3';
  n.devices[0].poeBudgetWatts = 100;
  n.devices[1].powerSource = 'poe';
  n.devices[1].powerWatts = 51;
  expect(hardwareState(n).powered.get('b')).toBe(true);
  n.devices[1].powerWatts = 51.1;
  expect(hardwareState(n).powered.get('b')).toBe(false);
  port(n).poe = 'bt4';
  n.devices[1].powerWatts = 71.3;
  expect(hardwareState(n).powered.get('b')).toBe(true);
  n.devices[1].powerWatts = 71.31;
  expect(hardwareState(n).powered.get('b')).toBe(false);
});
it('keeps the shipped laboratory physically valid after migration, including the guest AP ports', async () => {
  const { createDemoNetwork } = await import('../examples/demoNetwork');
  const n = createDemoNetwork();
  expect(diagnoseNetwork(n).filter((d) => d.severity === 'error')).toEqual([]);
  expect(
    n.devices.find((d) => d.id === 'demo-guest-ap')!.ports!.filter((p) => p.connector === 'rj45'),
  ).toHaveLength(2);
});

it('selects the cable carrying the packet VLAN when two switches have parallel links', () => {
  const n = pair();
  for (const id of ['s1', 's2'])
    n.devices.push({
      ...device(id, 'switch', id === 's1' ? '192.168.10.253' : '192.168.10.254'),
      ports: ['host', 'wrong', 'right'].map((p) => makePort(p, 'rj45', p === 'wrong' ? 20 : 10)),
    });
  n.links = [
    wire('a', 's1', 'eth0', 'host'),
    wire('s1', 's2', 'wrong', 'wrong'),
    wire('s1', 's2', 'right', 'right'),
    wire('s2', 'b', 'host', 'eth0'),
  ];
  n.links.forEach((l, i) => (l.id = `cable-${i}`));
  const result = simulateNetwork(n, ping);
  expect(result.ok, result.reason).toBe(true);
  expect(result.linkPath).toEqual(['cable-0', 'cable-2', 'cable-3']);
  expect(result.returnLinkPath).toEqual(['cable-3', 'cable-2', 'cable-0']);
});

it('permits 5GBASE-T over Cat 5e with an explicit qualification warning', () => {
  const n = pair();
  n.links[0].cable = 'cat5e';
  for (const d of n.devices) d.ports![0].speeds = [1000, 2500, 5000];
  const state = physicalLinkState(n, n.links[0]);
  expect(state).toMatchObject({ up: true, speedMbps: 5000 });
  expect(state.warnings.join(' ')).toContain('kwalifikacji');
});
