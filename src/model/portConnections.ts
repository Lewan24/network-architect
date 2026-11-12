import type { Cable, Device, Link, Network, Port } from './networkTypes';
import { connectInternet } from './internetModel';
import { inferCable, isSharedPort, prepareHardware } from './ports';

export function linksAtPort(network: Network, deviceId: string, portId: string): Link[] {
  return network.links.filter(
    (l) => (l.a === deviceId && l.aPortId === portId) || (l.b === deviceId && l.bPortId === portId),
  );
}
export function compatiblePorts(a: Port, b: Port): boolean {
  if (a.connector === 'rj45') return b.connector === 'rj45';
  if (a.connector === 'wifi') return b.connector === 'wifi';
  if (a.connector === 'virtual') return false;
  return b.connector === 'sfp' || b.connector === 'sfp+';
}
export function portUnavailable(
  network: Network,
  device: Device,
  port: Port,
  peer?: { device: Device; port: Port },
  exceptLinkId?: string,
): string | undefined {
  if (!port.enabled) return 'Port administracyjnie wyłączony';
  if (port.connector === 'virtual') return 'Kartę VM przypisz do hypervisora';
  if (
    !isSharedPort(port, device) &&
    linksAtPort(network, device.id, port.id).some((l) => l.id !== exceptLinkId)
  )
    return 'Port jest już zajęty';
  if (peer && !compatiblePorts(peer.port, port)) return 'Niezgodny rodzaj gniazda';
  if (
    peer &&
    port.connector === 'wifi' &&
    device.kind !== 'accesspoint' &&
    peer.device.kind !== 'accesspoint'
  )
    return 'Wi-Fi wymaga punktu dostępowego';
  return undefined;
}
export function suggestedCable(a: Port, b: Port): Cable {
  if (['sfp', 'sfp+'].includes(a.connector) && ['sfp', 'sfp+'].includes(b.connector)) {
    if (
      a.module?.endsWith('lx') ||
      a.module?.endsWith('lr') ||
      b.module?.endsWith('lx') ||
      b.module?.endsWith('lr')
    )
      return 'os2';
    if (a.connector === 'sfp+' && b.connector === 'sfp+' && !a.module && !b.module) return 'dac';
  }
  return inferCable(a, b);
}
export function cablesForPorts(a: Port, b: Port): Cable[] {
  if (!compatiblePorts(a, b)) return [];
  if (a.connector === 'rj45') return ['cat5e', 'cat6', 'cat6a'];
  if (a.connector === 'wifi') return ['wireless'];
  return [
    ...(a.connector === 'sfp+' && b.connector === 'sfp+' ? ['dac' as const] : []),
    'om3',
    'om4',
    'os2',
  ];
}
export function createPortConnection(
  network: Network,
  a: string,
  aPortId: string,
  b: string,
  bPortId: string,
  id: string,
  options: { cable?: Cable; lengthMeters?: number } = {},
): Network {
  if (a === b) throw Error('Wybierz dwa różne urządzenia.');
  if (network.links.some((l) => l.id === id))
    throw Error('Identyfikator połączenia jest już używany.');
  const first = network.devices.find((d) => d.id === a),
    second = network.devices.find((d) => d.id === b);
  const ap = first?.ports?.find((p) => p.id === aPortId),
    bp = second?.ports?.find((p) => p.id === bPortId);
  if (!first || !second || !ap || !bp) throw Error('Wybrany port lub urządzenie już nie istnieje.');
  for (const [device, port, peer] of [
    [first, ap, { device: second, port: bp }],
    [second, bp, { device: first, port: ap }],
  ] as const) {
    const unavailable = portUnavailable(network, device, port, peer);
    if (unavailable) throw Error(`${device.name} / ${port.name}: ${unavailable}.`);
  }
  const cable = options.cable || suggestedCable(ap, bp);
  if (!cablesForPorts(ap, bp).includes(cable)) throw Error('Wybrane medium nie pasuje do gniazd.');
  const lengthMeters = options.lengthMeters ?? 3;
  if (!Number.isFinite(lengthMeters) || lengthMeters < 0 || lengthMeters > 1000000)
    throw Error('Podaj poprawną długość kabla.');
  const wire: Link = {
    id,
    a,
    b,
    aPortId,
    bPortId,
    cable,
    ...(cable !== 'wireless' ? { lengthMeters } : {}),
  };
  const next =
    first.kind === 'internet' || second.kind === 'internet'
      ? connectInternet(network, a, b, id)
      : { ...network, links: [...network.links, wire] };
  return prepareHardware({
    ...next,
    links: next.links.map((l) => (l.id === id ? { ...l, ...wire } : l)),
  });
}
