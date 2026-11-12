import { allocateIp } from '../model/network';
import { defaultPorts, makePort } from '../model/ports';
import { defaultServices } from '../devices/deviceCatalog';
import type { Device, Kind, Network, Port } from '../model/networkTypes';

/** Adds a documented AAA/equipment branch without changing a lesson's existing ACLs or failure. */
export function modernInfrastructure(network: Network, prefix: string): Network {
  if (network.devices.some((d) => d.id === `${prefix}-aaa-radius`)) return network;
  const core =
    network.devices.find((d) => d.id === `${prefix}-core`) ||
    network.devices.find((d) => d.id === 'demo-server-switch');
  if (!core) return network;
  const infrastructureVlan = network.vlans.find((v) => v.id === 20)?.id ?? 99;
  const userVlan =
    network.vlans.find((v) => v.id === 20 && v.dhcpEnabled)?.id ??
    network.vlans.find((v) => v.id === 10)?.id ??
    infrastructureVlan;
  const baseVlan =
    prefix === 'demo' ? 30 : (network.vlans.find((v) => v.id === 10)?.id ?? userVlan);
  const iotVlan = network.vlans.find((v) => v.id === 30)?.id ?? userVlan;
  const x = Math.max(...network.devices.map((d) => d.x)) + 300;
  const add = (
    key: string,
    kind: Kind,
    vlan: number,
    name: string,
    y: number,
    auto = false,
  ): Device => {
    const d: Device = {
      id: `${prefix}-aaa-${key}`,
      kind,
      name,
      vlan,
      ip: kind === 'rack' || auto ? '' : allocateIp(network, vlan),
      ipMode: auto ? 'auto' : 'static',
      x,
      y,
      online: true,
      rules: [],
      services: defaultServices(kind),
    };
    if (kind === 'rack') {
      d.vlan = 0;
      d.rack = { heightU: 24, mounts: [] };
    }
    if (kind === 'nvr') d.recorder = { channels: 8, storageTb: 4, retentionDays: 30 };
    if (kind === 'ups')
      d.ups = { capacityVa: 1500, capacityWatts: 900, loadWatts: 300, runtimeMinutes: 15 };
    if (kind === 'mini-server') d.platform = 'Linux';
    if (kind === 'iot') d.platform = 'Raspberry Pi OS';
    d.ports = defaultPorts(d);
    network.devices.push(d);
    return d;
  };
  const free = (d: Device, connector: Port['connector']) => {
    let port = d.ports?.find(
      (p) =>
        p.connector === connector &&
        ((connector === 'wifi' && d.kind === 'accesspoint') ||
          !network.links.some(
            (l) => (l.a === d.id && l.aPortId === p.id) || (l.b === d.id && l.bPortId === p.id),
          )),
    );
    if (!port) {
      port = makePort(`aaa-${d.ports?.length || 0}`, connector, d.vlan);
      d.ports = [...(d.ports || []), port];
    }
    port.enabled = true;
    return port;
  };
  const connect = (a: Device, b: Device, vlans: number | number[], wireless = false) => {
    const ap = free(a, wireless ? 'wifi' : 'rj45'),
      bp = free(b, wireless ? 'wifi' : 'rj45');
    const config = Array.isArray(vlans)
      ? {
          mode: 'trunk' as const,
          nativeVlan: infrastructureVlan,
          allowedVlans: [...vlans],
          tagNative: true,
        }
      : { mode: 'access' as const, accessVlan: vlans };
    Object.assign(ap, config);
    Object.assign(bp, config);
    network.links.push({
      id: `${prefix}-aaa-wire-${network.links.length}`,
      a: a.id,
      b: b.id,
      aPortId: ap.id,
      bPortId: bp.id,
      cable: wireless ? 'wireless' : 'cat6',
      ...(wireless ? {} : { lengthMeters: 3 }),
    });
    return ap;
  };
  const server = add('radius', 'radius', infrastructureVlan, 'RADIUS · konta i VLAN-y', 360);
  const nas = add('nas', 'switch', infrastructureVlan, 'Switch dostępu 802.1X', 580);
  const ap = add('ap', 'accesspoint', infrastructureVlan, 'AP Enterprise · AAA', 800);
  ap.ssid = 'Lab-Enterprise';
  ap.wifiEnterprise = true;
  const mini = add('mini', 'mini-server', userVlan, 'Mini serwer · HTTPS i SSH', 1040);
  const iot = add('iot', 'iot', baseVlan, 'Raspberry Pi · klient 802.1X', 1260, true);
  const laptop = add('laptop', 'laptop', baseVlan, 'Laptop · administrator AAA', 1480, true);
  laptop.x = x + 260;
  const staff = add('staff', 'laptop', baseVlan, 'Laptop · pracownik AAA', 1480, true);
  staff.x = x - 200;
  const ups = add('ups', 'ups', infrastructureVlan, 'UPS · SNMP / HTTPS', 1700);
  const nvr = add('nvr', 'nvr', userVlan, 'Rejestrator NVR · archiwum', 1900);
  const rack = add('rack', 'rack', 0, 'Szafa RACK · infrastruktura AAA', 2150);
  rack.rack!.mounts = [server, nas, mini, ups, nvr].map((d, i) => ({
    deviceId: d.id,
    startU: i * 3 + 1,
    heightU: d.kind === 'ups' ? 2 : 1,
    description: d.name,
  }));
  const vlans = [...new Set([infrastructureVlan, userVlan, baseVlan, iotVlan])];
  connect(core, nas, vlans);
  connect(core, server, infrastructureVlan);
  connect(nas, ap, vlans);
  connect(nas, mini, userVlan);
  connect(nas, ups, infrastructureVlan);
  connect(nas, nvr, userVlan);
  connect(nas, iot, baseVlan).dot1x = true;
  connect(ap, laptop, baseVlan, true);
  connect(ap, staff, baseVlan, true);
  for (const n of [nas, ap])
    n.radiusNas = {
      serverId: server.id,
      secret: 'lab-radius-secret',
      dynamicVlan: true,
      accounting: true,
    };
  server.radius = {
    clients: [nas, ap].map((n) => ({ nasId: n.id, secret: 'lab-radius-secret' })),
    users: [
      {
        id: 'admin',
        username: 'admin',
        password: 'admin-demo',
        enabled: true,
        authorized: true,
        vlan: userVlan,
        role: 'Administrator',
        allowedNasIds: [ap.id],
      },
      {
        id: 'staff',
        username: 'pracownik',
        password: 'staff-demo',
        enabled: true,
        authorized: true,
        vlan: baseVlan,
        role: 'Pracownik',
        allowedNasIds: [ap.id],
      },
      {
        id: 'iot',
        username: 'raspberry',
        password: 'iot-demo',
        enabled: true,
        authorized: true,
        vlan: iotVlan,
        role: 'IoT',
        allowedNasIds: [nas.id],
      },
    ],
  };
  laptop.supplicant = { username: 'admin', password: 'admin-demo' };
  staff.supplicant = { username: 'pracownik', password: 'staff-demo' };
  iot.supplicant = { username: 'raspberry', password: 'iot-demo' };
  if (prefix === 'demo') {
    const groups = new Map<number, Device[]>();
    for (const d of [server, nas, ap, mini, laptop, ups, nvr, iot, staff]) {
      const effectiveVlan =
        d.id === iot.id
          ? iotVlan
          : d.id === laptop.id
            ? userVlan
            : d.id === staff.id
              ? baseVlan
              : d.vlan;
      groups.set(effectiveVlan, [...(groups.get(effectiveVlan) || []), d]);
    }
    for (const [vlan, group] of groups)
      group.forEach((d, i) => {
        d.x = x + (i % 4) * 300;
        d.y = (vlan === 30 ? 1100 : 400) + Math.floor(i / 4) * 220;
      });
    rack.x = x + 1000;
    rack.y = 1500;
  }
  for (const d of [server, nas, ap, mini, iot, laptop, staff, ups, nvr])
    for (const p of d.ports || [])
      if (
        !network.links.some(
          (l) => (l.a === d.id && l.aPortId === p.id) || (l.b === d.id && l.bPortId === p.id),
        )
      )
        p.enabled = false;
  return network;
}
