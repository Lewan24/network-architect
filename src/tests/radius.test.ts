import { describe, expect, it } from 'vitest';
import { ExampleBuilder } from '../examples/exampleBuilder';
import { miniLab } from '../examples/miniLabs';
import { reconcileDhcp } from '../model/dhcp';
import { parseNetwork, validateDeviceConfig } from '../model/network';
import { simulateNetwork } from '../simulation/networkEngine';
import { removeNetworkObject } from '../project/projectActions';
import { defaultServices } from '../devices/deviceCatalog';

function fixture() {
  return new ExampleBuilder('aaa-test', 'AAA', [
    [10, 'Pracownicy'],
    [20, 'Usługi'],
    [30, 'IoT'],
  ]).finish();
}
const get = (n: ReturnType<typeof fixture>, key: string) =>
  n.devices.find((d) => d.id === `aaa-test-aaa-${key}`)!;
const probe = {
  source: 'aaa-test-aaa-laptop',
  destination: 'aaa-test-aaa-mini',
  protocol: 'TCP' as const,
  port: 443,
  checkReply: true,
};

describe('RADIUS authentication, authorization and VLAN assignment', () => {
  it('assigns different VLANs on the same SSID and gets the correct DHCP options', () => {
    const n = fixture();
    expect(get(n, 'laptop').accessSession).toMatchObject({
      state: 'accepted',
      baseVlan: 10,
      vlan: 20,
      accounting: 'recorded',
    });
    expect(get(n, 'staff').accessSession).toMatchObject({ state: 'accepted', vlan: 10 });
    expect(get(n, 'iot').accessSession).toMatchObject({ state: 'accepted', vlan: 30 });
    for (const [key, vlan] of [
      ['laptop', 20],
      ['staff', 10],
      ['iot', 30],
    ] as const) {
      expect(get(n, key).lease?.vlan).toBe(vlan);
      expect(get(n, key).ip.startsWith(`192.168.${vlan}.`)).toBe(true);
    }
    expect(simulateNetwork(n, probe).ok).toBe(true);
    expect(simulateNetwork(n, { ...probe, source: 'aaa-test-aaa-staff' }).ok).toBe(false);
  });
  it.each([
    'password',
    'unknown-user',
    'disabled',
    'unauthorized',
    'nas-policy',
    'secret',
    'unregistered',
  ])('rejects %s and clears a previously valid lease', (reason) => {
    const n = fixture(),
      client = get(n, 'laptop'),
      server = get(n, 'radius'),
      nas = get(n, 'ap');
    const account = server.radius!.users.find((u) => u.username === 'admin')!;
    if (reason === 'password') client.supplicant!.password = 'wrong';
    if (reason === 'unknown-user') client.supplicant!.username = 'missing';
    if (reason === 'disabled') account.enabled = false;
    if (reason === 'unauthorized') account.authorized = false;
    if (reason === 'nas-policy') account.allowedNasIds = [get(n, 'nas').id];
    if (reason === 'secret') nas.radiusNas!.secret = 'wrong';
    if (reason === 'unregistered')
      server.radius!.clients = server.radius!.clients.filter((c) => c.nasId !== nas.id);
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').accessSession?.state).toBe('rejected');
    expect(get(next, 'laptop').ip).toBe('');
    expect(get(next, 'laptop').lease).toBeUndefined();
    expect(simulateNetwork(n, probe).ok).toBe(false);
  });
  it.each(['server', 'nas', 'service', 'cable'])(
    'fails closed when the %s is unavailable',
    (reason) => {
      const n = fixture();
      if (reason === 'server') get(n, 'radius').online = false;
      if (reason === 'nas') get(n, 'ap').online = false;
      if (reason === 'service')
        get(n, 'radius').services!.find((s) => s.port === 1812)!.enabled = false;
      if (reason === 'cable') {
        const wire = n.links.find((l) => l.b === get(n, 'ap').id)!;
        get(n, 'ap').ports!.find((p) => p.id === wire.bPortId)!.enabled = false;
      }
      expect(simulateNetwork(n, probe).ok).toBe(false);
      expect(get(reconcileDhcp(n), 'laptop').accessSession?.state).not.toBe('accepted');
    },
  );
  it('checks the real NAS-to-RADIUS ACL, including the response path', () => {
    const n = miniLab('radius', true).create();
    const fw = n.devices.find((d) => d.kind === 'gateway')!;
    fw.rules.unshift({
      id: 'deny-radius',
      action: 'deny',
      protocol: 'UDP',
      port: '1812',
      source: '*',
      destination: '*',
      ingress: 'any',
    });
    const client = n.devices.find((d) => d.id.endsWith('-client'))!;
    const next = reconcileDhcp(n);
    expect(next.devices.find((d) => d.id === client.id)?.accessSession?.reason).toContain('ACL');
    expect(next.devices.find((d) => d.id === client.id)?.ip).toBe('');
  });
  it('separates accounting availability from authorization', () => {
    const n = fixture();
    get(n, 'radius').services!.find((s) => s.port === 1813)!.enabled = false;
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').accessSession).toMatchObject({
      state: 'accepted',
      accounting: 'unavailable',
    });
    expect(simulateNetwork(n, probe).ok).toBe(true);
    get(n, 'ap').radiusNas!.accounting = false;
    expect(get(reconcileDhcp(n), 'laptop').accessSession?.accounting).toBe('disabled');
  });
  it('honors the SSID VLAN when dynamic assignment is disabled', () => {
    const n = fixture();
    get(n, 'ap').radiusNas!.dynamicVlan = false;
    get(n, 'ap').wifiVlan = 10;
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').accessSession?.vlan).toBe(10);
    expect(get(next, 'laptop').lease?.vlan).toBe(10);
  });
  it('renews the primary NIC options after dynamic VLAN assignment', () => {
    const n = fixture(),
      client = get(n, 'laptop');
    client.interfaces = [
      {
        id: 'wifi',
        name: 'Wi-Fi',
        portId: 'wlan0',
        enabled: true,
        vlan: 20,
        ip: client.ip,
        ipMode: 'auto',
        prefix: 24,
        gateway: '192.168.20.1',
        metric: 100,
        lease: client.lease,
      },
    ];
    get(n, 'radius').radius!.users.find((u) => u.username === 'admin')!.vlan = 30;
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').interfaces?.[0]).toMatchObject({
      vlan: 30,
      gateway: '192.168.30.1',
      prefix: 24,
    });
    expect(get(next, 'laptop').interfaces?.[0].ip.startsWith('192.168.30.')).toBe(true);
  });
  it('reauthenticates on credential changes, restores the base VLAN and prevents static-IP bypass', () => {
    const n = fixture();
    get(n, 'laptop').supplicant = undefined;
    Object.assign(get(n, 'laptop'), { ipMode: 'static', ip: '192.168.20.200' });
    expect(simulateNetwork(n, probe).ok).toBe(false);
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').vlan).toBe(10);
    expect(get(next, 'laptop').accessSession?.state).toBe('rejected');
  });
  it('recomputes an imported forged session rather than trusting it', () => {
    const n = fixture();
    get(n, 'laptop').supplicant!.password = 'wrong';
    const imported = parseNetwork(JSON.stringify(n));
    expect(get(imported, 'laptop').accessSession?.state).toBe('accepted');
    expect(simulateNetwork(imported, probe).ok).toBe(false);
  });
  it('requires the assigned VLAN on the NAS uplink before DHCP or traffic succeeds', () => {
    const n = fixture();
    get(n, 'radius').radius!.users.find((u) => u.username === 'admin')!.vlan = 30;
    const wire = n.links.find((l) => l.b === get(n, 'ap').id)!;
    for (const side of ['a', 'b'] as const)
      n.devices
        .find((d) => d.id === wire[side])!
        .ports!.find((p) => p.id === wire[`${side}PortId`])!.allowedVlans = [10, 20];
    const next = reconcileDhcp(n);
    expect(get(next, 'laptop').accessSession?.state).toBe('accepted');
    expect(get(next, 'laptop').ip).toBe('');
    expect(simulateNetwork(n, probe).ok).toBe(false);
  });
  it('does not leak credentials, duplicate stable events or mutate its input', () => {
    const n = fixture(),
      original = JSON.stringify(n);
    const next = reconcileDhcp(n);
    expect(next.radiusEvents?.length).toBe(n.radiusEvents?.length);
    expect(JSON.stringify(next.radiusEvents)).not.toContain('admin-demo');
    expect(JSON.stringify(next.radiusEvents)).not.toContain('lab-radius-secret');
    simulateNetwork(n, probe);
    expect(JSON.stringify(n)).toBe(original);
    expect(parseNetwork(JSON.stringify(n))).toEqual(n);
  });
  it('keeps server deletion fail-closed and removes NAS trust without granting wider authorization', () => {
    const n = fixture();
    const removed = reconcileDhcp(removeNetworkObject(n, get(n, 'radius').id));
    expect(simulateNetwork(removed, probe).ok).toBe(false);
    expect(() => parseNetwork(JSON.stringify(removed))).not.toThrow();
    const nasRemoved = removeNetworkObject(n, get(n, 'ap').id);
    expect(
      get(nasRemoved, 'radius').radius!.users.find((u) => u.username === 'admin')?.authorized,
    ).toBe(false);
    expect(() => parseNetwork(JSON.stringify(reconcileDhcp(nasRemoved)))).not.toThrow();
  });
  it('validates users, NAS references and port restrictions', () => {
    const n = fixture(),
      server = get(n, 'radius');
    server.radius!.users.push({ ...server.radius!.users[0], id: 'duplicate' });
    expect(() => validateDeviceConfig(server, n)).toThrow();
    const nas = get(n, 'nas');
    nas.ports!.find((p) => p.dot1x)!.mode = 'trunk';
    expect(() => validateDeviceConfig(nas, n)).toThrow();
    expect(defaultServices('radius')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocol: 'UDP', port: 1812 }),
        expect.objectContaining({ protocol: 'UDP', port: 1813 }),
      ]),
    );
  });
});
