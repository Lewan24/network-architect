import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { createNetworkDevice, createGuestDevice } from '../project/projectActions';
import { isDhcpServer, isHypervisor, parseNetwork, validateDeviceConfig } from '../model/network';
import { reconcileDhcp } from '../model/dhcp';
import { simulateNetwork } from '../simulation/networkEngine';
import { supportsInterfaces } from '../model/interfaces';

describe('additional device profiles', () => {
  it.each(['iot', 'laptop', 'nvr', 'mini-server', 'ups'] as const)(
    '%s does not forward transit traffic',
    (kind) => {
      const network = createDemoNetwork();
      const device = {
        ...createNetworkDevice(network, kind, { x: 0, y: 0 }),
        vlan: 10,
        ipMode: 'static' as const,
        ip: '192.168.10.250',
      };
      network.devices.push(device);
      network.links = network.links.filter((l) => l.a !== 'demo-pc' && l.b !== 'demo-pc');
      network.links.push(
        { id: 'pc-new', a: 'demo-pc', b: device.id },
        { id: 'new-switch', a: device.id, b: 'demo-lan-switch' },
      );
      expect(
        simulateNetwork(network, {
          source: 'demo-pc',
          destination: 'demo-dns',
          protocol: 'ICMP',
          port: 0,
        }).ok,
      ).toBe(false);
    },
  );
  it.each(['iot', 'laptop', 'nvr', 'mini-server', 'ups'] as const)(
    '%s supports DHCP and JSON round trips',
    (kind) => {
      let network = createDemoNetwork();
      const device = createNetworkDevice(network, kind, { x: 10, y: 10 });
      network.devices.push(device);
      network.links.push({ id: 'new-lan', a: device.id, b: 'demo-lan-switch', cable: 'cat6' });
      network = parseNetwork(JSON.stringify(reconcileDhcp(network)));
      const saved = network.devices.find((d) => d.id === device.id)!;
      expect(saved.kind).toBe(kind);
      expect(saved.lease?.ip).toBeTruthy();
      expect(saved.recorder).toEqual(device.recorder);
      expect(saved.ups).toEqual(device.ups);
      expect(supportsInterfaces(saved)).toBe(true);
      expect(
        simulateNetwork(network, {
          source: device.id,
          destination: 'demo-dns',
          protocol: 'ICMP',
          port: 0,
          checkReply: true,
        }).ok,
      ).toBe(true);
    },
  );
  it.each(['iot', 'laptop'] as const)('%s can join Wi-Fi', (kind) => {
    let network = createDemoNetwork();
    const device = { ...createNetworkDevice(network, kind, { x: 0, y: 0 }), vlan: 40 };
    network.devices.push(device);
    network.links.push({ id: 'new-wifi', a: device.id, b: 'demo-staff-ap' });
    network = parseNetwork(JSON.stringify(reconcileDhcp(network)));
    expect(network.devices.find((d) => d.id === device.id)?.lease?.vlan).toBe(40);
    expect(network.links.find((l) => l.id === 'new-wifi')?.cable).toBe('wireless');
  });
  it('supports services and virtualization on a mini server', () => {
    const network = createDemoNetwork();
    const host = {
      ...createNetworkDevice(network, 'mini-server', { x: 0, y: 0 }),
      serverRole: 'hypervisor' as const,
    };
    network.devices.push(host);
    expect(isHypervisor(host)).toBe(true);
    expect(isDhcpServer(host)).toBe(true);
    const guest = createGuestDevice(network, host);
    network.devices.push(guest);
    expect(guest.hostId).toBe(host.id);
    expect(() => validateDeviceConfig({ ...host, serverRole: 'server' }, network)).toThrow();
  });
  it('uses UDP for UPS SNMP and rejects invalid planning parameters', () => {
    const network = createDemoNetwork();
    const ups = createNetworkDevice(network, 'ups', { x: 0, y: 0 });
    expect(ups.services).toContainEqual(expect.objectContaining({ protocol: 'UDP', port: 161 }));
    expect(() =>
      validateDeviceConfig({ ...ups, ups: { ...ups.ups!, capacityWatts: 2000 } }),
    ).toThrow();
    const nvr = createNetworkDevice(network, 'nvr', { x: 0, y: 0 });
    expect(() =>
      validateDeviceConfig({ ...nvr, recorder: { ...nvr.recorder!, channels: 0 } }),
    ).toThrow();
  });
});
