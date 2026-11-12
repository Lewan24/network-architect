import type { Kind, Service } from '../model/networkTypes';

export const deviceCategories = {
  edge: 'Internet i routing',
  switches: 'Przełączniki',
  wireless: 'Sieć bezprzewodowa',
  servers: 'Serwery i wirtualizacja',
  clients: 'Komputery i telefony',
  peripherals: 'Drukarki i monitoring',
} as const;
export type DeviceCategory = keyof typeof deviceCategories;

export const kinds: Record<
  Kind,
  {
    label: string;
    description: string;
    color: string;
    category: DeviceCategory;
  }
> = {
  internet: {
    category: 'edge',
    label: 'Internet',
    description: 'Zewnętrzna sieć WAN',
    color: '#8997ae',
  },
  gateway: {
    category: 'edge',
    label: 'Router / firewall',
    description: 'Brzeg WAN · NAT · DHCP · ACL',
    color: '#b48a77',
  },
  router: {
    category: 'edge',
    label: 'Router',
    description: 'Routing między sieciami',
    color: '#7184c2',
  },
  firewall: {
    category: 'edge',
    label: 'Firewall',
    description: 'Ochrona i reguły ruchu',
    color: '#d69a69',
  },
  switch: {
    category: 'switches',
    label: 'Switch L2',
    description: 'Zarządzalny · VLAN-y',
    color: '#6b9e99',
  },
  'switch-l3': {
    category: 'switches',
    label: 'Switch L3',
    description: 'Zarządzalny · routing i ACL',
    color: '#528f9e',
  },
  'switch-unmanaged': {
    category: 'switches',
    label: 'Switch prosty',
    description: 'L2 niezarządzalny · jedna sieć',
    color: '#92a7a3',
  },
  server: {
    category: 'servers',
    label: 'Serwer',
    description: 'Usługi i aplikacje',
    color: '#839bbf',
  },
  workstation: {
    category: 'clients',
    label: 'Komputer',
    description: 'Urządzenie końcowe',
    color: '#9298ad',
  },
  accesspoint: {
    category: 'wireless',
    label: 'AP Wi-Fi',
    description: 'Punkt dostępowy · SSID',
    color: '#a491b4',
  },
  vm: {
    category: 'servers',
    label: 'Maszyna VM',
    description: 'Gość na serwerze wirtualizacji',
    color: '#9a8bc4',
  },
  printer: {
    category: 'peripherals',
    label: 'Drukarka',
    description: 'Drukarka sieciowa',
    color: '#a5a0a0',
  },
  dns: {
    category: 'servers',
    label: 'Serwer DNS',
    description: 'Rekordy A · UDP i TCP 53',
    color: '#7b92af',
  },
  'mobile-phone': {
    category: 'clients',
    label: 'Telefon',
    description: 'Telefon komórkowy · klient Wi-Fi',
    color: '#6e9eb6',
  },
  camera: {
    category: 'peripherals',
    label: 'Kamera IP',
    description: 'HTTP / HTTPS · RTSP · ONVIF',
    color: '#a09d83',
  },
};

const SERVICE_PORTS: Partial<Record<Kind, number[]>> = {
  camera: [80, 443, 554],
  server: [80, 443],
  vm: [22],
  printer: [631, 9100],
};

const SERVICE_NAMES: Record<number, string> = {
  554: 'RTSP',
  631: 'IPP',
  9100: 'RAW / JetDirect',
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
