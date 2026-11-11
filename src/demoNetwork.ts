import { defaultServices } from './deviceCatalog';
import { reconcileDhcp } from './dhcp';
import { defaultInternet } from './internetModel';
import type { Device, Network, Probe, Rule, Service, Vlan } from './networkTypes';
const service = (port: number, name: string, protocol: 'TCP' | 'UDP' = 'TCP'): Service => ({
  id: `${protocol}-${port}`,
  name,
  protocol,
  port,
  enabled: true,
});
const host = (
  id: string,
  kind: Device['kind'],
  name: string,
  ip: string,
  vlan: number,
  x: number,
  y: number,
): Device => ({
  id,
  kind,
  name,
  ip,
  ipMode: ip ? 'static' : 'auto',
  vlan,
  x,
  y,
  online: true,
  rules: [],
  services: defaultServices(kind),
});
const permit = (
  id: string,
  source: string,
  destination: string,
  protocol: Rule['protocol'] = 'ANY',
  port = '*',
  ingress: Rule['ingress'] = 'lan',
): Rule => ({ id, source, destination, protocol, port, ingress, action: 'allow' });
function scope(id: number, name: string, color: string): Vlan {
  return {
    id,
    name,
    color,
    cidr: `192.168.${id}.0/24`,
    gateway: `192.168.${id}.1`,
    gatewayDeviceId: 'demo-firewall',
    dhcpEnabled: true,
    dhcpServerId: 'demo-firewall',
    dhcpStart: `192.168.${id}.100`,
    dhcpEnd: `192.168.${id}.200`,
    leaseMinutes: 120,
    dnsServerIds: ['demo-dns'],
  };
}
export function createDemoNetwork(): Network {
  const internet = { ...defaultInternet(), x: 180, y: 80 };
  const router: Device = {
    ...host('demo-router', 'router', 'Router brzegowy', '172.16.255.1', 99, 340, 175),
    edgeRole: 'edge',
    wanIp: '203.0.113.10',
    outboundNat: true,
    defaultAcl: 'deny',
    routingMode: 'static',
    routes: [
      ...[10, 20, 30, 40, 50].map((id) => ({
        id: `route-${id}`,
        destination: `192.168.${id}.0/24`,
        nextHopId: 'demo-firewall',
        metric: 10,
      })),
      { id: 'default-route', destination: '0.0.0.0/0', nextHopId: internet.id, metric: 100 },
    ],
    rules: [
      permit('wan-http', '*', 'device:demo-docker', 'TCP', '80', 'wan'),
      permit('wan-https', '*', 'device:demo-docker', 'TCP', '443', 'wan'),
      permit('lan-admin', 'vlan:10', '*'),
      permit('lan-servers', 'vlan:20', '*'),
    ],
    portForwards: [
      {
        id: 'npm-http',
        protocol: 'TCP',
        externalIp: '203.0.113.10',
        externalPort: 80,
        internalIp: '192.168.20.20',
        internalPort: 80,
        enabled: true,
      },
      {
        id: 'npm-https',
        protocol: 'TCP',
        externalIp: '203.0.113.10',
        externalPort: 443,
        internalIp: '192.168.20.20',
        internalPort: 443,
        enabled: true,
      },
    ],
  };
  router.rules.push(
    permit('staff-internet', 'vlan:40', '*'),
    permit('guest-internet', 'vlan:50', '*'),
  );
  const firewall: Device = {
    ...host('demo-firewall', 'firewall', 'Firewall / bramy VLAN', '172.16.255.2', 99, 510, 270),
    edgeRole: 'internal',
    defaultAcl: 'deny',
    routingMode: 'static',
    routes: [{ id: 'to-edge', destination: '0.0.0.0/0', nextHopId: router.id, metric: 100 }],
    rules: [
      permit('published-http', '*', 'device:demo-docker', 'TCP', '80', 'wan'),
      permit('published-https', '*', 'device:demo-docker', 'TCP', '443', 'wan'),
      permit('admin-lan', 'vlan:10', '*'),
      permit('server-lan', 'vlan:20', '*'),
      permit('cameras-dns', 'vlan:30', 'device:demo-dns', 'UDP', '53'),
    ],
  };
  // Guest traffic is filtered before the general permits; DHCP and local guest DNS stay within VLAN 50.
  firewall.rules.unshift(
    ...['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].map((destination, i): Rule => ({
      ...permit(`guest-private-${i}`, 'vlan:50', destination),
      action: 'deny',
    })),
  );
  firewall.rules.push(permit('staff-lan', 'vlan:40', '*'), permit('guest-public', 'vlan:50', '*'));
  const dns: Device = {
    ...host('demo-dns', 'dns', 'DNS · lab.home.arpa', '192.168.20.53', 20, 735, 495),
    dnsRecords: [
      ['npm', 'demo-docker'],
      ['docker', 'demo-docker'],
      ['app', 'demo-app'],
      ['hyperv', 'demo-hyperv'],
      ['nas', 'demo-nas'],
      ['nvr', 'demo-nvr'],
      ['dns', 'demo-dns'],
      ['kamera1', 'demo-camera1'],
      ['kamera2', 'demo-camera2'],
    ].map(([name, deviceId]) => ({
      id: `record-${name}`,
      name: `${name}.lab.home.arpa`,
      deviceId,
    })),
  };
  const network: Network = {
    name: 'Laboratorium · Hyper-V, Docker i monitoring',
    vlans: [
      {
        id: 99,
        name: 'Tranzyt WAN → firewall',
        cidr: '172.16.255.0/30',
        gateway: '172.16.255.1',
        gatewayDeviceId: router.id,
        color: '#c09b7e',
      },
      scope(10, 'Biuro / administracja', '#6b9e99'),
      scope(20, 'Serwery i wirtualizacja', '#8099bc'),
      scope(30, 'Kamery / CCTV', '#aaa075'),
      scope(40, 'Wi-Fi / pracownicy', '#7e9cba'),
      {
        ...scope(50, 'Wi-Fi / goście · izolacja LAN', '#ad8baf'),
        dnsServerIds: ['demo-guest-dns'],
      },
    ],
    devices: [
      internet,
      router,
      firewall,
      {
        ...host('demo-lan-switch', 'switch', 'Switch biurowy', '192.168.10.2', 10, 325, 395),
        allowedVlans: [10],
      },
      {
        ...host('demo-server-switch', 'switch', 'Switch serwerowy', '192.168.20.2', 20, 770, 385),
        allowedVlans: [20],
      },
      {
        ...host(
          'demo-camera-switch',
          'switch',
          'Switch PoE · kamery',
          '192.168.30.2',
          30,
          780,
          745,
        ),
        allowedVlans: [30],
      },
      host('demo-pc', 'workstation', 'Stanowisko administratora', '', 10, 160, 490),
      host('demo-laptop', 'workstation', 'Laptop biurowy', '', 10, 320, 575),
      dns,
      {
        ...host('demo-hyperv', 'server', 'Hyper-V · host', '192.168.20.10', 20, 970, 485),
        serverRole: 'hypervisor',
        hypervisorVendor: 'Hyper-V',
        services: [service(443, 'Zarządzanie hostem HTTPS')],
      },
      {
        ...host(
          'demo-docker',
          'vm',
          'Docker · Nginx Proxy Manager',
          '192.168.20.20',
          20,
          1130,
          575,
        ),
        hostId: 'demo-hyperv',
        services: [
          service(80, 'Docker · NPM HTTP'),
          service(443, 'Docker · NPM HTTPS'),
          service(81, 'Docker · panel NPM (LAN)'),
          service(22, 'SSH (LAN)'),
          service(9090, 'Docker · metryki'),
        ],
      },
      {
        ...host('demo-app', 'vm', 'VM aplikacji · port 3000', '192.168.20.21', 20, 1285, 665),
        hostId: 'demo-hyperv',
        services: [service(3000, 'Aplikacja webowa'), service(22, 'SSH')],
      },
      {
        ...host('demo-nas', 'server', 'NAS / kopie zapasowe', '192.168.20.30', 20, 960, 650),
        services: [service(443, 'Panel NAS HTTPS'), service(445, 'SMB')],
      },
      {
        ...host('demo-nvr', 'server', 'NVR · rejestrator', '192.168.20.40', 20, 1115, 760),
        services: [service(443, 'Panel NVR'), service(8554, 'Usługa wideo')],
      },
      host('demo-camera1', 'camera', 'Kamera 01 · wejście', '', 30, 620, 835),
      host('demo-camera2', 'camera', 'Kamera 02 · parking', '', 30, 785, 925),
      {
        ...host('demo-staff-ap', 'accesspoint', 'AP · pracownicy', '192.168.40.2', 40, 35, 740),
        ssid: 'Firma-Staff',
      },
      host('demo-staff-client', 'workstation', 'Laptop · Wi-Fi pracowników', '', 40, 195, 835),
      {
        ...host('demo-guest-ap', 'accesspoint', 'AP · goście', '192.168.50.2', 50, 280, 1050),
        ssid: 'Firma-Guest',
      },
      host('demo-guest-client', 'workstation', 'Laptop gościa · tylko Internet', '', 50, 440, 1145),
      {
        ...host(
          'demo-guest-dns',
          'dns',
          'DNS gościnny · bez stref LAN',
          '192.168.50.53',
          50,
          120,
          1145,
        ),
        dnsRecords: [{ id: 'guest-public-dns', name: 'internet.example', address: '203.0.113.1' }],
      },
    ],
    links: [],
  };
  const link = (a: string, b: string, vlan?: number) => ({
    id: `${a}-${b}`,
    a,
    b,
    mode: vlan ? ('access' as const) : ('auto' as const),
    ...(vlan ? { accessVlan: vlan } : {}),
  });
  network.links = [
    link(internet.id, router.id),
    link(router.id, firewall.id, 99),
    link(firewall.id, 'demo-lan-switch', 10),
    link(firewall.id, 'demo-server-switch', 20),
    link(firewall.id, 'demo-camera-switch', 30),
    link('demo-lan-switch', 'demo-pc', 10),
    link('demo-lan-switch', 'demo-laptop', 10),
    ...['demo-dns', 'demo-hyperv', 'demo-nas', 'demo-nvr'].map((id) =>
      link('demo-server-switch', id, 20),
    ),
    link('demo-camera-switch', 'demo-camera1', 30),
    link('demo-camera-switch', 'demo-camera2', 30),
  ];
  network.links.push(
    link(firewall.id, 'demo-staff-ap', 40),
    link('demo-staff-ap', 'demo-staff-client', 40),
    link(firewall.id, 'demo-guest-ap', 50),
    link('demo-guest-ap', 'demo-guest-client', 50),
    link('demo-guest-ap', 'demo-guest-dns', 50),
  );
  return reconcileDhcp(network);
}
export const demoScenarios: {
  id: string;
  label: string;
  probe: Probe;
  expected: boolean;
}[] = [
  {
    id: 'public-https',
    label: 'Internet → NPM · HTTPS 443',
    probe: {
      source: 'internet-default',
      destination: '203.0.113.10',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'public-http',
    label: 'Internet → NPM · HTTP 80',
    probe: {
      source: 'internet-default',
      destination: '203.0.113.10',
      protocol: 'TCP',
      port: 80,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'blocked-admin',
    label: 'Internet → panel NPM 81 · blokada',
    probe: {
      source: 'internet-default',
      destination: '203.0.113.10',
      protocol: 'TCP',
      port: 81,
      checkReply: true,
    },
    expected: false,
  },
  {
    id: 'dns-npm',
    label: 'LAN → npm.lab.home.arpa · HTTPS',
    probe: {
      source: 'demo-pc',
      destination: 'npm.lab.home.arpa',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'lan-admin',
    label: 'LAN → panel NPM · port 81',
    probe: {
      source: 'demo-pc',
      destination: 'npm.lab.home.arpa',
      protocol: 'TCP',
      port: 81,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'dns-app',
    label: 'LAN → VM aplikacji · port 3000',
    probe: {
      source: 'demo-pc',
      destination: 'app.lab.home.arpa',
      protocol: 'TCP',
      port: 3000,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'recording',
    label: 'NVR → kamera1 · RTSP 554',
    probe: {
      source: 'demo-nvr',
      destination: 'kamera1.lab.home.arpa',
      protocol: 'TCP',
      port: 554,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'camera-isolation',
    label: 'Kamera → NPM · izolacja CCTV',
    probe: {
      source: 'demo-camera1',
      destination: 'npm.lab.home.arpa',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    },
    expected: false,
  },
  {
    id: 'staff-wifi',
    label: 'Wi-Fi pracowników → NPM · HTTPS',
    probe: {
      source: 'demo-staff-client',
      destination: 'npm.lab.home.arpa',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'guest-internet',
    label: 'Gość → Internet · DNS + ping',
    probe: {
      source: 'demo-guest-client',
      destination: 'internet.example',
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    },
    expected: true,
  },
  {
    id: 'guest-servers-blocked',
    label: 'Gość → serwer · blokada LAN',
    probe: {
      source: 'demo-guest-client',
      destination: 'demo-docker',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    },
    expected: false,
  },
  {
    id: 'guest-staff-blocked',
    label: 'Gość → pracownik · blokada LAN',
    probe: {
      source: 'demo-guest-client',
      destination: 'demo-staff-client',
      protocol: 'ICMP',
      port: 0,
      checkReply: true,
    },
    expected: false,
  },
];
export const networkExamples = [
  {
    id: 'infrastructure-lab',
    name: 'Biuro, serwery i Wi-Fi',
    description: 'Hyper-V, Docker/NPM, CCTV oraz izolowana sieć gościnna',
    create: createDemoNetwork,
  },
];
