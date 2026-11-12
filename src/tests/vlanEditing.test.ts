import { describe, expect, it } from 'vitest';
import { createVlan, vlanReferences } from '../project/vlanEditing';
import { createDemoNetwork } from '../examples/demoNetwork';
import { applyVlans, parseNetwork } from '../model/network';
import { recordProject, undoProject, redoProject } from '../project/projectHistory';

describe('individual VLAN editing', () => {
  it('suggests an unused ID and subnet without mutating the project', () => {
    const network = createDemoNetwork();
    const first = createVlan(network);
    const second = createVlan({ ...network, vlans: [...network.vlans, first] });
    expect(second.id).not.toBe(first.id);
    expect(second.cidr).not.toBe(first.cidr);
    expect(first.dhcpEnabled).toBeUndefined();
    expect(network.vlans).toHaveLength(6);
  });
  it('prepares LAN and DHCP defaults for the device being edited', () => {
    const network = createDemoNetwork();
    const firewall = network.devices.find((d) => d.id === 'demo-firewall')!;
    expect(createVlan(network, firewall)).toMatchObject({
      gatewayDeviceId: firewall.id,
      dhcpServerId: firewall.id,
      dhcpEnabled: true,
    });
  });
  it('detects Wi-Fi, port and ACL references even when the VLAN has no direct members', () => {
    const network = createDemoNetwork();
    network.devices = network.devices.map((d) => ({
      ...d,
      vlan: 0,
      allowedVlans: [],
      wifiVlan: d.id === 'demo-staff-ap' ? 40 : undefined,
    }));
    const reasons = vlanReferences(network, 40);
    expect(reasons).toContain('VLAN klientów Wi-Fi');
    expect(reasons).toContain('porty access/trunk');
    expect(reasons).toContain('reguły ACL');
    expect(reasons).not.toContain('urządzenia w tej sieci');
  });
  it('saves one network independently, round-trips JSON and supports undo/redo', () => {
    const network = createDemoNetwork();
    const changed = applyVlans(
      network,
      network.vlans.map((v) =>
        v.id === 10 ? { ...v, name: 'Biuro po zmianie', color: '#123456' } : v,
      ),
    );
    expect(parseNetwork(JSON.stringify(changed)).vlans.find((v) => v.id === 10)?.name).toBe(
      'Biuro po zmianie',
    );
    expect(changed.vlans.filter((v) => v.id !== 10)).toEqual(
      network.vlans.filter((v) => v.id !== 10),
    );
    const history = recordProject({ network, past: [], future: [] }, changed);
    expect(undoProject(history).network).toBe(network);
    expect(redoProject(undoProject(history)).network).toBe(changed);
  });
});
