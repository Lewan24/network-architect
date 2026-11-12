import { defaultPorts } from '../model/ports';
import type { Point } from '../canvas/canvasGeometry';
import { defaultServices, kinds } from '../devices/deviceCatalog';
import { allocateIp, isHypervisor, ipNumber, numberIp, routeSubnet } from '../model/network';
import type { Device, Kind, Network } from '../model/networkTypes';

export function unusedStaticAddress(network: Network, prefix = '10.255.0'): string {
  for (let suffix = 1; suffix < 255; suffix++) {
    const address = `${prefix}.${suffix}`;
    const occupied = network.devices.some(
      (device) => device.ip === address || device.wanIp === address,
    );
    if (!occupied) return address;
  }
  throw Error('Brak wolnych adresów w tej podsieci.');
}

/** Creates configuration; DHCP reconciliation happens when the project is committed. */
export function createNetworkDevice(network: Network, kind: Kind, point: Point): Device {
  const infrastructure = ['internet', 'gateway', 'router', 'firewall', 'switch-l3'].includes(kind);
  const supportsAcl = ['gateway', 'firewall', 'router', 'switch-l3'].includes(kind);
  const supportsEdgeRole = ['gateway', 'router', 'firewall'].includes(kind);
  const defaultVlan =
    network.vlans.find((vlan) => vlan.dhcpEnabled && vlan.dhcpServerId)?.id ||
    network.vlans[0]?.id ||
    0;
  const device: Device = {
    id: crypto.randomUUID(),
    kind,
    name: `${kinds[kind].label} ${network.devices.filter((device) => device.kind === kind).length + 1}`,
    ip: infrastructure
      ? unusedStaticAddress(network, kind === 'internet' ? '203.0.113' : '10.255.0')
      : '',
    ipMode: infrastructure || kind === 'switch-unmanaged' ? 'static' : 'auto',
    vlan: infrastructure ? 0 : defaultVlan,
    x: Math.round(point.x / 10) * 10,
    y: Math.round(point.y / 10) * 10,
    online: true,
    rules: [],
    services: defaultServices(kind),
  };
  if (supportsAcl) device.defaultAcl = 'deny';
  if (supportsEdgeRole) device.edgeRole = kind === 'gateway' ? 'edge' : 'internal';
  if (kind === 'gateway') {
    device.wanIp = unusedStaticAddress(network, '203.0.113');
    device.outboundNat = true;
  }
  if (kind === 'vm') device.hostId = network.devices.find(isHypervisor)?.id || '';
  device.ports = defaultPorts(device);
  return device;
}

export function createGuestDevice(network: Network, host: Device): Device {
  return {
    id: crypto.randomUUID(),
    kind: 'vm',
    name: `VM ${network.devices.filter((device) => device.kind === 'vm').length + 1}`,
    ip: '',
    ipMode: 'auto',
    services: defaultServices('vm'),
    vlan: host.vlan,
    hostId: host.id,
    x: host.x + 150,
    y: host.y + 90,
    online: true,
    rules: [],
  };
}

export function duplicateNetworkDevice(network: Network, device: Device): Device {
  let address = '';
  if (
    !device.interfaces?.length &&
    device.kind !== 'switch-unmanaged' &&
    device.ipMode !== 'auto'
  ) {
    address = device.vlan
      ? allocateIp(network, device.vlan)
      : unusedStaticAddress(network, device.ip.split('.').slice(0, 3).join('.'));
  }
  const used = new Set(
    network.devices
      .flatMap((d) => [d.ip, d.wanIp || '', ...(d.interfaces || []).map((n) => n.ip)])
      .filter(Boolean),
  );
  for (const v of network.vlans) used.add(v.gateway);
  const interfaces = device.interfaces?.map((nic) => {
    if (nic.ipMode === 'auto') return { ...structuredClone(nic), ip: '', lease: undefined };
    const bounds = routeSubnet(`${nic.ip}/${nic.prefix}`);
    const first = nic.prefix >= 31 ? bounds.start : bounds.start + 1;
    const end = nic.prefix >= 31 ? bounds.end : bounds.end - 1;
    for (let n = first; n <= end && n <= first + used.size + 1; n++) {
      const ip = numberIp(n);
      if (!used.has(ip) && ipNumber(ip) !== ipNumber(nic.gateway || '0.0.0.0')) {
        used.add(ip);
        return { ...structuredClone(nic), ip, lease: undefined };
      }
    }
    throw Error(`Brak wolnego adresu dla kopiowanego interfejsu ${nic.name}.`);
  });
  return {
    ...structuredClone(device),
    id: crypto.randomUUID(),
    name: `${device.name.slice(0, 32)} — kopia`,
    lease: undefined,
    interfaces,
    ip: interfaces?.[0].ip ?? address,
    ipMode: interfaces?.[0].ipMode ?? device.ipMode,
    x: device.x + 90,
    y: device.y + 60,
  };
}

/** A virtual-link removal detaches its guest. Removing a host keeps the guest devices. */
export function removeNetworkObject(network: Network, id: string): Network {
  const detachedGuestId = id.startsWith('virtual:') ? id.slice(8) : null;
  return {
    ...network,
    vlans: network.vlans.map((vlan) => ({
      ...vlan,
      ...(vlan.gatewayDeviceId === id ? { gatewayDeviceId: '' } : {}),
      ...(vlan.dhcpServerId === id ? { dhcpServerId: '', dhcpEnabled: false } : {}),
      ...(vlan.relayDeviceId === id ? { relayDeviceId: '' } : {}),
    })),
    devices: network.devices
      .filter((device) => device.id !== id)
      .map((device) => ({
        ...device,
        ...(device.hostId === id || device.id === detachedGuestId ? { hostId: '' } : {}),
        ...(device.routes
          ? { routes: device.routes.filter((route) => route.nextHopId !== id) }
          : {}),
      })),
    links: network.links.filter((link) => link.id !== id && link.a !== id && link.b !== id),
  };
}
