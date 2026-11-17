/** Locally administered unicast MAC; stable once saved in a project. */
export function randomMac(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  bytes[0] = (bytes[0] | 2) & 254;
  return [...bytes].map((n) => n.toString(16).padStart(2, '0')).join(':');
}
export function ensureDeviceMacs<T extends { devices: { mac?: string }[] }>(network: T): T {
  return {
    ...network,
    devices: network.devices.map((d) => (d.mac ? d : { ...d, mac: randomMac() })),
  };
}
export const normalizeMac = (value: string) => value.replace(/[:-]/g, '').toLowerCase();
export const validMac = (value: string) =>
  /^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(value) && !(parseInt(value.slice(0, 2), 16) & 1);
