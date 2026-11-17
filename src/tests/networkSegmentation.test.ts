import { describe, expect, it } from 'vitest';
import { ExampleBuilder } from '../examples/exampleBuilder';
import { defaultPorts, transferVlan } from '../model/ports';
import { reconcileDhcp } from '../model/dhcp';
import { parseNetwork } from '../model/network';
import { randomMac, validMac } from '../model/mac';
import { simulateNetwork } from '../simulation/networkEngine';

function wireless() {
  const b = new ExampleBuilder('seg', 'Segmentation', [
    [10, 'Staff'],
    [20, 'Guest'],
    [40, 'Management'],
  ]);
  const ap = b.host('ap', 'accesspoint', 40, 2, 0, 0, 'AP');
  ap.wifiVlan = 10;
  ap.wifiNetworks = [{ id: 'guest', ssid: 'Guest', vlan: 20 }];
  ap.ports = defaultPorts(ap);
  b.connect(b.core, ap, [10, 20, 40]);
  const staff = b.host('staff', 'laptop', 10, undefined, 0, 0, 'Staff');
  const guest = b.host('guest', 'laptop', 20, undefined, 0, 0, 'Guest');
  b.connect(ap, staff, 10);
  const link = b.connect(ap, guest, 20);
  link.aPortId = 'ssid:guest';
  const wired = b.host('wired', 'workstation', 10, undefined, 0, 0, 'Wired');
  b.connect(b.core, wired, 10);
  b.fw.defaultAcl = 'allow';
  return { b, ap, staff, guest, wired };
}
const probe = (source: string, destination: string, port = 0) => ({
  source,
  destination,
  protocol: port ? ('TCP' as const) : ('ICMP' as const),
  port,
  checkReply: true,
});

describe('independent management and client VLANs', () => {
  it('bridges two SSIDs to separate DHCP domains and reaches wired peers and gateway', () => {
    const { b, ap, staff, guest, wired } = wireless();
    staff.vlan = 40; // Auto clients learn membership from association.
    const n = reconcileDhcp(b.network);
    expect(n.devices.find((d) => d.id === staff.id)?.lease?.vlan).toBe(10);
    expect(n.devices.find((d) => d.id === guest.id)?.lease?.vlan).toBe(20);
    expect(n.devices.find((d) => d.id === ap.id)?.vlan).toBe(40);
    expect(simulateNetwork(n, probe(staff.id, wired.id)).ok).toBe(true);
    expect(simulateNetwork(n, probe(wired.id, staff.id)).ok).toBe(true);
    expect(simulateNetwork(n, probe(staff.id, '192.168.10.1')).ok).toBe(true);
    expect(
      parseNetwork(JSON.stringify(n)).devices.find((d) => d.id === ap.id)?.wifiNetworks,
    ).toEqual(ap.wifiNetworks);
  });
  it('bridges through an L3 switch to the actual gateway without requiring transit SVIs', () => {
    const { b, staff, guest } = wireless();
    b.core.kind = 'switch-l3';
    b.core.defaultAcl = 'deny'; // A routing ACL must not filter an L2 transit segment.
    const n = reconcileDhcp(b.network);
    for (const source of [staff.id, guest.id]) {
      const result = simulateNetwork(n, probe(source, b.internet.id));
      expect(result.ok, result.reason).toBe(true);
      expect(result.path).toContain(b.fw.id);
      expect(result.steps.join(' ')).toContain('Przełączanie L2');
    }
    expect(simulateNetwork(n, probe(staff.id, guest.id)).ok).toBe(true);
  });
  it('requires the SSID VLAN on the uplink and rejects a different VLAN on that SSID', () => {
    const { b, ap, guest } = wireless();
    ap.ports!.find((p) => p.id === 'eth0')!.allowedVlans = [10, 40];
    expect(reconcileDhcp(b.network).devices.find((d) => d.id === guest.id)?.lease).toBeUndefined();
    const link = b.network.links.find((l) => l.b === guest.id)!;
    expect(transferVlan(b.network, link, guest.id, 10).error).toBeTruthy();
  });
});

describe('MAC authentication bypass', () => {
  it('assigns an administrator VLAN without a supplicant and rejects unknown MACs', () => {
    const b = new ExampleBuilder('mab', 'MAB', [
      [10, 'Staff'],
      [20, 'Admin'],
      [30, 'IoT'],
    ]);
    const n = b.finish();
    const get = (key: string) => n.devices.find((d) => d.id === `mab-aaa-${key}`)!;
    const client = get('laptop');
    const nas = get('ap');
    const server = get('radius');
    nas.radiusNas!.mab = true;
    nas.wifiEnterprise = false;
    client.mac = '02:ab:cd:ef:01:23';
    client.supplicant = undefined;
    const admin = server.radius!.users.find((u) => u.username === 'admin')!;
    admin.mac = client.mac;
    admin.allowedNasIds = []; // Policy is portable across registered NAS devices.
    admin.password = '';
    const accepted = reconcileDhcp(n);
    expect(accepted.devices.find((d) => d.id === client.id)?.accessSession).toMatchObject({
      state: 'accepted',
      vlan: 20,
    });
    expect(accepted.devices.find((d) => d.id === client.id)?.lease?.vlan).toBe(20);
    expect(reconcileDhcp(accepted).devices.find((d) => d.id === client.id)?.lease).toEqual(
      accepted.devices.find((d) => d.id === client.id)?.lease,
    );
    expect(() => parseNetwork(JSON.stringify(accepted))).not.toThrow();
    // The same MAC policy follows the device from Wi-Fi to a controlled switch access port.
    const nasSwitch = get('nas');
    nasSwitch.radiusNas!.mab = true;
    const iotLink = n.links.find((l) => l.a === nasSwitch.id && l.b === get('iot').id)!;
    const wirelessLink = n.links.find((l) => l.b === client.id)!;
    n.links = n.links.filter((l) => l.id !== wirelessLink.id);
    iotLink.b = client.id;
    const ethernet = client.ports!.find((p) => p.connector === 'rj45')!;
    ethernet.enabled = true;
    iotLink.bPortId = ethernet.id;
    const roamed = reconcileDhcp(n).devices.find((d) => d.id === client.id)!;
    expect(roamed.accessSession).toMatchObject({
      state: 'accepted',
      vlan: 20,
      nasId: nasSwitch.id,
    });
    expect(roamed.lease?.vlan).toBe(20);
    client.mac = '02:ab:cd:ef:01:24';
    expect(reconcileDhcp(n).devices.find((d) => d.id === client.id)?.accessSession?.state).toBe(
      'rejected',
    );
  });
  it('generates locally administered unicast addresses', () => {
    const macs = Array.from({ length: 100 }, randomMac);
    expect(new Set(macs).size).toBe(100);
    expect(macs.every((m) => validMac(m) && (parseInt(m.slice(0, 2), 16) & 3) === 2)).toBe(true);
  });
});

describe('VM interface firewall', () => {
  it('filters same-VLAN traffic without requiring a router', () => {
    const b = new ExampleBuilder('vmfilter', 'VM firewall', [[10, 'LAN']]);
    const host = b.host('host', 'server', 99, 8, 0, 0, 'Hypervisor');
    host.serverRole = 'hypervisor';
    b.connect(b.core, host, [10, 99]);
    const vm = b.host('vm', 'vm', 10, 20, 0, 0, 'VM');
    vm.hostId = host.id;
    const admin = b.host('admin', 'workstation', 10, 21, 0, 0, 'Admin');
    const other = b.host('other', 'workstation', 10, 22, 0, 0, 'Other');
    b.connect(b.core, admin, 10);
    b.connect(b.core, other, 10);
    expect(simulateNetwork(b.network, probe(other.id, vm.id)).ok).toBe(true);
    vm.defaultAcl = 'deny';
    vm.rules = [
      {
        id: 'admin',
        action: 'allow',
        protocol: 'ICMP',
        port: '*',
        source: `device:${admin.id}`,
        destination: '*',
      },
    ];
    expect(simulateNetwork(b.network, probe(admin.id, vm.id)).ok).toBe(true);
    const denied = simulateNetwork(b.network, probe(other.id, vm.id));
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain('ACL');
    vm.services = [443, 22].map((port) => ({
      id: String(port),
      name: String(port),
      protocol: 'TCP',
      port,
      enabled: true,
    }));
    vm.rules.push({
      id: 'https-admin',
      action: 'allow',
      protocol: 'TCP',
      port: '443',
      source: `device:${admin.id}`,
      destination: '*',
    });
    expect(simulateNetwork(b.network, probe(admin.id, vm.id, 443)).ok).toBe(true);
    expect(simulateNetwork(b.network, probe(admin.id, vm.id, 22)).ok).toBe(false);
    expect(simulateNetwork(b.network, probe(other.id, vm.id, 443)).ok).toBe(false);
    // Established responses are allowed for connections initiated by the VM.
    expect(simulateNetwork(b.network, probe(vm.id, other.id)).ok).toBe(true);
  });
});
