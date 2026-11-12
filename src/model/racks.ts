import type { Device, Kind, Network, RackMount } from './networkTypes';

export function canMountInRack(device: Device): boolean {
  return !['rack', 'internet', 'vm'].includes(device.kind);
}

export function defaultRackHeight(kind: Kind): number {
  return kind === 'ups' ? 2 : 1;
}

export function rackPlacement(network: Network, deviceId: string) {
  for (const cabinet of network.devices.filter((d) => d.kind === 'rack')) {
    const mount = cabinet.rack?.mounts.find((m) => m.deviceId === deviceId);
    if (mount) return { cabinet, mount };
  }
}

export function fitsInRack(heightU: number, mounts: RackMount[], mount: RackMount): boolean {
  return (
    Number.isInteger(mount.startU) &&
    Number.isInteger(mount.heightU) &&
    mount.startU >= 1 &&
    mount.heightU >= 1 &&
    mount.startU + mount.heightU - 1 <= heightU &&
    !mounts.some(
      (m) =>
        m.deviceId !== mount.deviceId &&
        mount.startU < m.startU + m.heightU &&
        m.startU < mount.startU + mount.heightU,
    )
  );
}

export function firstRackSlot(
  heightU: number,
  mounts: RackMount[],
  size: number,
): number | undefined {
  for (let u = 1; u <= heightU; u++)
    if (fitsInRack(heightU, mounts, { deviceId: '', startU: u, heightU: size, description: '' }))
      return u;
}

export function validateRack(device: Device, network?: Network) {
  if (device.kind !== 'rack') {
    if (device.rack !== undefined) throw Error('Układ szafy można zapisać tylko w szafie RACK.');
    return;
  }
  if (
    device.ip ||
    device.vlan ||
    device.ipMode !== 'static' ||
    device.ports?.length ||
    device.interfaces?.length ||
    device.services?.length
  )
    throw Error('Szafa RACK jest obiektem montażowym, bez adresacji i portów sieciowych.');
  const rack = device.rack;
  if (
    !rack ||
    !Number.isInteger(rack.heightU) ||
    rack.heightU < 1 ||
    rack.heightU > 60 ||
    !Array.isArray(rack.mounts) ||
    rack.mounts.length > 60
  )
    throw Error('Wysokość szafy musi wynosić od 1 do 60 U.');
  const seen = new Set<string>();
  for (const mount of rack.mounts) {
    if (
      !mount ||
      typeof mount.deviceId !== 'string' ||
      !mount.deviceId ||
      seen.has(mount.deviceId) ||
      typeof mount.description !== 'string' ||
      mount.description.length > 160 ||
      !fitsInRack(rack.heightU, rack.mounts, mount)
    )
      throw Error('Sprawdź pozycje U: urządzenia nie mogą się nakładać ani wychodzić poza szafę.');
    seen.add(mount.deviceId);
    if (network) {
      const target = network.devices.find((d) => d.id === mount.deviceId);
      if (!target || !canMountInRack(target))
        throw Error('Wskaż istniejące fizyczne urządzenie do montażu.');
      if (
        network.devices.some(
          (d) => d.id !== device.id && d.rack?.mounts.some((m) => m.deviceId === mount.deviceId),
        )
      )
        throw Error('Urządzenie jest już zamontowane w innej szafie.');
    }
  }
  if (network?.links.some((l) => l.a === device.id || l.b === device.id))
    throw Error('Szafa RACK nie obsługuje kabli sieciowych. Użyj przypisania montażowego.');
}
