import { isDhcpServer, isRoutingDevice, subnet } from '../model/network';
import type { Device, Network, Vlan } from '../model/networkTypes';

/** Changing a referenced ID would break memberships, ports and dynamic ACL references. */
export function vlanReferences(network: Network, id: number): string[] {
  const references: string[] = [];
  if (network.devices.some((d) => d.radius?.users.some((u) => u.vlan === id)))
    references.push('polityki VLAN RADIUS');
  if (network.devices.some((d) => d.vlan === id)) references.push('urządzenia w tej sieci');
  if (network.devices.some((d) => d.interfaces?.some((n) => n.vlan === id)))
    references.push('interfejsy IP');
  if (
    network.devices.some((d) =>
      d.ports?.some(
        (p) =>
          (p.mode === 'access' && (p.accessVlan || 1) === id) ||
          (p.mode === 'trunk' && ((p.nativeVlan || 1) === id || p.allowedVlans?.includes(id))),
      ),
    )
  )
    references.push('konfiguracja portów');
  if (network.devices.some((d) => d.wifiVlan === id)) references.push('VLAN klientów Wi-Fi');
  if (network.devices.some((d) => d.allowedVlans?.includes(id))) references.push('VLAN-y switchy');
  if (
    network.links.some(
      (l) =>
        (l.mode === 'access' && (l.accessVlan || 1) === id) ||
        (l.mode === 'trunk' && l.allowedVlans?.includes(id)),
    )
  )
    references.push('porty access/trunk');
  if (
    network.devices.some((d) =>
      d.rules.some((r) => r.source === `vlan:${id}` || r.destination === `vlan:${id}`),
    )
  )
    references.push('reguły ACL');
  return references;
}

export function createVlan(network: Network, device?: Device): Vlan {
  let id = 1;
  while (network.vlans.some((v) => v.id === id)) id++;
  if (id > 4094) throw Error('Wszystkie identyfikatory VLAN są zajęte.');
  const occupied = network.vlans.map((v) => subnet(v.cidr));
  // Search private /24 networks instead of deriving an overlapping subnet from a large VLAN ID.
  for (let index = 0; index < 256 + 65536; index++) {
    const prefix =
      index < 256
        ? `192.168.${index}`
        : `10.${Math.floor((index - 256) / 256)}.${(index - 256) % 256}`;
    const pool = subnet(`${prefix}.0/24`);
    if (occupied.some((p) => p.start <= pool.end && pool.start <= p.end)) continue;
    return {
      id,
      name: id === 1 ? 'LAN domyślna' : `VLAN ${id}`,
      cidr: `${prefix}.0/24`,
      gateway: `${prefix}.1`,
      color: '#718fae',
      ...(device && isRoutingDevice(device) ? { gatewayDeviceId: device.id } : {}),
      ...(device && isDhcpServer(device)
        ? {
            dhcpEnabled: true,
            dhcpServerId: device.id,
            dhcpStart: `${prefix}.100`,
            dhcpEnd: `${prefix}.200`,
            leaseMinutes: 120,
          }
        : {}),
    };
  }
  throw Error('Brak wolnej prywatnej podsieci /24. Zmień konfigurację istniejących sieci.');
}

/** Remove memberships without deleting physical devices or cables. */
export function removeVlan(network: Network, id: number): Network {
  const clean = <T extends { vlan: number; ip: string; lease?: unknown }>(n: T): T =>
    n.vlan === id ? { ...n, vlan: 0, ip: '', lease: undefined, gateway: '', ipMode: 'auto' } : n;
  return {
    ...network,
    vlans: network.vlans.filter((v) => v.id !== id),
    devices: network.devices.map((d) => ({
      ...clean(d),
      interfaces: d.interfaces?.map((n) =>
        n.vlan === id
          ? { ...clean(n), ipMode: 'auto' as const, enabled: false, dnsServerIds: [] }
          : n,
      ),
      ...(d.wifiVlan === id ? { wifiVlan: undefined } : {}),
      allowedVlans: d.allowedVlans?.filter((v) => v !== id),
      rules: d.rules.filter((r) => r.source !== `vlan:${id}` && r.destination !== `vlan:${id}`),
      ports: d.ports?.map((p) => {
        const affected =
          (p.mode === 'access' && (p.accessVlan || 1) === id) ||
          (p.mode === 'trunk' && (p.nativeVlan || 1) === id);
        return {
          ...p,
          ...(affected
            ? {
                enabled: false,
                mode: 'auto' as const,
                accessVlan: undefined,
                nativeVlan: undefined,
              }
            : {}),
          ...(p.allowedVlans
            ? {
                allowedVlans: p.allowedVlans.filter((v) => v !== id),
                ...(!affected && p.allowedVlans.length === 1 && p.allowedVlans[0] === id
                  ? { enabled: false }
                  : {}),
              }
            : {}),
        };
      }),
      ...(d.radius
        ? {
            radius: {
              ...d.radius,
              users: d.radius.users.map((u) =>
                u.vlan === id ? { ...u, vlan: undefined, enabled: false, authorized: false } : u,
              ),
            },
          }
        : {}),
      ...(d.accessSession && (d.accessSession.vlan === id || d.accessSession.baseVlan === id)
        ? { accessSession: undefined }
        : {}),
    })),
    links: network.links.map((l) => ({
      ...l,
      ...(l.accessVlan === id || (l.mode === 'access' && (l.accessVlan || 1) === id)
        ? { mode: 'auto' as const, accessVlan: undefined }
        : {}),
      allowedVlans: l.allowedVlans?.filter((v) => v !== id),
    })),
  };
}
