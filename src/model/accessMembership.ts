import type { Device, Network } from './networkTypes';
import { wirelessAssociation } from './wifi';

/** SSID/PPSK assigns the VLAN; a static IP never changes that assignment. */
export function projectWirelessMembership(network: Network): Network {
  const devices = network.devices.map((d) => {
    if (d.kind === 'accesspoint') return d;
    const memberships = network.links.flatMap((link) => {
      if (link.a !== d.id && link.b !== d.id) return [];
      const a = wirelessAssociation(network, link);
      if (!a || a.client.id !== d.id || a.ap.wifiEnterprise || a.ap.radiusNas?.mab) return [];
      return [
        { portId: a.clientPort?.id, vlan: a.vlan, error: a.error, ppsk: a.ppsk !== undefined },
      ];
    });
    if (!memberships.length) return d;
    const apply = <T extends { vlan: number; ip: string; ipMode: string; lease?: unknown }>(
      nic: T,
      membership?: (typeof memberships)[number],
    ): T => {
      if (!membership) return nic;
      if (membership.error)
        return nic.ipMode === 'auto' ? { ...nic, ip: '', lease: undefined } : nic;
      if (
        !membership.vlan ||
        (nic.ipMode !== 'auto' && !membership.ppsk) ||
        nic.vlan === membership.vlan
      )
        return nic;
      return {
        ...nic,
        vlan: membership.vlan,
        ...(nic.ipMode === 'auto' ? { ip: '', lease: undefined } : { lease: undefined }),
      };
    };
    if (d.interfaces?.length) {
      const interfaces = d.interfaces.map((n) =>
        apply(
          n,
          memberships.find((m) => m.portId === n.portId),
        ),
      );
      const first = interfaces[0];
      return { ...d, interfaces, vlan: first.vlan, ip: first.ip, lease: first.lease };
    }
    return memberships.length === 1 ? apply<Device>(d, memberships[0]) : d;
  });
  return { ...network, devices };
}
