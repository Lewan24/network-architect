import type { Kind, Service } from '../model/networkTypes';

export const deviceCategories = {
  edge: 'Internet i routing',
  switches: 'Przełączniki',
  wireless: 'Sieć bezprzewodowa',
  servers: 'Serwery i wirtualizacja',
  clients: 'Komputery i telefony',
  peripherals: 'Drukarki i monitoring',
  power: 'Zasilanie',
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
  iot: {
    category: 'clients',
    label: 'IoT / Raspberry Pi',
    description: 'Komputer jednopłytkowy · Ethernet i Wi-Fi · usługi',
    color: '#7caa89',
  },
  laptop: {
    category: 'clients',
    label: 'Laptop',
    description: 'Komputer przenośny · Ethernet i Wi-Fi',
    color: '#829bb7',
  },
  nvr: {
    category: 'peripherals',
    label: 'Rejestrator NVR',
    description: 'Monitoring IP · archiwum nagrań · RTSP',
    color: '#a09d83',
  },
  'mini-server': {
    category: 'servers',
    label: 'Mini serwer',
    description: 'Mini PC / stacja usług · aplikacje i wirtualizacja',
    color: '#839bbf',
  },
  ups: {
    category: 'power',
    label: 'UPS',
    description: 'Zasilacz awaryjny · karta zarządzania sieciowego',
    color: '#ae956e',
  },
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
  radius: {
    category: 'servers',
    label: 'Serwer RADIUS',
    description: 'AAA · 802.1X · VLAN użytkownika',
    color: '#8d91b5',
  },
  rack: {
    category: 'servers',
    label: 'Szafa RACK',
    description: 'Szafa 19 cali / rozmieszczenie w U',
    color: '#839bbf',
  },
  server: {
    category: 'servers',
    label: 'Serwer RACK',
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
  iot: [22],
  'mini-server': [22, 443],
  nvr: [443, 554],
  ups: [443],
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
  if (kind === 'radius')
    return [
      {
        id: 'radius-auth',
        name: 'RADIUS Authentication',
        protocol: 'UDP',
        port: 1812,
        enabled: true,
      },
      {
        id: 'radius-accounting',
        name: 'RADIUS Accounting',
        protocol: 'UDP',
        port: 1813,
        enabled: true,
      },
    ];
  if (kind === 'dns')
    return [
      { id: 'dns-udp', name: 'DNS', protocol: 'UDP', port: 53, enabled: true },
      { id: 'dns-tcp', name: 'DNS TCP', protocol: 'TCP', port: 53, enabled: true },
    ];
  if (kind === 'ups')
    return [
      { id: 'ups-https', name: 'HTTPS', protocol: 'TCP', port: 443, enabled: true },
      { id: 'ups-snmp', name: 'SNMP', protocol: 'UDP', port: 161, enabled: true },
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
