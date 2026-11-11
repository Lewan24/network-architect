import type { Kind, Service } from './networkTypes';

export const kinds: Record<
  Kind,
  {
    label: string;
    description: string;
    color: string;
  }
> = {
  internet: { label: 'Internet', description: 'Zewnętrzna sieć WAN', color: '#8997ae' },
  gateway: {
    label: 'Router / firewall',
    description: 'Brzeg WAN · NAT · DHCP · ACL',
    color: '#b48a77',
  },
  router: { label: 'Router', description: 'Routing między sieciami', color: '#7184c2' },
  firewall: { label: 'Firewall', description: 'Ochrona i reguły ruchu', color: '#d69a69' },
  switch: { label: 'Switch L2', description: 'Zarządzalny · VLAN-y', color: '#6b9e99' },
  'switch-l3': { label: 'Switch L3', description: 'Zarządzalny · routing i ACL', color: '#528f9e' },
  'switch-unmanaged': {
    label: 'Switch prosty',
    description: 'L2 niezarządzalny · jedna sieć',
    color: '#92a7a3',
  },
  server: { label: 'Serwer', description: 'Usługi i aplikacje', color: '#839bbf' },
  workstation: { label: 'Komputer', description: 'Urządzenie końcowe', color: '#9298ad' },
  accesspoint: { label: 'AP Wi-Fi', description: 'Punkt dostępowy · SSID', color: '#a491b4' },
  vm: { label: 'Maszyna VM', description: 'Gość na serwerze wirtualizacji', color: '#9a8bc4' },
  printer: { label: 'Drukarka', description: 'Drukarka sieciowa', color: '#a5a0a0' },
  dns: { label: 'Serwer DNS', description: 'Rekordy A · UDP i TCP 53', color: '#7b92af' },
  camera: { label: 'Kamera IP', description: 'HTTP / HTTPS · RTSP · ONVIF', color: '#a09d83' },
};

const SERVICE_PORTS: Partial<Record<Kind, number[]>> = {
  camera: [80, 443, 554, 8000],
  server: [80, 443],
  vm: [22],
  printer: [631, 9100],
};

const SERVICE_NAMES: Record<number, string> = {
  554: 'RTSP',
  8000: 'ONVIF / kamera',
  443: 'HTTPS',
  80: 'HTTP',
  22: 'SSH',
};

export function defaultServices(kind: Kind): Service[] {
  if (kind === 'dns')
    return [
      { id: 'dns-udp', name: 'DNS', protocol: 'UDP', port: 53, enabled: true },
      { id: 'dns-tcp', name: 'DNS TCP', protocol: 'TCP', port: 53, enabled: true },
    ];
  const ports = SERVICE_PORTS[kind] || [];
  return ports.map((port) => ({
    id: `service-${port}`,
    name: SERVICE_NAMES[port] || 'Drukowanie',
    protocol: 'TCP',
    port,
    enabled: true,
  }));
}
