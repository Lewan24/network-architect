import { modernInfrastructure } from './modernInfrastructure';
import { defaultServices } from '../devices/deviceCatalog';
import { defaultInternet } from '../model/internetModel';
import { defaultPorts } from '../model/ports';
import { reconcileDhcp } from '../model/dhcp';
import type { Device, Network, Port, Rule, Service } from '../model/networkTypes';
export const svc = (
  port: number,
  name: string,
  protocol: Service['protocol'] = 'TCP',
): Service => ({ id: `${protocol}-${port}`, name, protocol, port, enabled: true });
export const token = (d: Device) => `device:${d.id}`;
export function allow(
  d: Device,
  source: string,
  destination: string,
  protocol: Rule['protocol'] = 'ANY',
  port = '*',
  ingress: Rule['ingress'] = 'lan',
) {
  d.rules.push({
    id: `policy-${d.rules.length + 1}`,
    source,
    destination,
    protocol,
    port,
    ingress,
    action: 'allow',
  });
}
export function privateDeny(d: Device, source: string) {
  for (const destination of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'])
    d.rules.push({
      id: `private-${d.rules.length + 1}`,
      source,
      destination,
      protocol: 'ANY',
      port: '*',
      ingress: 'lan',
      action: 'deny',
    });
}
export class ExampleBuilder {
  network: Network;
  internet: Device;
  fw: Device;
  core: Device;
  constructor(
    public prefix: string,
    name: string,
    zones: [number, string][],
  ) {
    if (!zones.some(([id]) => id === 99)) zones = [[99, 'Zarządzanie'], ...zones];
    this.network = {
      exampleId: prefix,
      name,
      devices: [],
      links: [],
      vlans: zones.map(([id, label], i) => ({
        id,
        name: label,
        cidr: `192.168.${id}.0/24`,
        gateway: `192.168.${id}.1`,
        color: ['#658eaf', '#679b89', '#9b87b2', '#b59b6d', '#6f9da9', '#b4838e', '#8d9b70'][i % 7],
        gatewayDeviceId: `${prefix}-fw`,
        dhcpEnabled: id !== 99,
        dhcpServerId: `${prefix}-fw`,
        dhcpStart: `192.168.${id}.100`,
        dhcpEnd: `192.168.${id}.180`,
        leaseMinutes: 120,
        dnsServerIds: [],
      })),
    };
    this.internet = { ...defaultInternet(), id: this.id('internet'), x: 600, y: -150 };
    this.internet.ports = defaultPorts(this.internet);
    this.network.devices.push(this.internet);
    this.fw = this.host('fw', 'gateway', 99, 1, 600, 40, 'Firewall brzegowy');
    Object.assign(this.fw, {
      edgeRole: 'edge',
      wanIp: '203.0.113.10',
      outboundNat: true,
      defaultAcl: 'deny',
      routingMode: 'static',
      routes: [
        { id: 'default', destination: '0.0.0.0/0', nextHopId: this.internet.id, metric: 100 },
      ],
    });
    this.core = this.host('core', 'switch', 99, 2, 600, 250, 'Switch dystrybucyjny');
    this.core.allowedVlans = zones.map(([id]) => id);
    this.connect(this.internet, this.fw, 0);
    this.connect(
      this.fw,
      this.core,
      zones.map(([id]) => id),
    );
  }
  id(key: string) {
    return `${this.prefix}-${key}`;
  }
  host(
    key: string,
    kind: Device['kind'],
    vlan: number,
    suffix: number | undefined,
    x: number,
    y: number,
    name: string,
    services?: Service[],
  ): Device {
    const d: Device = {
      id: this.id(key),
      kind,
      vlan,
      ip: suffix === undefined ? '' : `192.168.${vlan}.${suffix}`,
      ipMode: suffix === undefined ? 'auto' : 'static',
      x,
      y,
      name,
      online: true,
      rules: [],
      services: services || defaultServices(kind),
    };
    d.ports = defaultPorts(d);
    this.network.devices.push(d);
    return d;
  }
  connect(a: Device, b: Device, vlan: number | number[]) {
    const wifi =
      (a.kind === 'accesspoint' &&
        ['mobile-phone', 'workstation', 'laptop', 'iot'].includes(b.kind)) ||
      (b.kind === 'accesspoint' &&
        ['mobile-phone', 'workstation', 'laptop', 'iot'].includes(a.kind));
    const free = (d: Device): Port => {
      const p = d.ports!.find(
        (p) =>
          p.connector === (wifi ? 'wifi' : 'rj45') &&
          ((wifi && d.kind === 'accesspoint') ||
            !this.network.links.some(
              (l) => (l.a === d.id && l.aPortId === p.id) || (l.b === d.id && l.bPortId === p.id),
            )),
      );
      if (!p) throw Error(`${d.name}: brak gniazd w przykładzie`);
      return p;
    };
    const ap = free(a),
      bp = free(b);
    const values = Array.isArray(vlan)
      ? { mode: 'trunk' as const, nativeVlan: 99, allowedVlans: [...vlan], tagNative: true }
      : vlan
        ? { mode: 'access' as const, accessVlan: vlan }
        : { mode: 'auto' as const };
    Object.assign(ap, values);
    Object.assign(bp, values);
    const link = {
      id: `${this.prefix}-wire-${this.network.links.length}`,
      a: a.id,
      b: b.id,
      aPortId: ap.id,
      bPortId: bp.id,
      cable: wifi ? ('wireless' as const) : ('cat6a' as const),
      ...(!wifi ? { lengthMeters: 5 } : {}),
      ...(Array.isArray(vlan)
        ? { mode: 'trunk' as const, allowedVlans: [...vlan] }
        : vlan
          ? { mode: 'access' as const, accessVlan: vlan }
          : {}),
      label: Array.isArray(vlan)
        ? `Trunk ${vlan.join('/')}`
        : vlan
          ? `${wifi ? 'Wi-Fi' : 'Access'} VLAN ${vlan}`
          : 'WAN · bez tagowania',
    };
    this.network.links.push(link);
    return link;
  }
  endpoint(
    key: string,
    kind: Device['kind'],
    vlan: number,
    suffix: number | undefined,
    x: number,
    y: number,
    name: string,
    services?: Service[],
  ) {
    const d = this.host(key, kind, vlan, suffix, x, y, name, services);
    this.connect(this.core, d, vlan);
    return d;
  }
  dns(vlan: number, x: number, y: number) {
    const dns = this.endpoint('dns', 'dns', vlan, 53, x, y, 'DNS wewnętrzny');
    for (const v of this.network.vlans) v.dnsServerIds = [dns.id];
    return dns;
  }
  finish(disableUnused = true) {
    modernInfrastructure(this.network, this.prefix);
    if (disableUnused)
      for (const d of this.network.devices)
        for (const p of d.ports || []) {
          if (
            p.connector !== 'virtual' &&
            !this.network.links.some(
              (l) => (l.a === d.id && l.aPortId === p.id) || (l.b === d.id && l.bPortId === p.id),
            )
          )
            p.enabled = false;
        }
    return reconcileDhcp(this.network);
  }
}
