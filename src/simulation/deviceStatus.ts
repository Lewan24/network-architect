import type { Device, Network } from '../model/networkTypes';
import { defaultServices } from '../devices/deviceCatalog';
import { simulateNetwork } from './networkEngine';
import { reconcileDhcp } from '../model/dhcp';
export const runningServices = (device: Device) =>
  device.online ? (device.services ?? defaultServices(device.kind)).filter((s) => s.enabled) : [];
export function gatewayReachable(network: Network, device: Device): boolean {
  const leased = reconcileDhcp(network);
  const d = leased.devices.find((x) => x.id === device.id)!;
  const gateway =
    d.interfaces?.find((n) => n.enabled && n.ip === d.ip)?.gateway ??
    leased.vlans.find((v) => v.id === d.vlan)?.gateway;
  return (
    !!gateway &&
    simulateNetwork(leased, {
      source: d.id,
      destination: gateway,
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    }).ok
  );
}
