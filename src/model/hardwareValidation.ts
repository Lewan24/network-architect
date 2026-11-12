import { validIp } from './addressing';
import { supportsInterfaces } from './interfaces';
import type { Device, Link, Network, Port } from './networkTypes';
import { cableNames, opticProfiles, poeStandards } from './ports';

const vlanId = (n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 4094;
const positive = (n: unknown, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
const text = (s: unknown) => typeof s === 'string' && !!s.trim() && s.length <= 80;
export function validatePort(p: Port) {
  if (p.dot1x !== undefined && typeof p.dot1x !== 'boolean') throw Error('802.1X must be boolean.');
  if (
    !p ||
    !text(p.id) ||
    !text(p.name) ||
    !['rj45', 'sfp', 'sfp+', 'wifi', 'virtual'].includes(p.connector) ||
    typeof p.enabled !== 'boolean' ||
    !['auto', 'access', 'trunk'].includes(p.mode)
  )
    throw Error('Nieprawidłowa konfiguracja portu.');
  if (
    !Array.isArray(p.speeds) ||
    !p.speeds.length ||
    p.speeds.length > 8 ||
    p.speeds.some((s) => ![10, 100, 1000, 2500, 5000, 10000].includes(s)) ||
    new Set(p.speeds).size !== p.speeds.length
  )
    throw Error('Port wymaga listy obsługiwanych prędkości 10–10000 Mb/s.');
  if (p.speedMbps !== undefined && !p.speeds.includes(p.speedMbps))
    throw Error('Wymuszona prędkość nie jest obsługiwana przez port.');
  if (p.duplex !== undefined && !['auto', 'half', 'full'].includes(p.duplex))
    throw Error('Nieprawidłowy duplex portu.');
  for (const id of [p.accessVlan, p.nativeVlan])
    if (id !== undefined && !vlanId(id)) throw Error('VLAN portu musi mieć ID 1–4094.');
  if (
    p.allowedVlans !== undefined &&
    (!Array.isArray(p.allowedVlans) ||
      p.allowedVlans.length > 4094 ||
      p.allowedVlans.some((id) => !vlanId(id)))
  )
    throw Error('Nieprawidłowa lista VLAN-ów portu.');
  if (p.tagNative !== undefined && typeof p.tagNative !== 'boolean')
    throw Error('Nieprawidłowe tagowanie native VLAN.');
  if (p.module !== undefined && !Object.hasOwn(opticProfiles, p.module))
    throw Error('Nieznany moduł optyczny.');
  if (p.poe !== undefined && !Object.hasOwn(poeStandards, p.poe))
    throw Error('Nieznany standard PoE.');
}
export function validateHardwareDevice(d: Device) {
  if (d.ports !== undefined) {
    if (!Array.isArray(d.ports) || d.ports.length > 256)
      throw Error('Urządzenie może mieć do 256 portów.');
    const ids = new Set<string>();
    for (const p of d.ports) {
      validatePort(p);
      if (ids.has(p.id)) throw Error('ID portów muszą być unikalne w urządzeniu.');
      ids.add(p.id);
    }
  }
  if (d.poeBudgetWatts !== undefined && !positive(d.poeBudgetWatts, 10000))
    throw Error('Budżet PoE musi wynosić 0–10000 W.');
  if (d.powerSource !== undefined && !['local', 'poe'].includes(d.powerSource))
    throw Error('Nieprawidłowy sposób zasilania.');
  if (d.powerWatts !== undefined && (!positive(d.powerWatts, 1000) || d.powerWatts === 0))
    throw Error('Pobór mocy musi być dodatni i nie większy niż 1000 W.');
  if (d.interfaces !== undefined) {
    if (
      !supportsInterfaces(d) ||
      !Array.isArray(d.interfaces) ||
      !d.interfaces.length ||
      d.interfaces.length > 16
    )
      throw Error(
        'Ten host może mieć 1–16 interfejsów IP. Routing i interfejsy SVI konfiguruj w sieciach urządzenia L3.',
      );
    const ids = new Set<string>(),
      ports = new Set<string>();
    for (const n of d.interfaces) {
      if (
        !n ||
        !text(n.id) ||
        !text(n.name) ||
        !text(n.portId) ||
        typeof n.enabled !== 'boolean' ||
        !['auto', 'static'].includes(n.ipMode) ||
        !Number.isInteger(n.vlan) ||
        n.vlan < 0 ||
        n.vlan > 4094 ||
        !Number.isInteger(n.prefix) ||
        n.prefix < 1 ||
        n.prefix > 32 ||
        !Number.isInteger(n.metric) ||
        n.metric < 0 ||
        n.metric > 65535 ||
        typeof n.gateway !== 'string' ||
        (n.gateway !== '' && !validIp(n.gateway)) ||
        (n.ip !== '' && !validIp(n.ip)) ||
        (n.ipMode === 'static' && !validIp(n.ip))
      )
        throw Error(
          'Interfejs wymaga poprawnego IP, prefiksu /1–/32, bramy IPv4, VLAN-u i metryki 0–65535.',
        );
      if (['router', 'firewall', 'gateway', 'switch-l3'].includes(d.kind) && n.ipMode !== 'static')
        throw Error(
          'Jawne interfejsy routowane wymagają statycznego IP. DHCP dla hostów jest konfigurowane na ich kartach.',
        );
      if (ids.has(n.id) || ports.has(n.portId))
        throw Error('ID interfejsów i przypisane do nich porty nie mogą się powtarzać.');
      if (!d.ports?.some((p) => p.id === n.portId))
        throw Error('Interfejs odwołuje się do nieistniejącego portu.');
      if (
        n.dnsServerIds !== undefined &&
        (!Array.isArray(n.dnsServerIds) ||
          n.dnsServerIds.length > 4 ||
          n.dnsServerIds.some((id) => typeof id !== 'string'))
      )
        throw Error('Interfejs może mieć do czterech resolverów DNS.');
      if (
        n.lease &&
        (!validIp(n.lease.ip) ||
          !Number.isFinite(n.lease.obtainedAt) ||
          !Number.isFinite(n.lease.expiresAt) ||
          n.lease.expiresAt <= n.lease.obtainedAt ||
          typeof n.lease.serverId !== 'string' ||
          !vlanId(n.lease.vlan))
      )
        throw Error('Nieprawidłowa dzierżawa interfejsu.');
      ids.add(n.id);
      ports.add(n.portId);
    }
  }
}
export function validateHardwareLink(l: Link) {
  if (l.cable !== undefined && !Object.hasOwn(cableNames, l.cable))
    throw Error('Nieznany rodzaj kabla.');
  if (l.lengthMeters !== undefined && !positive(l.lengthMeters, 1000000))
    throw Error('Długość kabla musi wynosić 0–1000000 m.');
  if (l.label !== undefined && (typeof l.label !== 'string' || l.label.length > 120))
    throw Error('Etykieta kabla może mieć do 120 znaków.');
  for (const id of [l.aPortId, l.bPortId])
    if (id !== undefined && !text(id)) throw Error('Nieprawidłowy identyfikator portu łącza.');
}
export function validateHardware(network: Network) {
  network.devices.forEach(validateHardwareDevice);
  network.links.forEach(validateHardwareLink);
}
