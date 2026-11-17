import type { Device, Link, Network, Port, WifiPpsk } from './networkTypes';

export type WirelessAssociation = {
  ap: Device;
  client: Device;
  clientPort?: Port;
  radio?: Port;
  ssid: string;
  ppsk?: WifiPpsk[];
  vlan: number;
  keyName?: string;
  error?: string;
};

const normalizePassword = (value: string) =>
  /^[\da-fA-F]{64}$/.test(value) ? value.toLowerCase() : value;

/** AP-side assignment, shared by DHCP and frame forwarding; never trust a client VLAN. */
export function wirelessAssociation(network: Network, link: Link): WirelessAssociation | undefined {
  const a = network.devices.find((d) => d.id === link.a);
  const b = network.devices.find((d) => d.id === link.b);
  if (!a || !b) return;
  const ap = a.kind === 'accesspoint' ? a : b.kind === 'accesspoint' ? b : undefined;
  if (!ap) return;
  const apSide = ap.id === a.id ? 'a' : 'b';
  const client = apSide === 'a' ? b : a;
  const radio = ap.ports?.find((p) => p.id === link[`${apSide}PortId`]);
  const clientPort = client.ports?.find(
    (p) => p.id === link[`${apSide === 'a' ? 'b' : 'a'}PortId`],
  );
  if (
    link.cable !== 'wireless' &&
    !(radio?.connector === 'wifi' && clientPort?.connector === 'wifi')
  )
    return;
  const additional = radio?.id.startsWith('ssid:');
  const profile = additional
    ? ap.wifiNetworks?.find((n) => `ssid:${n.id}` === radio?.id)
    : undefined;
  const ppsk = additional ? profile?.ppsk : ap.wifiPpsk;
  const result: WirelessAssociation = {
    ap,
    client,
    clientPort,
    radio,
    ppsk,
    ssid: additional ? profile?.ssid || 'Usunięty SSID' : ap.ssid || 'Podstawowy SSID',
    vlan: profile?.vlan ?? ap.wifiVlan ?? ap.vlan,
  };
  if (additional && !profile) return { ...result, error: 'Sieć SSID została usunięta.' };
  if (ppsk === undefined) return result;
  if (ap.wifiEnterprise || ap.radiusNas?.mab)
    return { ...result, error: 'PPSK: wyłącz globalne Wi-Fi Enterprise / MAB na tym AP.' };
  const key = ppsk.find(
    (k) =>
      k.enabled &&
      normalizePassword(k.password) === normalizePassword(clientPort?.wifiPassword || ''),
  );
  if (!key)
    return {
      ...result,
      error: `PPSK: brak poprawnego, aktywnego hasła dla SSID „${result.ssid}”.`,
    };
  if (!network.vlans.some((v) => v.id === key.vlan))
    return { ...result, error: 'PPSK: VLAN przypisany do hasła nie istnieje.' };
  return { ...result, vlan: key.vlan, keyName: key.name };
}

export function wirelessAccessError(network: Network, clientId: string) {
  for (const link of network.links) {
    if (link.a !== clientId && link.b !== clientId) continue;
    const association = wirelessAssociation(network, link);
    if (association?.client.id === clientId && association.error) return association.error;
  }
}

export function ppskVlans(device: Device) {
  return [...(device.wifiPpsk || []), ...(device.wifiNetworks || []).flatMap((n) => n.ppsk || [])]
    .filter((k) => k.enabled)
    .map((k) => k.vlan);
}

export function validateWifiPpsk(device: Device, network?: Network) {
  const profiles = [device.wifiPpsk, ...(device.wifiNetworks || []).map((n) => n.ppsk)];
  if (profiles.some((p) => p !== undefined) && device.kind !== 'accesspoint')
    throw Error('PPSK jest konfiguracją SSID punktu dostępowego.');
  if (profiles.some((p) => p !== undefined) && (device.wifiEnterprise || device.radiusNas?.mab))
    throw Error('PPSK wymaga wyłączenia globalnego Wi-Fi Enterprise / MAB na tym AP.');
  for (const keys of profiles) {
    if (keys === undefined) continue;
    if (!Array.isArray(keys) || keys.length > 128) throw Error('SSID może mieć do 128 haseł PPSK.');
    const ids = new Set<string>(),
      passwords = new Set<string>();
    for (const key of keys) {
      if (
        !key ||
        typeof key.id !== 'string' ||
        !key.id ||
        key.id.length > 80 ||
        ids.has(key.id) ||
        typeof key.name !== 'string' ||
        !key.name.trim() ||
        key.name.length > 80 ||
        typeof key.password !== 'string' ||
        !(/^[\x20-\x7e]{8,63}$/.test(key.password) || /^[\da-fA-F]{64}$/.test(key.password)) ||
        passwords.has(normalizePassword(key.password)) ||
        typeof key.enabled !== 'boolean' ||
        !Number.isInteger(key.vlan) ||
        key.vlan < 1 ||
        key.vlan > 4094 ||
        (network && !network.vlans.some((v) => v.id === key.vlan))
      )
        throw Error(
          'PPSK: podaj unikalne hasła WPA2 (8–63 znaki ASCII lub 64 znaki HEX), nazwy i istniejące VLAN-y.',
        );
      ids.add(key.id);
      passwords.add(normalizePassword(key.password));
    }
  }
}
