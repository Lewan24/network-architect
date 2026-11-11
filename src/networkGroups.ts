import type { Point } from './canvasGeometry';
import type { Network } from './network';
export function moveNetworkGroup(network: Network, vlanId: number, delta: Point): Network {
  return {
    ...network,
    devices: network.devices.map((d) =>
      d.vlan === vlanId ? { ...d, x: d.x + delta.x, y: d.y + delta.y } : d,
    ),
  };
}
