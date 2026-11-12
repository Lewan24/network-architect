import { hardwareState } from './ports';
import { ipNumber, routeSubnet, validIp } from './addressing';
import type { Device, Network, NetworkInterface, Probe } from './networkTypes';

export function supportsHostInterfaces(d: Device): boolean {
  return (
    [
      'iot',
      'laptop',
      'nvr',
      'mini-server',
      'ups',
      'workstation',
      'mobile-phone',
      'printer',
      'camera',
      'dns',
      'radius',
      'vm',
      'server',
    ].includes(d.kind) && d.serverRole !== 'hypervisor'
  );
}
export function supportsInterfaces(d: Device): boolean {
  return (
    supportsHostInterfaces(d) || ['router', 'gateway', 'firewall', 'switch-l3'].includes(d.kind)
  );
}
export function routedInterface(d: Device, destination: string): NetworkInterface | undefined {
  if (!['router', 'gateway', 'firewall', 'switch-l3'].includes(d.kind)) return undefined;
  return d.interfaces
    ?.filter(
      (n) =>
        n.enabled &&
        n.ip &&
        (!d.ports || d.ports.some((p) => p.id === n.portId && p.enabled)) &&
        addressInPrefix(destination, n.ip, n.prefix),
    )
    .sort((a, b) => b.prefix - a.prefix || a.metric - b.metric)[0];
}
export function primaryInterface(d: Device, network: Network): NetworkInterface {
  const scope = network.vlans.find((v) => v.id === d.vlan);
  return {
    id: 'primary',
    name: 'Interfejs główny',
    portId:
      network.links.find((l) => l.a === d.id && l.aPortId)?.aPortId ||
      network.links.find((l) => l.b === d.id && l.bPortId)?.bPortId ||
      d.ports?.find((p) => p.connector !== 'sfp' && p.connector !== 'sfp+')?.id ||
      'eth0',
    enabled: true,
    vlan: d.vlan,
    ip: d.ip,
    ipMode: d.ipMode,
    prefix: scope ? routeSubnet(scope.cidr).prefix : 24,
    gateway: scope?.gatewayDeviceId ? scope.gateway : '',
    metric: 100,
    dnsServerIds: d.dnsServerIds,
    lease: d.lease,
  };
}
export function activeInterface(d: Device): NetworkInterface | undefined {
  return d.interfaces?.find((n) => n.ip === d.ip && n.vlan === d.vlan);
}
export function addressInPrefix(ip: string, address: string, prefix: number): boolean {
  if (!validIp(ip) || !validIp(address)) return false;
  const p = routeSubnet(`${address}/${prefix}`);
  return ipNumber(ip) >= p.start && ipNumber(ip) <= p.end;
}
export function hostInterfaceAddressValid(n: NetworkInterface): boolean {
  if (!validIp(n.ip)) return false;
  const p = routeSubnet(`${n.ip}/${n.prefix}`);
  return n.prefix >= 31 || (ipNumber(n.ip) > p.start && ipNumber(n.ip) < p.end);
}
export function selectInterface(
  d: Device,
  destination: string,
  requested?: string,
): NetworkInterface | undefined {
  const interfaces = (d.interfaces || []).filter(
    (n) => n.enabled && !!n.ip && (!d.ports || d.ports.some((p) => p.id === n.portId && p.enabled)),
  );
  if (requested) return interfaces.find((n) => n.id === requested);
  const connected = interfaces.filter((n) => addressInPrefix(destination, n.ip, n.prefix));
  if (connected.length)
    return connected.sort(
      (a, b) => b.prefix - a.prefix || a.metric - b.metric || a.id.localeCompare(b.id),
    )[0];
  return (
    interfaces
      .filter((n) => n.gateway)
      .sort((a, b) => a.metric - b.metric || a.id.localeCompare(b.id))[0] ||
    (validIp(destination) ? undefined : interfaces[0])
  );
}
export function useInterface(d: Device, nic: NetworkInterface): Device {
  return {
    ...d,
    ip: nic.ip,
    ipMode: nic.ipMode,
    vlan: nic.vlan,
    lease: nic.lease,
    dnsServerIds: nic.dnsServerIds ?? d.dnsServerIds,
  };
}
export function projectHostInterfaces(
  network: Network,
  probe: Probe,
  mappedTargetIp?: string,
): {
  network: Network;
  sourceNic?: NetworkInterface;
  targetNic?: NetworkInterface;
  error?: string;
} {
  const source = network.devices.find((d) => d.id === probe.source);
  const targetAddress = mappedTargetIp || probe.destination;
  const target = network.devices.find(
    (d) =>
      d.id === targetAddress ||
      d.ip === targetAddress ||
      d.interfaces?.some((n) => n.ip === targetAddress),
  );
  let targetNic: NetworkInterface | undefined;
  if (target?.interfaces?.length) {
    targetNic = probe.destinationInterfaceId
      ? target.interfaces.find((n) => n.id === probe.destinationInterfaceId)
      : target.interfaces.find((n) => n.ip === targetAddress) || target.interfaces[0];
    if (
      !targetNic?.enabled ||
      !targetNic.ip ||
      (target.ports && !target.ports.some((p) => p.id === targetNic!.portId && p.enabled))
    )
      return { network, error: 'Docelowy interfejs jest wyłączony albo nie ma adresu IP.' };
  }
  const destination = mappedTargetIp
    ? probe.destination
    : targetNic?.ip || target?.ip || probe.destination;
  const connectedSource = source
    ? {
        ...source,
        interfaces: source.interfaces?.filter(
          (n) =>
            network.links.some(
              (l) =>
                (l.a === source.id && l.aPortId === n.portId) ||
                (l.b === source.id && l.bPortId === n.portId),
            ) ||
            (source.kind === 'vm' &&
              network.devices.some((d) => d.id === source.hostId && d.online)),
        ),
      }
    : undefined;
  const sourceNic =
    source?.interfaces?.length && connectedSource
      ? selectInterface(connectedSource, destination, probe.sourceInterfaceId)
      : undefined;
  if (source?.interfaces?.length && !sourceNic)
    return {
      network,
      error:
        'Brak aktywnego interfejsu z trasą connected lub bramą do celu. Sprawdź IP, maskę, bramę i metrykę kart sieciowych.',
    };
  const selected = new Map<string, NetworkInterface>();
  if (source && sourceNic) selected.set(source.id, sourceNic);
  if (target && targetNic) selected.set(target.id, targetNic);
  return {
    sourceNic,
    targetNic,
    network: {
      ...network,
      devices: network.devices.map((d) =>
        selected.has(d.id) ? useInterface(d, selected.get(d.id)!) : d,
      ),
      links: network.links.filter((l) =>
        (['a', 'b'] as const).every((side) => {
          const nic = selected.get(l[side]);
          return (
            !nic ||
            l.id.startsWith('virtual:') ||
            !l[`${side}PortId`] ||
            l[`${side}PortId`] === nic.portId
          );
        }),
      ),
    },
  };
}

/** DHCP identifies a client per NIC. Proxy nodes are internal and never serialized or drawn. */
export function expandInterfaceClients(network: Network): {
  network: Network;
  bindings: Map<string, { owner: string; nic: NetworkInterface }>;
} {
  const bindings = new Map<string, { owner: string; nic: NetworkInterface }>();
  const hw = network.devices.some((d) => d.interfaces?.length) ? hardwareState(network) : undefined;
  const devices = network.devices.flatMap((d) => {
    if (!supportsHostInterfaces(d) || !d.interfaces?.length)
      return [{ ...d, online: hw ? !!hw.powered.get(d.id) : d.online }];
    return d.interfaces.map((nic, i) => {
      const id = i === 0 ? d.id : `${d.id}::nic:${nic.id}`;
      bindings.set(id, { owner: d.id, nic });
      return {
        ...useInterface(d, nic),
        id,
        interfaces: undefined,
        online: (hw ? !!hw.powered.get(d.id) : d.online) && nic.enabled,
        powerSource: 'local' as const,
        ports: d.ports?.filter((p) => p.id === nic.portId),
      };
    });
  });
  if (!bindings.size) return { network, bindings };
  const endpoint = (id: string, port?: string) =>
    [...bindings].find(([, b]) => b.owner === id && b.nic.portId === port)?.[0] || id;
  return {
    bindings,
    network: {
      ...network,
      devices,
      links: network.links.map((l) => ({
        ...l,
        a: endpoint(l.a, l.aPortId),
        b: endpoint(l.b, l.bPortId),
      })),
      vlans: network.vlans.map((v) => ({
        ...v,
        dhcpServerId:
          [...bindings].find(([, b]) => b.owner === v.dhcpServerId && b.nic.vlan === v.id)?.[0] ||
          v.dhcpServerId,
      })),
    },
  };
}
export function restoreInterfaceClients(
  original: Network,
  expanded: Network,
  bindings: Map<string, { owner: string; nic: NetworkInterface }>,
): Network {
  if (!bindings.size) return expanded;
  return {
    ...original,
    devices: original.devices.map((d) => {
      const nics = [...bindings].filter(([, b]) => b.owner === d.id);
      if (!nics.length) {
        const result = expanded.devices.find((x) => x.id === d.id) || d;
        return {
          ...result,
          online: d.online,
          ...(result.lease
            ? {
                lease: {
                  ...result.lease,
                  serverId: bindings.get(result.lease.serverId)?.owner || result.lease.serverId,
                },
              }
            : {}),
        };
      }
      const interfaces = nics.map(([id, b]) => {
        const result = expanded.devices.find((x) => x.id === id)!;
        const lease = result.lease
          ? {
              ...result.lease,
              serverId: bindings.get(result.lease.serverId)?.owner || result.lease.serverId,
            }
          : undefined;
        return {
          ...b.nic,
          ip: result.ip,
          lease,
          ...(lease
            ? { prefix: lease.prefix ?? b.nic.prefix, gateway: lease.gateway ?? b.nic.gateway }
            : {}),
        };
      });
      return { ...useInterface(d, interfaces[0]), online: d.online, interfaces };
    }),
  };
}

/** A multi-homed device belongs to every configured network, even when a NIC is disabled. */
export function belongsToVlan(device: Device, vlan: number): boolean {
  return device.interfaces?.length
    ? device.interfaces.some((n) => n.vlan === vlan)
    : device.vlan === vlan;
}

/** A next-hop router may be on-link through switches, not necessarily joined by one cable. */
export function connectedNextHop(
  network: Network,
  device: Device,
  next: Device,
): { vlan: number; portId?: string; ip: string } | undefined {
  const own = [
    ...(device.interfaces || [])
      .filter((n) => n.enabled && n.ip)
      .map((n) => ({
        vlan: n.vlan,
        ip: n.ip,
        prefix: n.prefix,
        portId: n.portId,
        metric: n.metric,
      })),
    ...network.vlans
      .filter(
        (v) => v.gatewayDeviceId === device.id || (v.id === device.vlan && validIp(device.ip)),
      )
      .map((v) => ({
        vlan: v.id,
        ip: v.gatewayDeviceId === device.id ? v.gateway : device.ip,
        prefix: routeSubnet(v.cidr).prefix,
        portId: undefined,
        metric: 1000,
      })),
  ].sort((a, b) => b.prefix - a.prefix || a.metric - b.metric);
  const peers = [
    { ip: next.ip, vlan: next.vlan },
    ...(next.interfaces || []).filter((n) => n.enabled).map((n) => ({ ip: n.ip, vlan: n.vlan })),
    ...network.vlans
      .filter((v) => v.gatewayDeviceId === next.id)
      .map((v) => ({ ip: v.gateway, vlan: v.id })),
  ];
  for (const n of own) {
    const peer = peers.find((p) => p.vlan === n.vlan && addressInPrefix(p.ip, n.ip, n.prefix));
    if (peer) return { vlan: n.vlan, portId: n.portId, ip: peer.ip };
  }
  return undefined;
}
