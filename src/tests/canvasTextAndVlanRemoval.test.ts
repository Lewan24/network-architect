import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { parseNetwork } from '../model/network';
import { removeVlan, vlanReferences } from '../project/vlanEditing';
import { removeNetworkObject } from '../project/projectActions';
import { recordProject, undoProject } from '../project/projectHistory';
import { reconcileDhcp } from '../model/dhcp';
import { prepareHardware } from '../model/ports';
describe('canvas text annotations', () => {
  it('persists multiline text and removes it independently of devices', () => {
    const n = createDemoNetwork();
    n.annotations = [
      {
        id: 'text:company',
        text: 'Firma ABC\nWarszawa',
        x: 100,
        y: -120,
        fontSize: 32,
        color: '#334455',
      },
    ];
    expect(parseNetwork(JSON.stringify(n)).annotations).toEqual(n.annotations);
    const removed = removeNetworkObject(n, 'text:company');
    expect(removed.annotations).toEqual([]);
    expect(removed.devices).toEqual(n.devices);
  });
  it('rejects invalid dimensions and duplicated IDs in imported labels', () => {
    const n = createDemoNetwork();
    n.annotations = [{ id: 'text:a', text: 'A', x: 0, y: 0, fontSize: 0, color: '#334455' }];
    expect(() => parseNetwork(JSON.stringify(n))).toThrow('etykieta');
    n.annotations[0].fontSize = 24;
    n.annotations.push({ ...n.annotations[0] });
    expect(() => parseNetwork(JSON.stringify(n))).toThrow('etykieta');
  });
});
describe('removing an occupied VLAN', () => {
  for (const id of [10, 20, 30, 40, 50, 60, 99])
    it(`cleans VLAN ${id} references, retains topology, round trips and supports undo`, () => {
      const n = prepareHardware(createDemoNetwork());
      const next = removeVlan(n, id);
      expect(next.vlans.some((v) => v.id === id)).toBe(false);
      expect(vlanReferences(next, id)).toEqual([]);
      expect(next.devices.map((d) => d.id)).toEqual(n.devices.map((d) => d.id));
      expect(next.links.map((l) => l.id)).toEqual(n.links.map((l) => l.id));
      for (const d of next.devices.filter(
        (d) => n.devices.find((x) => x.id === d.id)?.vlan === id,
      )) {
        expect(d.vlan).toBe(0);
        expect(d.ip).toBe('');
        expect(d.lease).toBeUndefined();
      }
      const committed = reconcileDhcp(next);
      expect(() => parseNetwork(JSON.stringify(committed))).not.toThrow();
      expect(undoProject(recordProject({ network: n, past: [], future: [] }, next)).network).toBe(
        n,
      );
    });
});
