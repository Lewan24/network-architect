import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from './demoNetwork';
import {
  createGuestDevice,
  createNetworkDevice,
  duplicateNetworkDevice,
  removeNetworkObject,
} from './projectActions';
import {
  HISTORY_LIMIT,
  recordProject,
  redoProject,
  undoProject,
  type ProjectHistory,
} from './projectHistory';

describe('project editing after extraction from App', () => {
  it('creates DHCP clients with snapped positions and the same default VLAN', () => {
    const network = createDemoNetwork();
    const device = createNetworkDevice(network, 'workstation', { x: 43, y: 87 });
    expect(device).toMatchObject({ ip: '', ipMode: 'auto', vlan: 10, x: 40, y: 90, online: true });
    expect(network.devices.some((existing) => existing.id === device.id)).toBe(false);
  });
  it('creates an edge with separate LAN and WAN addresses and a default deny ACL', () => {
    const device = createNetworkDevice(createDemoNetwork(), 'gateway', { x: 0, y: 0 });
    expect(device).toMatchObject({
      edgeRole: 'edge',
      defaultAcl: 'deny',
      outboundNat: true,
      ipMode: 'static',
    });
    expect(device.ip).not.toBe(device.wanIp);
    expect(device.wanIp).not.toBe('203.0.113.10');
  });
  it('keeps guests attached to their selected hypervisor', () => {
    const network = createDemoNetwork();
    const host = network.devices.find((device) => device.id === 'demo-hyperv')!;
    expect(createGuestDevice(network, host)).toMatchObject({
      hostId: host.id,
      vlan: host.vlan,
      ipMode: 'auto',
      ip: '',
    });
  });
  it('duplicates DHCP configuration without copying its lease or sharing mutable rules', () => {
    const network = createDemoNetwork();
    const device = network.devices.find((device) => device.id === 'demo-pc')!;
    const copy = duplicateNetworkDevice(network, device);
    expect(copy.id).not.toBe(device.id);
    expect(copy.ip).toBe('');
    expect(copy.lease).toBeUndefined();
    expect(copy.rules).not.toBe(device.rules);
  });
  it('detaches virtual links without deleting the host or guest', () => {
    const network = createDemoNetwork();
    const next = removeNetworkObject(network, 'virtual:demo-docker');
    expect(next.devices).toHaveLength(network.devices.length);
    expect(next.devices.find((device) => device.id === 'demo-docker')?.hostId).toBe('');
    expect(network.devices.find((device) => device.id === 'demo-docker')?.hostId).toBe(
      'demo-hyperv',
    );
  });
  it('clears gateway, DHCP, routes and links when their owning device is removed', () => {
    const next = removeNetworkObject(createDemoNetwork(), 'demo-firewall');
    expect(
      next.links.every((link) => link.a !== 'demo-firewall' && link.b !== 'demo-firewall'),
    ).toBe(true);
    expect(next.vlans.find((vlan) => vlan.id === 10)).toMatchObject({
      gatewayDeviceId: '',
      dhcpServerId: '',
      dhcpEnabled: false,
    });
    expect(
      next.devices
        .find((device) => device.id === 'demo-router')
        ?.routes?.every((route) => route.nextHopId !== 'demo-firewall'),
    ).toBe(true);
  });
});

describe('project history', () => {
  function initial(): ProjectHistory {
    return { network: createDemoNetwork(), past: [], future: [] };
  }
  it('roundtrips edits through undo and redo without mutating snapshots', () => {
    const first = initial();
    const nextNetwork = { ...first.network, name: 'Changed' };
    const edited = recordProject(first, nextNetwork);
    const undone = undoProject(edited);
    expect(undone.network).toBe(first.network);
    expect(redoProject(undone).network).toBe(nextNetwork);
    expect(first.past).toEqual([]);
  });
  it('discards redo when an edit starts a new branch', () => {
    const first = initial();
    const undone = undoProject(recordProject(first, { ...first.network, name: 'Old branch' }));
    const branched = recordProject(undone, { ...first.network, name: 'New branch' });
    expect(branched.future).toEqual([]);
    expect(redoProject(branched)).toBe(branched);
  });
  it('limits undo to the most recent 50 edits', () => {
    let state = initial();
    for (let index = 0; index < HISTORY_LIMIT + 10; index++)
      state = recordProject(state, { ...state.network, name: String(index) });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(state.past[0].name).toBe('9');
  });
  it('returns the same state when undo or redo is unavailable', () => {
    const state = initial();
    expect(undoProject(state)).toBe(state);
    expect(redoProject(state)).toBe(state);
  });
});
