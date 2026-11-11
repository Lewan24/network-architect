import { hostInVlan, ipNumber, numberIp, routeSubnet, subnet, validIp } from './addressing';
import { kinds } from './deviceCatalog';
export { hostInVlan, ipNumber, numberIp, routeSubnet, subnet, validIp } from './addressing';
export { defaultServices, kinds } from './deviceCatalog';
export type * from './networkTypes';

import type { Device, Link, Network, Result, Vlan } from './networkTypes';

export function tracePath(result: Result) {
  const data = [...result.path, ...(result.returnPath?.slice(1) || [])];
  if (!result.dns?.ok) return data;
  const query = result.dns.queryPath;
  return [...query, ...(query.at(-1) === data[0] ? data.slice(1) : data)];
}

export function isRoutingDevice(d: Device) {
  return ['gateway', 'router', 'firewall', 'switch-l3'].includes(d.kind);
}
export function hasAcl(d: Device) {
  return isRoutingDevice(d);
}
export function hasWan(d: Device) {
  return (
    d.edgeRole !== 'internal' &&
    (['gateway', 'firewall'].includes(d.kind) ||
      (d.kind === 'router' && (d.edgeRole === 'edge' || !!d.wanIp)))
  );
}
export function isDhcpServer(d: Device) {
  return isRoutingDevice(d) || d.kind === 'server' || d.kind === 'dns';
}
export function validHostname(value: string) {
  return (
    value.length <= 253 &&
    !validIp(value) &&
    value
      .replace(/\.$/, '')
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

export function validAclAddress(value: string) {
  if (
    value === '*' ||
    validIp(value) ||
    /^device:.+/.test(value) ||
    /^vlan:[1-9]\d{0,3}$/.test(value)
  )
    return true;
  try {
    routeSubnet(value);
    return true;
  } catch {
    return false;
  }
}
export function matchesAclAddress(value: string, ip: string, network: Network) {
  if (value === '*') return true;
  if (value.startsWith('device:'))
    return network.devices.some(
      (d) =>
        d.id === value.slice(7) &&
        [
          d.ip,
          d.wanIp,
          ...network.vlans.filter((v) => v.gatewayDeviceId === d.id).map((v) => v.gateway),
        ].some((address) => !!address && address === ip),
    );
  if (value.startsWith('vlan:')) {
    const vlan = network.vlans.find((v) => v.id === +value.slice(5));
    if (!vlan || !validIp(ip)) return false;
    const pool = subnet(vlan.cidr);
    return ipNumber(ip) >= pool.start && ipNumber(ip) <= pool.end;
  }
  if (value.includes('/')) {
    if (!validIp(ip)) return false;
    const pool = routeSubnet(value);
    return ipNumber(ip) >= pool.start && ipNumber(ip) <= pool.end;
  }
  return value === ip;
}
export function linkAllowsVlan(link: Link, vlan: number) {
  return !vlan || link.mode === 'access'
    ? !vlan || vlan === (link.accessVlan || 1)
    : link.mode === 'trunk'
      ? !link.allowedVlans?.length || link.allowedVlans.includes(vlan)
      : true;
}
export function isPublicModelIp(ip: string) {
  if (!validIp(ip)) return false;
  const value = ipNumber(ip);
  return ![
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '224.0.0.0/3',
  ].some((c) => {
    const r = routeSubnet(c);
    return value >= r.start && value <= r.end;
  });
}
export function publicAddresses(network: Network) {
  return [
    ...new Set(
      network.devices
        .filter(hasWan)
        .flatMap((d) => [
          ...(d.wanIp ? [d.wanIp] : []),
          ...(d.portForwards || []).filter((r) => r.enabled).map((r) => r.externalIp),
          ...(d.staticNat || []).filter((r) => r.enabled).map((r) => r.publicIp),
        ]),
    ),
  ].filter(isPublicModelIp);
}
export function isHypervisor(d: Device) {
  return d.kind === 'server' && d.serverRole === 'hypervisor';
}
export function topologyLinks(network: Network): Link[] {
  const byId = new Map(network.devices.map((d) => [d.id, d]));
  const links = network.links.filter((l) =>
    [l.a, l.b].every((id) => {
      const d = byId.get(id);
      return d?.kind !== 'vm' || (!!d.hostId && (id === l.a ? l.b : l.a) === d.hostId);
    }),
  );
  for (const vm of network.devices.filter((d) => d.kind === 'vm' && d.hostId)) {
    const host = byId.get(vm.hostId!);
    if (
      host &&
      isHypervisor(host) &&
      !links.some((l) => (l.a === vm.id && l.b === host.id) || (l.b === vm.id && l.a === host.id))
    )
      links.push({ id: `virtual:${vm.id}`, a: host.id, b: vm.id });
  }
  return links;
}

export function validateDeviceConfig(d: Device, network?: Network, strictNeighbors = true) {
  if (
    d.dnsServerIds !== undefined &&
    (!Array.isArray(d.dnsServerIds) ||
      d.dnsServerIds.length > 4 ||
      d.dnsServerIds.some((id) => typeof id !== 'string'))
  )
    throw Error('Nieprawidłowa lista resolverów DNS.');
  if (d.dnsRecords !== undefined) {
    if (!Array.isArray(d.dnsRecords) || d.dnsRecords.length > 256)
      throw Error('Nieprawidłowa strefa DNS.');
    const names = new Set<string>();
    for (const r of d.dnsRecords) {
      if (
        !r ||
        typeof r.id !== 'string' ||
        typeof r.name !== 'string' ||
        !validHostname(r.name) ||
        !((r.deviceId && typeof r.deviceId === 'string') || (r.address && validIp(r.address))) ||
        (r.deviceId && r.address)
      )
        throw Error('Rekord A wymaga poprawnej nazwy DNS i jednego celu: urządzenia albo IPv4.');
      const name = r.name.toLowerCase().replace(/\.$/, '');
      if (names.has(name)) throw Error('Nazwy rekordów A muszą być unikalne w tym serwerze.');
      names.add(name);
    }
  }
  if (d.edgeRole !== undefined && !['edge', 'internal'].includes(d.edgeRole))
    throw Error('Nieprawidłowa rola brzegu sieci.');
  if (d.outboundNat !== undefined && typeof d.outboundNat !== 'boolean')
    throw Error('Nieprawidłowe ustawienie NAT wyjściowego.');
  if (
    d.lease &&
    (!validIp(d.lease.ip) ||
      typeof d.lease.serverId !== 'string' ||
      !Number.isFinite(d.lease.obtainedAt) ||
      !Number.isFinite(d.lease.expiresAt) ||
      d.lease.expiresAt <= d.lease.obtainedAt)
  )
    throw Error('Nieprawidłowa dzierżawa DHCP.');
  if (
    d.services !== undefined &&
    (!Array.isArray(d.services) ||
      d.services.length > 128 ||
      d.services.some(
        (s) =>
          !s ||
          typeof s.id !== 'string' ||
          typeof s.name !== 'string' ||
          !['TCP', 'UDP'].includes(s.protocol) ||
          !Number.isInteger(s.port) ||
          s.port < 1 ||
          s.port > 65535 ||
          typeof s.enabled !== 'boolean',
      ))
  )
    throw Error('Nieprawidłowa lista usług urządzenia.');
  if (d.defaultAcl !== undefined && !['allow', 'deny'].includes(d.defaultAcl))
    throw Error('Nieprawidłowa domyślna polityka ACL.');
  if (d.routingMode !== undefined && !['automatic', 'static'].includes(d.routingMode))
    throw Error('Nieprawidłowy tryb routingu.');
  if (d.serverRole !== undefined && !['server', 'hypervisor'].includes(d.serverRole))
    throw Error('Nieprawidłowa rola serwera.');
  if (
    d.hypervisorVendor !== undefined &&
    !['VMware ESXi', 'Proxmox VE', 'Hyper-V', 'KVM'].includes(d.hypervisorVendor)
  )
    throw Error('Nieprawidłowa platforma wirtualizacji.');
  if (d.wanIp !== undefined && d.wanIp !== '' && !validIp(d.wanIp))
    throw Error('Podaj poprawny adres WAN IPv4.');
  if (d.ssid !== undefined && (typeof d.ssid !== 'string' || d.ssid.length > 32))
    throw Error('SSID może mieć maksymalnie 32 znaki.');
  if (d.hostId !== undefined && typeof d.hostId !== 'string') throw Error('Nieprawidłowy host VM.');
  if (
    d.kind === 'vm' &&
    d.hostId &&
    network &&
    !network.devices.some((h) => h.id === d.hostId && isHypervisor(h))
  )
    throw Error('Wybierz serwer z rolą hypervisora.');
  if (
    d.kind === 'server' &&
    !isHypervisor(d) &&
    network?.devices.some((vm) => vm.kind === 'vm' && vm.hostId === d.id)
  )
    throw Error('Najpierw przenieś maszyny VM z tego hypervisora.');
  const arrays = [d.routes, d.portForwards, d.staticNat, d.allowedVlans];
  if (arrays.some((a) => a !== undefined && (!Array.isArray(a) || a.length > 256)))
    throw Error('Nieprawidłowa lista ustawień urządzenia.');
  if (
    d.allowedVlans?.some(
      (id) =>
        !Number.isInteger(id) ||
        id < 1 ||
        id > 4094 ||
        (network && !network.vlans.some((v) => v.id === id)),
    )
  )
    throw Error('Wybierz istniejące VLAN-y dozwolone na switchu.');
  const port = (n: number) => Number.isInteger(n) && n >= 1 && n <= 65535;
  for (const r of d.routes || []) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      typeof r.destination !== 'string' ||
      typeof r.nextHopId !== 'string' ||
      !r.nextHopId ||
      !Number.isInteger(r.metric) ||
      r.metric < 0 ||
      r.metric > 65535
    )
      throw Error('Trasa wymaga podsieci, następnego urządzenia i metryki 0–65535.');
    routeSubnet(r.destination);
    if (network && !network.devices.some((next) => next.id === r.nextHopId))
      throw Error('Następny skok trasy odwołuje się do nieistniejącego urządzenia.');
    if (
      network &&
      strictNeighbors &&
      !topologyLinks(network).some(
        (l) => (l.a === d.id && l.b === r.nextHopId) || (l.b === d.id && l.a === r.nextHopId),
      )
    )
      throw Error('Następny skok trasy musi być bezpośrednio połączony z urządzeniem.');
  }
  const forwards = new Set<string>();
  for (const r of d.portForwards || []) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !['TCP', 'UDP'].includes(r.protocol) ||
      !validIp(r.externalIp) ||
      !validIp(r.internalIp) ||
      !port(r.externalPort) ||
      !port(r.internalPort) ||
      typeof r.enabled !== 'boolean'
    )
      throw Error('Przekierowanie wymaga poprawnych IP, portów 1–65535 i protokołu TCP lub UDP.');
    const key = `${r.protocol}:${r.externalIp}:${r.externalPort}`;
    if (r.enabled && forwards.has(key))
      throw Error(
        'Aktywne przekierowania nie mogą używać tego samego publicznego IP, protokołu i portu.',
      );
    if (r.enabled) forwards.add(key);
  }
  const publics = new Set<string>();
  const privates = new Set<string>();
  for (const r of d.staticNat || []) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !validIp(r.publicIp) ||
      !validIp(r.privateIp) ||
      typeof r.enabled !== 'boolean'
    )
      throw Error('Static NAT wymaga poprawnego publicznego i prywatnego IPv4.');
    if (r.enabled && (publics.has(r.publicIp) || privates.has(r.privateIp)))
      throw Error('Static NAT wymaga unikalnych mapowań 1:1.');
    if (r.enabled) {
      publics.add(r.publicIp);
      privates.add(r.privateIp);
    }
  }
}
export const defaultVlans: Vlan[] = [
  { id: 10, name: 'Sieć biurowa', cidr: '10.0.10.0/24', gateway: '10.0.10.1', color: '#6b9e99' },
  { id: 20, name: 'Serwery', cidr: '10.0.20.0/24', gateway: '10.0.20.1', color: '#839bbf' },
];

export function allocateIp(network: Network, vlanId: number, excludeId?: string): string {
  const vlan = network.vlans.find((v) => v.id === vlanId);
  if (!vlan) throw Error('Najpierw wybierz VLAN z listy.');
  const bounds = subnet(vlan.cidr);
  const pool = {
    start: vlan.dhcpStart ? ipNumber(vlan.dhcpStart) - 1 : bounds.start,
    end: vlan.dhcpEnd ? ipNumber(vlan.dhcpEnd) + 1 : bounds.end,
  };
  const used = new Set(
    network.devices.filter((d) => d.id !== excludeId).map((d) => ipNumber(d.ip)),
  );
  used.add(ipNumber(vlan.gateway));
  const current = network.devices.find((d) => d.id === excludeId);
  if (
    current?.vlan === vlanId &&
    hostInVlan(current.ip, vlan) &&
    ipNumber(current.ip) > pool.start &&
    ipNumber(current.ip) < pool.end &&
    !used.has(ipNumber(current.ip))
  )
    return current.ip;
  // At most N occupied addresses need to be skipped, even for a large subnet.
  for (let ip = pool.start + 1; ip < pool.end; ip++) if (!used.has(ip)) return numberIp(ip);
  throw Error(`Brak wolnych adresów w VLAN ${vlanId}. Powiększ podsieć lub usuń urządzenie.`);
}
export function validateVlans(vlans: Vlan[]) {
  const ids = new Set<number>();
  const pools: ReturnType<typeof subnet>[] = [];
  for (const vlan of vlans) {
    if (!vlan || typeof vlan !== 'object') throw Error('Nieprawidłowa konfiguracja VLAN-u.');
    if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094 || ids.has(vlan.id))
      throw Error('VLAN-y muszą mieć unikalne ID od 1 do 4094.');
    if (
      typeof vlan.name !== 'string' ||
      !vlan.name.trim() ||
      typeof vlan.color !== 'string' ||
      !/^#[\da-f]{6}$/i.test(vlan.color)
    )
      throw Error('Podaj nazwę i kolor każdego VLAN-u.');
    if (typeof vlan.cidr !== 'string' || typeof vlan.gateway !== 'string')
      throw Error('Nieprawidłowa konfiguracja podsieci VLAN.');
    const pool = subnet(vlan.cidr);
    if (vlan.dhcpEnabled !== undefined && typeof vlan.dhcpEnabled !== 'boolean')
      throw Error('Nieprawidłowy stan DHCP.');
    if (
      vlan.leaseMinutes !== undefined &&
      (!Number.isInteger(vlan.leaseMinutes) || vlan.leaseMinutes < 1 || vlan.leaseMinutes > 10080)
    )
      throw Error('Czas dzierżawy DHCP musi wynosić 1–10080 minut.');
    for (const key of ['gatewayDeviceId', 'dhcpServerId', 'relayDeviceId'] as const)
      if (vlan[key] !== undefined && typeof vlan[key] !== 'string')
        throw Error('Nieprawidłowe przypisanie urządzenia do sieci.');
    if (
      vlan.dnsServerIds !== undefined &&
      (!Array.isArray(vlan.dnsServerIds) ||
        vlan.dnsServerIds.length > 4 ||
        vlan.dnsServerIds.some((id) => typeof id !== 'string'))
    )
      throw Error('Sieć może mieć maksymalnie 4 resolvery DNS.');
    if (vlan.dhcpStart && !hostInVlan(vlan.dhcpStart, vlan))
      throw Error(`Początek puli DHCP VLAN ${vlan.id} musi być adresem hosta z tej podsieci.`);
    if (vlan.dhcpEnd && !hostInVlan(vlan.dhcpEnd, vlan))
      throw Error(`Koniec puli DHCP VLAN ${vlan.id} musi być adresem hosta z tej podsieci.`);
    if (vlan.dhcpStart && vlan.dhcpEnd && ipNumber(vlan.dhcpStart) > ipNumber(vlan.dhcpEnd))
      throw Error('Początek puli DHCP nie może być większy od końca.');
    if (!hostInVlan(vlan.gateway, vlan))
      throw Error(`Brama VLAN ${vlan.id} musi należeć do podsieci ${pool.canonical}.`);
    if (pools.some((p) => p.start <= pool.end && pool.start <= p.end))
      throw Error('Podsieci VLAN-ów nie mogą się nakładać.');
    ids.add(vlan.id);
    pools.push(pool);
  }
}
export function validateNetworkServices(network: Network) {
  for (const v of network.vlans) {
    if (
      v.gatewayDeviceId &&
      !network.devices.some((d) => d.id === v.gatewayDeviceId && isRoutingDevice(d))
    )
      throw Error(`Brama sieci „${v.name}” musi być routerem, firewallem lub switchem L3.`);
    if (
      v.dhcpEnabled &&
      (!v.dhcpServerId || !network.devices.some((d) => d.id === v.dhcpServerId && isDhcpServer(d)))
    )
      throw Error(`Wybierz serwer DHCP dla sieci „${v.name}”. Switch L2 nie jest serwerem DHCP.`);
    if (
      v.relayDeviceId &&
      !network.devices.some((d) => d.id === v.relayDeviceId && isRoutingDevice(d))
    )
      throw Error('Relay DHCP wymaga routera lub switcha L3.');
  }
}
export function applyVlans(network: Network, vlans: Vlan[]): Network {
  validateVlans(vlans);
  const normalized = vlans.map((v) => ({
    ...v,
    name: v.name.trim(),
    cidr: subnet(v.cidr).canonical,
  }));
  const next: Network = {
    ...network,
    vlans: normalized,
    devices: network.devices.map((d) => ({
      ...d,
      ...(d.allowedVlans
        ? { allowedVlans: d.allowedVlans.filter((id) => normalized.some((v) => v.id === id)) }
        : {}),
    })),
  };
  validateNetworkServices(next);
  for (const d of next.devices) {
    if (!d.vlan) continue;
    const vlan = normalized.find((v) => v.id === d.vlan);
    if (!vlan)
      throw Error(
        `VLAN ${d.vlan} jest używany przez „${d.name}”. Najpierw przenieś urządzenie do innego VLAN-u.`,
      );
    if (d.kind !== 'switch-unmanaged' && d.ipMode === 'static' && !hostInVlan(d.ip, vlan))
      throw Error(
        `Statyczny IP urządzenia „${d.name}” nie należy do nowej podsieci VLAN ${d.vlan}. Zmień go lub włącz adres automatyczny.`,
      );
  }
  // Reserve static addresses first; then allocate automatic addresses atomically.
  const assigned: Network = {
    ...next,
    devices: next.devices.filter((d) => d.ipMode === 'static' || !d.vlan),
  };
  for (const d of next.devices.filter((d) => d.ipMode === 'auto' && d.vlan)) {
    const vlan = normalized.find((v) => v.id === d.vlan)!;
    const canKeep =
      hostInVlan(d.ip, vlan) &&
      d.ip !== vlan.gateway &&
      !assigned.devices.some((other) => other.ip === d.ip);
    d.ip = canKeep ? d.ip : allocateIp(assigned, d.vlan);
    assigned.devices.push(d);
  }
  return next;
}

export function parseNetwork(text: string): Network {
  const n = JSON.parse(text);
  if (
    !n ||
    typeof n.name !== 'string' ||
    !Array.isArray(n.devices) ||
    !Array.isArray(n.links) ||
    n.devices.length > 500 ||
    n.links.length > 2000
  )
    throw Error('Nieprawidłowy format projektu.');
  const ids = new Set<string>();
  for (const d of n.devices) {
    if (
      !d ||
      typeof d.id !== 'string' ||
      ids.has(d.id) ||
      !Object.hasOwn(kinds, d.kind) ||
      typeof d.name !== 'string' ||
      !(validIp(d.ip) || ((d.kind === 'switch-unmanaged' || d.ipMode === 'auto') && d.ip === '')) ||
      !Number.isInteger(d.vlan) ||
      d.vlan < 0 ||
      d.vlan > 4094 ||
      !Number.isFinite(d.x) ||
      !Number.isFinite(d.y) ||
      typeof d.online !== 'boolean' ||
      !Array.isArray(d.rules)
    )
      throw Error('Nieprawidłowe dane urządzenia.');
    ids.add(d.id);
    if (d.ipMode === undefined) d.ipMode = 'static';
    if (!['auto', 'static'].includes(d.ipMode)) throw Error('Nieprawidłowy tryb adresowania IP.');
    for (const r of d.rules)
      if (
        !r ||
        typeof r.id !== 'string' ||
        !['allow', 'deny'].includes(r.action) ||
        !['ANY', 'ICMP', 'TCP', 'UDP'].includes(r.protocol) ||
        typeof r.port !== 'string' ||
        (r.port !== '*' && (!/^\d+$/.test(r.port) || +r.port < 1 || +r.port > 65535)) ||
        typeof r.source !== 'string' ||
        typeof r.destination !== 'string' ||
        !validAclAddress(r.source) ||
        !validAclAddress(r.destination) ||
        (r.ingress !== undefined && !['any', 'lan', 'wan'].includes(r.ingress))
      )
        throw Error('Nieprawidłowa reguła firewalla.');
  }
  const links = new Set<string>();
  for (const l of n.links) {
    if (
      !l ||
      typeof l.id !== 'string' ||
      links.has(l.id) ||
      !ids.has(l.a) ||
      !ids.has(l.b) ||
      l.a === l.b
    )
      throw Error('Nieprawidłowe połączenie.');
    links.add(l.id);
    if (
      (l.mode !== undefined && !['auto', 'access', 'trunk'].includes(l.mode)) ||
      (l.accessVlan !== undefined &&
        (!Number.isInteger(l.accessVlan) || l.accessVlan < 1 || l.accessVlan > 4094)) ||
      (l.allowedVlans !== undefined &&
        (!Array.isArray(l.allowedVlans) ||
          l.allowedVlans.some((id: number) => !Number.isInteger(id) || id < 1 || id > 4094)))
    )
      throw Error('Nieprawidłowa konfiguracja access/trunk połączenia.');
  }
  // Migrate projects saved before shared VLAN configuration existed without changing their IPs.
  if (n.vlans === undefined)
    n.vlans = [...new Set<number>(n.devices.map((d: Device) => d.vlan))]
      .filter((id) => id > 0)
      .map((id) => {
        const d = n.devices.find((d: Device) => d.vlan === id);
        const address = `${d.ip.split('.').slice(0, 3).join('.')}.0/24`;
        return {
          id,
          name: defaultVlans.find((v) => v.id === id)?.name || `VLAN ${id}`,
          cidr: address,
          gateway: numberIp(subnet(address).start + 1),
          color: defaultVlans.find((v) => v.id === id)?.color || '#839bbf',
        };
      });
  if (!Array.isArray(n.vlans) || n.vlans.length > 4094) throw Error('Nieprawidłowa lista VLAN-ów.');
  validateVlans(n.vlans);
  validateNetworkServices(n);
  if (n.devices.some((d: Device) => d.vlan && !n.vlans.some((v: Vlan) => v.id === d.vlan)))
    throw Error('Urządzenie odwołuje się do nieistniejącego VLAN-u.');
  for (const d of n.devices) validateDeviceConfig(d, n, false);
  return n;
}
