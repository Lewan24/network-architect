import { projectNetworkAccess } from './radius';
import {
  connectedNextHop,
  expandInterfaceClients,
  restoreInterfaceClients,
  routedInterface,
} from './interfaces';
import { materializeHardware, operationalNetwork, transferVlan } from './ports';
import {
  hasAcl,
  bridgesVlan,
  hostInVlan,
  ipNumber,
  isDhcpServer,
  isHypervisor,
  isRoutingDevice,
  matchesAclAddress,
  numberIp,
  routeSubnet,
  subnet,
  topologyLinks,
  validIp,
} from './network';
import type { Device, Network, Vlan } from './networkTypes';
export function poolBounds(vlan: Vlan) {
  const p = subnet(vlan.cidr);
  return {
    start: vlan.dhcpStart ? ipNumber(vlan.dhcpStart) : p.start + 1,
    end: vlan.dhcpEnd ? ipNumber(vlan.dhcpEnd) : p.end - 1,
  };
}
export function vlanInterface(network: Network, device: Device, vlan: number) {
  return (
    !vlan ||
    network.vlans.some((v) => v.id === vlan && v.gatewayDeviceId === device.id) ||
    device.vlan === vlan ||
    !!device.interfaces?.some((n) => n.enabled && n.vlan === vlan)
  );
}
export function layer2Path(
  network: Network,
  source: string,
  target: string,
  vlan: number,
  sourcePortId?: string,
) {
  network = operationalNetwork(network);
  const byId = new Map(network.devices.map((d) => [d.id, d]));
  const links = topologyLinks(network);
  const adjacent = new Map<string, typeof links>();
  for (const l of links) {
    adjacent.set(l.a, [...(adjacent.get(l.a) || []), l]);
    adjacent.set(l.b, [...(adjacent.get(l.b) || []), l]);
  }
  const queue = [{ path: [source], vlan }];
  const seen = new Set([`${source}:${vlan}`]);
  while (queue.length) {
    const { path, vlan: currentVlan } = queue.shift()!;
    const id = path.at(-1)!;
    const d = byId.get(id);
    if (!d?.online) continue;
    if (id === target && vlanInterface(network, d, currentVlan)) return path;
    if (id !== source && !bridgesVlan(d, currentVlan) && !isHypervisor(d)) continue;
    for (const l of adjacent.get(id) || []) {
      if (
        id === source &&
        sourcePortId &&
        !((l.a === id && l.aPortId === sourcePortId) || (l.b === id && l.bPortId === sourcePortId))
      )
        continue;
      const sent = transferVlan(network, l, id, currentVlan);
      if (sent.error) continue;
      const next = l.a === id ? l.b : l.b === id ? l.a : null;
      if (next && !seen.has(`${next}:${sent.vlan}`)) {
        seen.add(`${next}:${sent.vlan}`);
        queue.push({ path: [...path, next], vlan: sent.vlan });
      }
    }
  }
  return null;
}
function relayPath(
  network: Network,
  from: Device,
  to: Device,
  sourceIp: string,
  destinationIp: string,
) {
  const links = topologyLinks(network);
  const queue: string[][] = [[from.id]];
  const seen = new Set([from.id]);
  while (queue.length) {
    const path = queue.shift()!;
    const id = path.at(-1)!;
    const d = network.devices.find((d) => d.id === id)!;
    if (!d.online) continue;
    if (id === to.id) return path;
    if (
      id !== from.id &&
      [
        'iot',
        'laptop',
        'nvr',
        'mini-server',
        'ups',
        'server',
        'dns',
        'radius',
        'camera',
        'workstation',
        'mobile-phone',
        'vm',
        'printer',
        'internet',
      ].includes(d.kind)
    )
      continue;
    if (id !== from.id && hasAcl(d)) {
      const r = d.rules.find(
        (r) =>
          (r.protocol === 'ANY' || r.protocol === 'UDP') &&
          (r.port === '*' || r.port === '67') &&
          (!r.ingress || r.ingress === 'any' || r.ingress === 'lan') &&
          matchesAclAddress(r.source, sourceIp, network) &&
          matchesAclAddress(r.destination, destinationIp, network),
      );
      if ((r?.action || d.defaultAcl || 'deny') !== 'allow') continue;
    }
    let neighbors = links.flatMap((l) => (l.a === id ? [l.b] : l.b === id ? [l.a] : []));
    if (isRoutingDevice(d) && d.routingMode === 'static') {
      const ip = ipNumber(destinationIp);
      const nic = routedInterface(d, destinationIp);
      const connected = nic
        ? { id: nic.vlan }
        : network.vlans.find(
            (v) => (v.gatewayDeviceId === d.id || v.id === d.vlan) && hostInVlan(destinationIp, v),
          );
      if (connected) {
        const local = layer2Path(network, d.id, to.id, connected.id, nic?.portId);
        if (local) return [...path, ...local.slice(1)];
        continue;
      }
      const route = (d.routes || [])
        .filter((r) => {
          const p = routeSubnet(r.destination);
          return ip >= p.start && ip <= p.end;
        })
        .sort(
          (a, b) =>
            routeSubnet(b.destination).prefix - routeSubnet(a.destination).prefix ||
            a.metric - b.metric,
        )[0];
      const nextDevice = route && network.devices.find((n) => n.id === route.nextHopId);
      const hop = nextDevice && connectedNextHop(network, d, nextDevice);
      if (hop && nextDevice?.online && !seen.has(nextDevice.id)) {
        const local = layer2Path(network, d.id, nextDevice.id, hop.vlan, hop.portId);
        if (local) {
          seen.add(nextDevice.id);
          queue.push([...path, ...local.slice(1)]);
        }
        continue;
      }
      neighbors = route ? neighbors.filter((id) => id === route.nextHopId) : [];
    }
    for (const next of neighbors)
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
  }
  return null;
}
export type DhcpStatus = {
  state: 'static' | 'bound' | 'waiting' | 'offline';
  message: string;
  path: string[];
};
export function discoverDhcp(network: Network, client: Device): DhcpStatus {
  network = operationalNetwork(network);
  client = network.devices.find((d) => d.id === client.id) || client;
  if (client.ipMode !== 'auto')
    return { state: 'static', message: 'Statyczny adres IPv4.', path: [] };
  if (!client.online) return { state: 'offline', message: 'Urządzenie jest wyłączone.', path: [] };
  const vlan = network.vlans.find((v) => v.id === client.vlan);
  const server = network.devices.find((d) => d.id === vlan?.dhcpServerId);
  const wait = (message: string): DhcpStatus => ({ state: 'waiting', message, path: [] });
  if (!vlan?.dhcpEnabled)
    return wait('DHCP jest wyłączone w tej sieci. Włącz pulę i wskaż serwer w ustawieniach sieci.');
  if (!server || !isDhcpServer(server) || !server.online)
    return wait('Serwer DHCP jest niedostępny lub nie został wybrany.');
  if (server.id === client.id && client.ipMode === 'auto' && !client.lease)
    return wait(
      'Serwer DHCP wymaga wcześniej skonfigurowanego adresu interfejsu. Ustaw jego IP statycznie lub użyj innego serwera.',
    );
  if (
    !(isRoutingDevice(server) && vlan.gatewayDeviceId === server.id) &&
    (!validIp(server.ip) || (server.ipMode === 'auto' && !server.lease))
  )
    return wait(
      'Serwer DHCP wymaga skonfigurowanego adresu IP lub własnej ważnej dzierżawy od innego serwera.',
    );
  const local = layer2Path(network, client.id, server.id, vlan.id);
  if (local)
    return {
      state: 'bound',
      message: 'DHCP DISCOVER → OFFER → REQUEST → ACK w tej samej domenie L2.',
      path: local,
    };
  const relay = network.devices.find((d) => d.id === vlan.relayDeviceId);
  if (!relay || !isRoutingDevice(relay) || !relay.online)
    return wait(
      'Broadcast DHCP nie dociera do serwera. Dla innej podsieci skonfiguruj relay na routerze lub switchu L3.',
    );
  const first = layer2Path(network, client.id, relay.id, vlan.id);
  if (!first) return wait('Brak połączenia L2 do przekaźnika DHCP w VLAN-ie klienta.');
  if (!validIp(server.ip)) return wait('Serwer DHCP nie ma adresu IP.');
  const relayIp =
    routedInterface(relay, vlan.gateway)?.ip || (relay.vlan === vlan.id ? relay.ip : vlan.gateway);
  const forward = relayPath(network, relay, server, relayIp, server.ip);
  const reverse = relayPath(network, server, relay, server.ip, relayIp);
  if (!forward || !reverse)
    return wait(
      'Relay DHCP: brak trasy lub zezwolenia UDP/67 w drodze do serwera albo z powrotem.',
    );
  return {
    state: 'bound',
    message:
      'DHCP przez relay: DISCOVER/OFFER/REQUEST/ACK; trasa UDP/67 sprawdzona w obu kierunkach.',
    path: [...first, ...forward.slice(1)],
  };
}
function reconcileClientNetwork(network: Network, now: number, renewId?: string): Network {
  const devices = network.devices.map((d) => ({ ...d }));
  const next = { ...network, devices };
  const active = operationalNetwork(next);
  const activeById = new Map(active.devices.map((d) => [d.id, d]));
  const reserved = new Set(
    devices.filter((d) => d.ipMode === 'static' && validIp(d.ip)).map((d) => ipNumber(d.ip)),
  );
  for (const d of devices)
    for (const n of d.interfaces || [])
      if (n.ipMode === 'static' && validIp(n.ip)) reserved.add(ipNumber(n.ip));
  for (const v of network.vlans) reserved.add(ipNumber(v.gateway));
  const retained = new Set<string>();
  for (const d of devices.filter((d) => d.ipMode === 'auto')) {
    const vlan = network.vlans.find((v) => v.id === d.vlan);
    const lease = d.lease;
    if (
      lease &&
      lease.vlan === d.vlan &&
      lease.expiresAt > now &&
      vlan &&
      hostInVlan(lease.ip, vlan) &&
      !reserved.has(ipNumber(lease.ip))
    ) {
      retained.add(d.id);
      reserved.add(ipNumber(lease.ip));
    }
  }
  for (const d of devices.filter((d) => d.ipMode === 'auto')) {
    const vlan = network.vlans.find((v) => v.id === d.vlan);
    const lease = d.lease;
    const validLease = retained.has(d.id);
    if (validLease) {
      reserved.delete(ipNumber(lease!.ip));
      d.ip = lease!.ip;
    }
    // Refresh lease/address data while reusing the physical snapshot for this reconciliation.
    for (const raw of devices) {
      const node = activeById.get(raw.id)!;
      node.ip = raw.ip;
      node.lease = raw.lease;
    }
    const discovery = discoverDhcp(active, activeById.get(d.id)!);
    const renewalDue =
      renewId === d.id ||
      renewId === '*' ||
      !validLease ||
      (!!lease && now >= lease.obtainedAt + (lease.expiresAt - lease.obtainedAt) / 2);
    if (validLease && (!renewalDue || discovery.state !== 'bound')) {
      d.ip = lease!.ip;
      reserved.add(ipNumber(d.ip));
      continue;
    }
    if (!vlan || discovery.state !== 'bound') {
      d.ip = '';
      delete d.lease;
      continue;
    }
    const pool = poolBounds(vlan);
    let chosen = '';
    if (
      validIp(d.ip) &&
      hostInVlan(d.ip, vlan) &&
      ipNumber(d.ip) >= pool.start &&
      ipNumber(d.ip) <= pool.end &&
      !reserved.has(ipNumber(d.ip))
    )
      chosen = d.ip;
    else
      for (let ip = pool.start; ip <= pool.end; ip++)
        if (!reserved.has(ip)) {
          chosen = numberIp(ip);
          break;
        }
    if (!chosen) {
      d.ip = '';
      delete d.lease;
      continue;
    }
    d.ip = chosen;
    reserved.add(ipNumber(chosen));
    d.lease = {
      ip: chosen,
      vlan: d.vlan,
      serverId: vlan.dhcpServerId!,
      obtainedAt: now,
      expiresAt: now + (vlan.leaseMinutes || 120) * 60000,
      dnsServerIds: [...(vlan.dnsServerIds || [])],
      prefix: subnet(vlan.cidr).prefix,
      gateway: vlan.gatewayDeviceId ? vlan.gateway : '',
    };
  }
  return next;
}
export function dhcpStatus(network: Network, client: Device, now = Date.now()): DhcpStatus {
  if (client.accessSession && client.accessSession.state !== 'accepted')
    return {
      state: 'waiting',
      path: client.accessSession.authPath,
      message: client.accessSession.reason,
    };
  const discovery = discoverDhcp(network, client);
  if (client.ipMode === 'auto' && client.lease && client.lease.expiresAt > now && client.ip) {
    return {
      state: 'bound',
      path: discovery.path,
      message: `Dzierżawa do ${new Date(client.lease.expiresAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}.${discovery.state === 'bound' ? '' : ' Serwer obecnie niedostępny; ważna dzierżawa pozostaje aktywna.'}`,
    };
  }
  if (discovery.state === 'bound' && !client.ip)
    return {
      state: 'waiting',
      message: 'Serwer odpowiada, ale w puli nie ma wolnego adresu.',
      path: discovery.path,
    };
  return discovery;
}

export function reconcileDhcp(network: Network, now = Date.now(), renewId?: string): Network {
  network = materializeHardware(network);
  if (network.devices.some((d) => d.radiusNas)) network = reconcileClientNetwork(network, now);
  network = projectNetworkAccess(network, now);
  const expanded = expandInterfaceClients(network);
  const renewed = reconcileClientNetwork(
    expanded.network,
    now,
    expanded.bindings.size && renewId && renewId !== '*' ? undefined : renewId,
  );
  if (renewId && renewId !== '*' && expanded.bindings.size) {
    // Explicit renewal applies to every adapter belonging to the selected physical host.
    let next = renewed;
    for (const [id, b] of expanded.bindings)
      if (b.owner === renewId) next = reconcileClientNetwork(next, now, id);
    return restoreInterfaceClients(network, next, expanded.bindings);
  }
  return restoreInterfaceClients(network, renewed, expanded.bindings);
}
