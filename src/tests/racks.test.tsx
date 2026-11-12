import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import {
  createNetworkDevice,
  duplicateNetworkDevice,
  removeNetworkObject,
} from '../project/projectActions';
import { firstRackSlot, fitsInRack, rackPlacement, validateRack } from '../model/racks';
import { parseNetwork, topologyLinks } from '../model/network';
import { prepareHardware } from '../model/ports';
import { reconcileDhcp } from '../model/dhcp';
import { simulateNetwork } from '../simulation/networkEngine';
import { RackDialog } from '../editors/RackDialog';
import { RackPreviewDialog } from '../editors/RackPreviewDialog';
import type { RackMount } from '../model/networkTypes';

vi.mock('../components/Modal', () => ({
  Modal: ({ children, description }: { children: ReactNode; description: string }) =>
    createElement('div', null, description, children),
}));

const mount: RackMount = { deviceId: 'demo-nvr', startU: 1, heightU: 2, description: 'Archiwum' };
function fixture() {
  const network = createDemoNetwork();
  const rack = createNetworkDevice(network, 'rack', { x: 0, y: 0 });
  rack.rack = { heightU: 12, mounts: [structuredClone(mount)] };
  network.devices.push(rack);
  return { network, rack };
}

describe('rack cabinets and mounting', () => {
  it('keeps cabinets passive through hardware preparation, DHCP and JSON import', () => {
    const { network, rack } = fixture();
    const saved = parseNetwork(JSON.stringify(reconcileDhcp(prepareHardware(network))));
    expect(saved.devices.find((d) => d.id === rack.id)).toMatchObject({
      kind: 'rack',
      ip: '',
      ipMode: 'static',
      vlan: 0,
      ports: [],
      rack: rack.rack,
    });
    expect(topologyLinks(saved)).toEqual(topologyLinks(network));
    expect(rackPlacement(saved, mount.deviceId)?.cabinet.id).toBe(rack.id);
  });
  it('accepts exact boundaries and rejects overlap, overflow and fractional units', () => {
    expect(fitsInRack(4, [mount], { ...mount, deviceId: 'second', startU: 3 })).toBe(true);
    expect(fitsInRack(4, [mount], { ...mount, deviceId: 'second', startU: 2 })).toBe(false);
    expect(fitsInRack(4, [], { ...mount, startU: 4 })).toBe(false);
    expect(fitsInRack(4, [], { ...mount, startU: 0 })).toBe(false);
    expect(fitsInRack(4, [], { ...mount, heightU: 1.5 })).toBe(false);
    expect(fitsInRack(4, [mount], { ...mount, startU: 3 })).toBe(true);
    expect(firstRackSlot(4, [mount], 2)).toBe(3);
    expect(firstRackSlot(3, [mount], 2)).toBeUndefined();
  });
  it('rejects shrinking below equipment and mounting the same device twice', () => {
    const { network, rack } = fixture();
    expect(() =>
      validateRack({ ...rack, rack: { heightU: 1, mounts: [mount] } }, network),
    ).toThrow();
    expect(() =>
      validateRack(
        { ...rack, rack: { heightU: 12, mounts: [mount, { ...mount, startU: 4 }] } },
        network,
      ),
    ).toThrow();
    const second = createNetworkDevice(network, 'rack', { x: 50, y: 50 });
    second.rack!.mounts = [mount];
    network.devices.push(second);
    expect(() => parseNetwork(JSON.stringify(network))).toThrow();
  });
  it('rejects virtual, missing and nested cabinet mounts and network cables', () => {
    const { network, rack } = fixture();
    for (const id of ['missing', rack.id, network.devices.find((d) => d.kind === 'vm')!.id])
      expect(() =>
        validateRack(
          { ...rack, rack: { heightU: 12, mounts: [{ ...mount, deviceId: id }] } },
          network,
        ),
      ).toThrow();
    network.links.push({ id: 'invalid-rack-cable', a: rack.id, b: 'demo-nvr' });
    expect(() => parseNetwork(JSON.stringify(network))).toThrow();
  });
  it('duplicates an empty cabinet and removes membership when equipment is deleted', () => {
    const { network, rack } = fixture();
    expect(duplicateNetworkDevice(network, rack)).toMatchObject({
      ip: '',
      rack: { heightU: 12, mounts: [] },
    });
    expect(
      removeNetworkObject(network, 'demo-nvr').devices.find((d) => d.id === rack.id)?.rack?.mounts,
    ).toEqual([]);
    const removed = removeNetworkObject(network, rack.id);
    expect(removed.devices.find((d) => d.id === 'demo-nvr')).toEqual(
      network.devices.find((d) => d.id === 'demo-nvr'),
    );
    expect(removed.links).toEqual(network.links);
  });
  it('does not change connectivity when a cabinet is switched off or removed', () => {
    const { network, rack } = fixture();
    const probe = {
      source: 'demo-nvr',
      destination: 'demo-camera1',
      protocol: 'TCP' as const,
      port: 554,
      checkReply: true,
    };
    const baseline = simulateNetwork(network, probe);
    expect(baseline.ok).toBe(true);
    rack.online = false;
    expect(simulateNetwork(network, probe)).toEqual(baseline);
    expect(simulateNetwork(removeNetworkObject(network, rack.id), probe)).toEqual(baseline);
    expect(simulateNetwork(network, { ...probe, source: rack.id }).ok).toBe(false);
  });
  it('keeps the cabinet preview separate from mounting settings', () => {
    const { network, rack } = fixture();
    const html = renderToStaticMarkup(
      createElement(RackDialog, { device: rack, network, save: () => {}, close: () => {} }),
    );
    expect(html).toContain('Podgląd szafy');
    expect(html).toContain('2U');
    expect(html).toContain('Zamontuj urządzenie');
    expect(html).not.toContain('rack-cabinet-body');
    const preview = renderToStaticMarkup(
      createElement(RackPreviewDialog, {
        device: rack,
        network,
        selected: mount.deviceId,
        select: () => {},
        move: () => {},
        error: '',
        close: () => {},
        edit: () => {},
      }),
    );
    expect(preview).toContain('Widok szafy 12U');
    expect(preview).toContain('U1 na dole');
    expect(preview).toContain('rack-cabinet-body');
    expect(preview).toContain('draggable="true"');
    expect(preview).toContain('Archiwum');
    expect(preview).not.toContain('Zamontuj urządzenie');
  });
});
