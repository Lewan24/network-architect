import { describe, expect, it } from 'vitest';
import { ExampleBuilder } from '../examples/exampleBuilder';
import { defaultPorts, makePort, transferVlan } from '../model/ports';
import { reconcileDhcp, discoverDhcp } from '../model/dhcp';
import { parseNetwork, validateDeviceConfig } from '../model/network';
import { diagnoseNetwork } from '../model/diagnostics';
import { wirelessAssociation } from '../model/wifi';
import { simulateNetwork } from '../simulation/networkEngine';
import { removeVlan, vlanReferences } from '../project/vlanEditing';
import type { Probe } from '../model/networkTypes';

function fixture() {
  const b = new ExampleBuilder('ppsk', 'PPSK', [
    [10, 'Staff'],
    [30, 'Printers'],
    [40, 'Management'],
    [15, 'Guest'],
  ]);
  const ap = b.host('ap', 'accesspoint', 40, 2, 0, 0, 'AP');
  ap.ssid = 'Lab';
  ap.wifiVlan = 10;
  ap.wifiPpsk = [
    { id: 'staff', name: 'Staff', password: 'staff-test-123', vlan: 10, enabled: true },
    { id: 'printers', name: 'Printers', password: 'print-test-123', vlan: 30, enabled: true },
  ];
  ap.wifiNetworks = [{ id: 'guest', ssid: 'Guest', vlan: 15 }];
  ap.ports = defaultPorts(ap);
  b.connect(b.core, ap, [10, 30, 40, 15]);
  const staff = b.host('staff', 'laptop', 10, undefined, 0, 0, 'Staff');
  staff.ports!.find((p) => p.id === 'wlan0')!.wifiPassword = 'staff-test-123';
  b.connect(ap, staff, 10);
  const printer = b.host('printer', 'printer', 10, undefined, 0, 0, 'Printer');
  printer.ports!.push({ ...makePort('wlan0', 'wifi', 10), wifiPassword: 'print-test-123' });
  b.network.links.push({
    id: 'printer-wifi',
    a: ap.id,
    b: printer.id,
    aPortId: 'radio0',
    bPortId: 'wlan0',
    cable: 'wireless',
  });
  const peer = b.host('peer', 'workstation', 30, 10, 0, 0, 'Printer peer');
  b.connect(b.core, peer, 30);
  const guest = b.host('guest', 'mobile-phone', 15, undefined, 0, 0, 'Guest');
  const guestLink = b.connect(ap, guest, 15);
  guestLink.aPortId = 'ssid:guest';
  b.fw.defaultAcl = 'allow';
  return { b, ap, staff, printer, peer, guest, guestLink };
}
const probe = (source: string, destination: string): Probe => ({
  source,
  destination,
  protocol: 'ICMP',
  port: 0,
  checkReply: true,
});

describe('PPSK association and forwarding', () => {
  it('uses different passwords for two VLANs on one SSID, including printers, with independent management and guest SSID', () => {
    const { b, ap, staff, printer, peer, guest } = fixture();
    const n = reconcileDhcp(b.network);
    const get = (id: string) => n.devices.find((d) => d.id === id)!;
    expect(get(printer.id).lease).toMatchObject({ vlan: 30, gateway: '192.168.30.1' });
    expect(get(staff.id).lease?.vlan).toBe(10);
    expect(get(guest.id).lease?.vlan).toBe(15);
    expect(get(ap.id).vlan).toBe(40);
    for (const [from, to] of [
      [staff.id, printer.id],
      [printer.id, peer.id],
      [peer.id, printer.id],
    ]) {
      const r = simulateNetwork(n, probe(from, to));
      expect(r.ok, r.reason).toBe(true);
    }
    expect(simulateNetwork(n, probe(printer.id, '192.168.30.1')).ok).toBe(true);
    expect(parseNetwork(JSON.stringify(n)).devices.find((d) => d.id === ap.id)?.wifiPpsk).toEqual(
      ap.wifiPpsk,
    );
  });
  it.each(['wrong', 'missing', 'disabled', 'deleted', 'empty-profile'])(
    'rejects %s credentials, clears a valid DHCP lease and prevents static-IP bypass',
    (mode) => {
      const { b, ap, printer, peer } = fixture();
      let n = reconcileDhcp(b.network);
      const client = n.devices.find((d) => d.id === printer.id)!;
      const accessPoint = n.devices.find((d) => d.id === ap.id)!;
      if (mode === 'wrong')
        client.ports!.find((p) => p.id === 'wlan0')!.wifiPassword = 'wrong-test-key';
      if (mode === 'missing') delete client.ports!.find((p) => p.id === 'wlan0')!.wifiPassword;
      if (mode === 'disabled') accessPoint.wifiPpsk![1].enabled = false;
      if (mode === 'deleted') accessPoint.wifiPpsk!.pop();
      if (mode === 'empty-profile') accessPoint.wifiPpsk = [];
      const failed = reconcileDhcp(n).devices.find((d) => d.id === printer.id)!;
      expect(failed.ip).toBe('');
      expect(failed.lease).toBeUndefined();
      expect(discoverDhcp(n, client).message).toContain('PPSK');
      expect(simulateNetwork(n, probe(printer.id, peer.id)).ok).toBe(false);
      expect(
        diagnoseNetwork(n).some((d) => d.code === 'wifi-access-denied' && d.deviceId === client.id),
      ).toBe(true);
      client.ipMode = 'static';
      client.ip = '192.168.30.90';
      client.vlan = 30;
      expect(simulateNetwork(n, probe(client.id, peer.id)).ok).toBe(false);
    },
  );
  it('changes membership and DHCP when a client changes password and retains leases when configuration is unchanged', () => {
    const { b, printer } = fixture();
    let n = reconcileDhcp(b.network);
    const old = n.devices.find((d) => d.id === printer.id)!;
    expect(reconcileDhcp(n).devices.find((d) => d.id === printer.id)?.lease).toEqual(old.lease);
    old.ports!.find((p) => p.id === 'wlan0')!.wifiPassword = 'staff-test-123';
    const changed = reconcileDhcp(n).devices.find((d) => d.id === printer.id)!;
    expect(changed.vlan).toBe(10);
    expect(changed.lease?.vlan).toBe(10);
    expect(changed.ip).toMatch(/^192\.168\.10\./);
  });
  it('preserves an explicitly configured static IP but derives VLAN from PPSK and reports a subnet mismatch', () => {
    const { b, printer, peer } = fixture();
    printer.ipMode = 'static';
    printer.ip = '192.168.10.50';
    const n = reconcileDhcp(b.network),
      client = n.devices.find((d) => d.id === printer.id)!;
    expect(client.vlan).toBe(30);
    expect(client.ip).toBe('192.168.10.50');
    expect(simulateNetwork(n, probe(client.id, peer.id)).ok).toBe(false);
  });
  it('requires the assigned VLAN on the AP uplink and rejects manually forged VLANs', () => {
    const { b, ap, printer } = fixture();
    ap.ports!.find((p) => p.id === 'eth0')!.allowedVlans = [10, 40, 15];
    expect(
      reconcileDhcp(b.network).devices.find((d) => d.id === printer.id)?.lease,
    ).toBeUndefined();
    const link = b.network.links.find((l) => l.id === 'printer-wifi')!;
    expect(transferVlan(b.network, link, printer.id, 10).error).toContain('PPSK');
  });
  it('configures PPSK independently on an additional SSID without inheriting the default SSID key list', () => {
    const { b, ap, guest, guestLink } = fixture();
    ap.wifiNetworks![0].ppsk = [
      { id: 'guest-key', name: 'Guest key', password: 'guest-test-123', vlan: 30, enabled: true },
    ];
    guest.ports![0].wifiPassword = 'staff-test-123';
    expect(wirelessAssociation(b.network, guestLink)?.error).toContain('PPSK');
    guest.ports![0].wifiPassword = 'guest-test-123';
    expect(reconcileDhcp(b.network).devices.find((d) => d.id === guest.id)?.lease?.vlan).toBe(30);
  });
  it('applies membership per Wi-Fi adapter on a multi-homed host', () => {
    const { b, staff } = fixture();
    staff.interfaces = [
      {
        id: 'eth',
        name: 'Ethernet',
        portId: 'eth0',
        enabled: true,
        vlan: 40,
        ip: '',
        ipMode: 'auto',
        prefix: 24,
        gateway: '192.168.40.1',
        metric: 10,
      },
      {
        id: 'wifi',
        name: 'Wi-Fi',
        portId: 'wlan0',
        enabled: true,
        vlan: 40,
        ip: '',
        ipMode: 'auto',
        prefix: 24,
        gateway: '192.168.40.1',
        metric: 20,
      },
    ];
    b.connect(b.core, staff, 40);
    const client = reconcileDhcp(b.network).devices.find((d) => d.id === staff.id)!;
    expect(client.interfaces![0].vlan).toBe(40);
    expect(client.interfaces![1].vlan).toBe(10);
    expect(client.interfaces![1].lease?.vlan).toBe(10);
  });
});

describe('PPSK validation and project editing', () => {
  it('handles equivalent HEX PSKs and rejects duplicate binary keys', () => {
    const { b, ap, printer } = fixture();
    ap.wifiPpsk![1].password = 'ab'.repeat(32);
    printer.ports!.find((p) => p.id === 'wlan0')!.wifiPassword = 'AB'.repeat(32);
    expect(reconcileDhcp(b.network).devices.find((d) => d.id === printer.id)?.lease?.vlan).toBe(30);
    ap.wifiPpsk![0].password = 'AB'.repeat(32);
    expect(() => validateDeviceConfig(ap, b.network)).toThrow();
  });
  it('reassigns a live key to another VLAN and restores fixed SSID membership when PPSK is disabled', () => {
    const { b, ap, printer } = fixture();
    const n = reconcileDhcp(b.network);
    const accessPoint = n.devices.find((d) => d.id === ap.id)!;
    accessPoint.wifiPpsk![1].vlan = 15;
    const changed = reconcileDhcp(n);
    expect(changed.devices.find((d) => d.id === printer.id)?.lease?.vlan).toBe(15);
    delete changed.devices.find((d) => d.id === ap.id)!.wifiPpsk;
    expect(reconcileDhcp(changed).devices.find((d) => d.id === printer.id)?.lease?.vlan).toBe(10);
  });

  it('validates key uniqueness, lengths, VLAN references and incompatible AAA modes', () => {
    for (const mutation of ['duplicate', 'short', 'vlan', 'enterprise', 'mab'] as const) {
      const { b, ap } = fixture();
      if (mutation === 'duplicate') ap.wifiPpsk![1].password = ap.wifiPpsk![0].password;
      if (mutation === 'short') ap.wifiPpsk![0].password = 'short';
      if (mutation === 'vlan') ap.wifiPpsk![0].vlan = 4094;
      if (mutation === 'enterprise') ap.wifiEnterprise = true;
      if (mutation === 'mab')
        ap.radiusNas = {
          serverId: '',
          secret: 'test',
          accounting: false,
          dynamicVlan: true,
          mab: true,
        };
      expect(() => validateDeviceConfig(ap, b.network)).toThrow();
    }
  });
  it('removes VLAN references without silently disabling PPSK and opening the SSID', () => {
    const { b, ap, guest, guestLink } = fixture();
    ap.wifiNetworks![0].ppsk = [
      { id: 'g', name: 'Guest', password: 'guest-test-123', vlan: 30, enabled: true },
    ];
    guest.ports![0].wifiPassword = 'guest-test-123';
    expect(vlanReferences(b.network, 30)).toContain('hasła PPSK');
    const n = removeVlan(b.network, 30);
    const accessPoint = n.devices.find((d) => d.id === ap.id)!;
    expect(accessPoint.wifiNetworks![0].ppsk).toEqual([]);
    expect(accessPoint.wifiPpsk).toHaveLength(1);
    expect(wirelessAssociation(n, guestLink)?.error).toContain('PPSK');
    expect(() => parseNetwork(JSON.stringify(n))).not.toThrow();
  });
});

// A stable reference topology is independent of user-owned project exports.
import ppskReference from './fixtures/ppskNetwork.json';
describe('PPSK reference topology', () => {
  it('imports and enforces staff printing, guest isolation and the printer VLAN on one SSID', () => {
    const n = reconcileDhcp(parseNetwork(JSON.stringify(ppskReference)));
    const ap = n.devices.find((d) => d.name === 'AP PPSK')!;
    const printer = n.devices.find((d) => d.name === 'Drukarka')!;
    const staff = n.devices.find((d) => d.name === 'Pracownik')!;
    expect(printer.lease?.vlan).toBe(30);
    expect(staff.lease?.vlan).toBe(10);
    expect(ap.vlan).toBe(40);
    for (const scenario of n.scenarios!.filter((s) => s.id.startsWith('ppsk-'))) {
      const r = simulateNetwork(n, scenario.probe);
      expect(r.ok, `${scenario.name}: ${r.reason}`).toBe(scenario.expected);
    }
    const print = simulateNetwork(n, {
      source: staff.id,
      destination: printer.id,
      protocol: 'TCP',
      port: 631,
      checkReply: true,
    });
    expect(print.steps.join(' ')).toContain('PPSK');
    expect(print.steps.join(' ')).not.toContain('lab-staff-test-123');
  });
});
