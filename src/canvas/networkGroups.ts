import { belongsToVlan } from '../model/interfaces';
import type { Point } from './canvasGeometry';
import type { Network } from '../model/network';
export function moveNetworkGroup(network: Network, vlanId: number, delta: Point): Network {
  return {
    ...network,
    devices: network.devices.map((d) =>
      belongsToVlan(d, vlanId) ? { ...d, x: d.x + delta.x, y: d.y + delta.y } : d,
    ),
  };
}
