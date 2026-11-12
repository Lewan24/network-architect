import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { createNetworkDevice } from '../project/projectActions';
import { reconcileDhcp } from '../model/dhcp';
import { parseNetwork } from '../model/network';
import { simulateNetwork } from '../simulation/networkEngine';

describe('mobile phone', () => {
  it('joins an AP as a DHCP client, survives JSON import and can send traffic', () => {
    let network = createDemoNetwork();
    const phone = { ...createNetworkDevice(network, 'mobile-phone', { x: 120, y: 800 }), vlan: 40 };
    expect(phone.ipMode).toBe('auto');
    network.devices.push(phone);
    network.links.push({ id: 'phone-ap', a: phone.id, b: 'demo-staff-ap' });
    network = parseNetwork(JSON.stringify(reconcileDhcp(network)));
    expect(network.devices.find((d) => d.id === phone.id)?.lease?.vlan).toBe(40);
    expect(
      simulateNetwork(network, {
        source: phone.id,
        destination: 'demo-dns',
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      }).ok,
    ).toBe(true);
  });
  it('does not forward transit traffic between other devices', () => {
    const network = createDemoNetwork();
    const phone = {
      ...createNetworkDevice(network, 'mobile-phone', { x: 0, y: 0 }),
      vlan: 10,
      ipMode: 'static' as const,
      ip: '192.168.10.250',
    };
    network.devices.push(phone);
    // Put the phone between the existing PC and switch as the only physical path.
    network.links = network.links.filter((l) => l.a !== 'demo-pc' && l.b !== 'demo-pc');
    network.links.push(
      { id: 'pc-phone', a: 'demo-pc', b: phone.id },
      { id: 'phone-switch', a: phone.id, b: 'demo-lan-switch' },
    );
    expect(
      simulateNetwork(network, {
        source: 'demo-pc',
        destination: 'demo-dns',
        protocol: 'ICMP',
        port: 0,
      }).ok,
    ).toBe(false);
  });
});
