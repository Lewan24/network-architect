import { describe, expect, it } from 'vitest';
import { networkAreaPolygon } from '../canvas/networkAreas';
import { createDemoNetwork } from '../examples/demoNetwork';
import { parseNetwork } from '../model/network';

describe('isometric network areas', () => {
  it('draws a diamond around one member and handles an empty group', () => {
    expect(networkAreaPolygon([{ x: 0, y: 0 }])).toEqual([
      { x: -85, y: 0 },
      { x: 0, y: -90 },
      { x: 85, y: 0 },
      { x: 0, y: 85 },
    ]);
    expect(networkAreaPolygon([])).toEqual([]);
  });
  it('moves the whole outline with the group', () => {
    const members = [
      { x: -100, y: 20 },
      { x: 300, y: 160 },
    ];
    const delta = { x: 123, y: -57 };
    expect(
      networkAreaPolygon(members.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))),
    ).toEqual(networkAreaPolygon(members).map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })));
  });
  it.each(['outline', 'square', 'rectangle'])(
    'imports older %s display preferences using the isometric outline',
    (areaShape) => {
      const original = createDemoNetwork();
      const network = parseNetwork(
        JSON.stringify({ ...original, vlans: original.vlans.map((v) => ({ ...v, areaShape })) }),
      );
      expect(network.vlans).toEqual(original.vlans);
      expect(JSON.stringify(network)).not.toContain('areaShape');
      expect(networkAreaPolygon(network.devices)).toEqual(networkAreaPolygon(original.devices));
    },
  );
});
