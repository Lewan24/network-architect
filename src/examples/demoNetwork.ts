import { makePort, prepareHardware } from '../model/ports';
import { defaultServices } from '../devices/deviceCatalog';
import { reconcileDhcp } from '../model/dhcp';
import { defaultInternet } from '../model/internetModel';
import type { Device, Link, Network, Probe, Rule, Service, Vlan } from '../model/networkTypes';
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
function denyPrivate(source: string, prefix: string): Rule[] {
  return ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].map((destination, i) => ({
    ...permit(`${prefix}-${i}`, source, destination),
    action: 'deny',
  }));
}
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
  const internet = { ...defaultInternet(), x: 230, y: -30 };
  const router: Device = {
    ...host('demo-router', 'router', 'Router brzegowy', '172.16.255.1', 99, 440, 90),
    edgeRole: 'edge',
    wanIp: '203.0.113.10',
    outboundNat: true,
    defaultAcl: 'deny',
    routingMode: 'static',
    routes: [
      ...[10, 20, 30, 40, 50, 60].map((id) => ({
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
    ...host('demo-firewall', 'firewall', 'Firewall / bramy VLAN', '172.16.255.2', 99, 650, 200),
    edgeRole: 'internal',
    defaultAcl: 'deny',
    routingMode: 'static',
    routes: [{ id: 'to-edge', destination: '0.0.0.0/0', nextHopId: router.id, metric: 100 }],
    rules: [
      ...denyPrivate('vlan:50', 'guest-private'),
      permit('published-http', '*', 'device:demo-docker', 'TCP', '80', 'wan'),
      permit('published-https', '*', 'device:demo-docker', 'TCP', '443', 'wan'),
      permit('admin-lan', 'vlan:10', '*'),
      ...['demo-camera1', 'demo-camera2'].flatMap((id) => [
        permit(`nvr-${id}-rtsp`, 'device:demo-nvr', `device:${id}`, 'TCP', '554'),
        permit(`nvr-${id}-https`, 'device:demo-nvr', `device:${id}`, 'TCP', '443'),
      ]),
      ...(['UDP', 'TCP'] as const).flatMap((protocol) => [
        permit(`cameras-dns-${protocol}`, 'vlan:30', 'device:demo-dns', protocol, '53'),
        permit(`printers-dns-${protocol}`, 'vlan:60', 'device:demo-dns', protocol, '53'),
        permit(`staff-dns-${protocol}`, 'vlan:40', 'device:demo-dns', protocol, '53'),
      ]),
      permit('staff-dns-ping', 'vlan:40', 'device:demo-dns', 'ICMP'),
      permit('staff-web', 'vlan:40', 'device:demo-docker', 'TCP', '443'),
      permit('staff-app', 'vlan:40', 'device:demo-app', 'TCP', '3000'),
      permit('staff-files', 'vlan:40', 'device:demo-nas', 'TCP', '445'),
      permit('staff-nvr', 'vlan:40', 'device:demo-nvr', 'TCP', '443'),
      permit('staff-print-ipp', 'vlan:40', 'device:demo-printer', 'TCP', '631'),
      permit('staff-print-raw', 'vlan:40', 'device:demo-printer', 'TCP', '9100'),
      ...denyPrivate('vlan:40', 'staff-private'),
      ...denyPrivate('vlan:20', 'server-private'),
      permit('server-internet', 'vlan:20', '*'),
      permit('staff-public', 'vlan:40', '*'),
      permit('guest-public', 'vlan:50', '*'),
    ],
  };
  const dns: Device = {
    ...host('demo-dns', 'dns', 'DNS · lab.home.arpa', '192.168.20.53', 20, 920, 410),
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
      ['drukarka', 'demo-printer'],
    ].map(([name, deviceId]) => ({
      id: `record-${name}`,
      name: `${name}.lab.home.arpa`,
      deviceId,
    })),
  };
  const network: Network = {
    name: 'Laboratorium · biuro, drukarka i monitoring PoE',
    vlans: [
      {
        id: 99,
        name: 'Tranzyt WAN → firewall',
        cidr: '172.16.255.0/30',
        gateway: '172.16.255.1',
        gatewayDeviceId: router.id,
        color: '#c09b7e',
      },
      scope(10, 'Administracja', '#6b9e99'),
      scope(20, 'Serwery i wirtualizacja', '#8099bc'),
      scope(30, 'Kamery / CCTV', '#aaa075'),
      scope(40, 'Pracownicy / LAN i Wi-Fi', '#7e9cba'),
      {
        ...scope(50, 'Wi-Fi / goście · izolacja LAN', '#ad8baf'),
        dnsServerIds: ['demo-guest-dns'],
      },
      { ...scope(60, 'Drukarka / IPP', '#799c85'), dhcpEnabled: false },
    ],
    devices: [
      internet,
      router,
      firewall,
      {
        ...host('demo-lan-switch', 'switch', 'Switch biurowy', '192.168.10.2', 10, 250, 420),
        allowedVlans: [10, 40, 60],
      },
      {
        ...host('demo-server-switch', 'switch', 'Switch serwerowy', '192.168.20.2', 20, 1100, 300),
        allowedVlans: [20, 30],
      },
      {
        ...host(
          'demo-camera-switch',
          'switch',
          'Switch PoE · kamery',
          '192.168.30.2',
          30,
          1230,
          870,
        ),
        allowedVlans: [30],
      },
      host('demo-pc', 'workstation', 'Stanowisko administratora', '', 10, 70, 530),
      host('demo-laptop', 'workstation', 'Laptop biurowy', '', 40, 360, 720),
      {
        ...host('demo-printer', 'printer', 'Drukarka · pracownicy', '192.168.60.20', 60, 450, 490),
        dnsServerIds: ['demo-dns'],
        services: [
          ...defaultServices('printer'),
          service(443, 'Panel drukarki HTTPS (administracja)'),
        ],
      },
      dns,
      {
        ...host('demo-hyperv', 'server', 'Hyper-V · host', '192.168.20.10', 20, 1280, 410),
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
          1280,
          610,
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
        ...host('demo-app', 'vm', 'VM aplikacji · port 3000', '192.168.20.21', 20, 1480, 610),
        hostId: 'demo-hyperv',
        services: [service(3000, 'Aplikacja webowa'), service(22, 'SSH')],
      },
      {
        ...host('demo-nas', 'server', 'NAS / kopie zapasowe', '192.168.20.30', 20, 920, 610),
        services: [service(443, 'Panel NAS HTTPS'), service(445, 'SMB')],
      },
      {
        ...host('demo-nvr', 'server', 'NVR · rejestrator', '192.168.20.40', 20, 1100, 610),
        services: [service(443, 'Panel NVR'), service(8554, 'Usługa wideo')],
      },
      host('demo-camera1', 'camera', 'Kamera 01 · wejście', '', 30, 1060, 1010),
      host('demo-camera2', 'camera', 'Kamera 02 · parking', '', 30, 1430, 1010),
      {
        ...host('demo-staff-ap', 'accesspoint', 'AP · pracownicy', '192.168.40.2', 40, 180, 830),
        ssid: 'Firma-Staff',
      },
      host('demo-staff-client', 'workstation', 'Laptop · Wi-Fi pracowników', '', 40, 0, 940),
      {
        ...host('demo-guest-ap', 'accesspoint', 'AP · goście', '192.168.50.2', 50, 650, 830),
        ssid: 'Firma-Guest',
        // This AP has a second wired LAN socket for the local guest DNS server.
        ports: [
          { ...makePort('eth0', 'rj45', 50), mode: 'auto' },
          { ...makePort('eth1', 'rj45', 50), mode: 'auto' },
          { ...makePort('radio0', 'wifi', 50), mode: 'auto' },
        ],
      },
      host('demo-guest-client', 'workstation', 'Laptop gościa · tylko Internet', '', 50, 830, 940),
      {
        ...host(
          'demo-guest-dns',
          'dns',
          'DNS gościnny · bez stref LAN',
          '192.168.50.53',
          50,
          470,
          960,
        ),
        dnsRecords: [{ id: 'guest-public-dns', name: 'internet.example', address: '203.0.113.1' }],
      },
    ],
    links: [],
  };
  const link = (a: string, b: string, vlan?: number): Link => ({
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
    {
      ...link('demo-server-switch', 'demo-camera-switch', 30),
      aPortId: 'sfp0',
      bPortId: 'sfp0',
      cable: 'om3',
      lengthMeters: 35,
      label: 'CCTV · światłowód OM3 / 10GBASE-SR',
    },
    link('demo-lan-switch', 'demo-pc', 10),
    link('demo-lan-switch', 'demo-printer', 60),
    link('demo-lan-switch', 'demo-laptop', 40),
    ...['demo-dns', 'demo-hyperv', 'demo-nas', 'demo-nvr'].map((id) =>
      link('demo-server-switch', id, 20),
    ),
    link('demo-camera-switch', 'demo-camera1', 30),
    link('demo-camera-switch', 'demo-camera2', 30),
  ];
  network.links.push(
    link('demo-lan-switch', 'demo-staff-ap', 40),
    link('demo-staff-ap', 'demo-staff-client', 40),
    link(firewall.id, 'demo-guest-ap', 50),
    link('demo-guest-ap', 'demo-guest-client', 50),
    link('demo-guest-ap', 'demo-guest-dns', 50),
  );
  const prepared = prepareHardware(network);
  // Every used physical port has an explicit configuration; no implicit VLAN propagation.
  for (const device of prepared.devices.filter((d) => d.kind === 'switch')) {
    for (const port of device.ports || []) {
      port.mode = 'access';
      port.accessVlan = device.vlan;
    }
  }
  for (const wire of prepared.links) {
    if (wire.accessVlan) {
      for (const side of ['a', 'b'] as const) {
        const device = prepared.devices.find((d) => d.id === wire[side])!;
        const port = device.ports!.find((p) => p.id === wire[`${side}PortId`])!;
        port.mode = 'access';
        port.accessVlan = wire.accessVlan;
      }
    }
    if (wire.cable === 'cat6') wire.lengthMeters = wire.b.startsWith('demo-camera') ? 18 : 5;
    wire.label ||= wire.accessVlan ? `VLAN ${wire.accessVlan} · access` : 'WAN · RJ45';
  }
  const trunk = (a: string, b: string, vlans: number[], native: number) => {
    const wire = prepared.links.find((l) => l.a === a && l.b === b)!;
    wire.mode = 'trunk';
    wire.allowedVlans = vlans;
    delete wire.accessVlan;
    wire.label = `Trunk · VLAN ${vlans.join('/')}`;
    for (const side of ['a', 'b'] as const) {
      const port = prepared.devices
        .find((d) => d.id === wire[side])!
        .ports!.find((p) => p.id === wire[`${side}PortId`])!;
      port.mode = 'trunk';
      port.nativeVlan = native;
      port.allowedVlans = [...vlans];
      port.tagNative = false;
    }
  };
  trunk(firewall.id, 'demo-lan-switch', [10, 40, 60], 10);
  trunk(firewall.id, 'demo-server-switch', [20, 30], 20);
  const fiber = prepared.links.find((l) => l.cable === 'om3')!;
  for (const side of ['a', 'b'] as const)
    prepared.devices
      .find((d) => d.id === fiber[side])!
      .ports!.find((p) => p.id === fiber[`${side}PortId`])!.module = '10g-sr';
  const cameraSwitch = prepared.devices.find((d) => d.id === 'demo-camera-switch')!;
  cameraSwitch.poeBudgetWatts = 60;
  for (const camera of prepared.devices.filter((d) => d.kind === 'camera')) {
    camera.powerSource = 'poe';
    camera.powerWatts = 12;
    camera.ports!.find((p) => p.connector === 'rj45')!.speeds = [10, 100];
    const wire = prepared.links.find(
      (l) =>
        (l.a === camera.id && l.b === cameraSwitch.id) ||
        (l.b === camera.id && l.a === cameraSwitch.id),
    )!;
    const portId = wire.a === cameraSwitch.id ? wire.aPortId : wire.bPortId;
    cameraSwitch.ports!.find((p) => p.id === portId)!.poe = 'at';
  }
  return reconcileDhcp(prepared);
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
  ...(
    [
      [
        'staff-ipp',
        'Wi-Fi pracownika → drukarka · IPP 631',
        'demo-staff-client',
        'drukarka.lab.home.arpa',
        'TCP',
        631,
        true,
      ],
      [
        'wired-ipp',
        'LAN pracownika → drukarka · IPP 631',
        'demo-laptop',
        'drukarka.lab.home.arpa',
        'TCP',
        631,
        true,
      ],
      [
        'admin-printer',
        'Administrator → panel drukarki · HTTPS',
        'demo-pc',
        'demo-printer',
        'TCP',
        443,
        true,
      ],
      [
        'staff-printer-admin-denied',
        'Pracownik → panel drukarki · blokada',
        'demo-staff-client',
        'demo-printer',
        'TCP',
        443,
        false,
      ],
      [
        'guest-printer-denied',
        'Gość → drukarka · blokada',
        'demo-guest-client',
        'demo-printer',
        'TCP',
        631,
        false,
      ],
      [
        'staff-cctv-denied',
        'Pracownik → kamera · blokada CCTV',
        'demo-staff-client',
        'demo-camera1',
        'TCP',
        554,
        false,
      ],
      [
        'staff-nvr',
        'Pracownik → panel NVR · HTTPS',
        'demo-staff-client',
        'nvr.lab.home.arpa',
        'TCP',
        443,
        true,
      ],
      [
        'recording-camera2',
        'NVR → kamera2 · RTSP 554',
        'demo-nvr',
        'kamera2.lab.home.arpa',
        'TCP',
        554,
        true,
      ],
      [
        'camera-printer-denied',
        'Kamera → drukarka · blokada',
        'demo-camera1',
        'demo-printer',
        'TCP',
        631,
        false,
      ],
      [
        'camera-internet-denied',
        'Kamera → Internet · blokada',
        'demo-camera1',
        'internet-default',
        'ICMP',
        0,
        false,
      ],
      [
        'printer-internet-denied',
        'Drukarka → Internet · blokada',
        'demo-printer',
        'internet-default',
        'ICMP',
        0,
        false,
      ],
      [
        'server-camera-denied',
        'Serwer aplikacji → kamera · blokada',
        'demo-app',
        'demo-camera1',
        'TCP',
        554,
        false,
      ],
    ] as const
  ).map(([id, label, source, destination, protocol, port, expected]) => ({
    id,
    label,
    probe: { source, destination, protocol, port, checkReply: true },
    expected,
  })),
];
export const networkExamples = [
  {
    id: 'infrastructure-lab',
    name: 'Biuro, serwery i Wi-Fi',
    description: 'Pracownicy i drukarka, Hyper-V/NPM, kamery PoE, izolacja gości i CCTV',
    create: createDemoNetwork,
  },
];
