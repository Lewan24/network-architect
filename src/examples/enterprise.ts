import { ExampleBuilder, allow, privateDeny, svc, token } from './exampleBuilder';
import { makePort } from '../model/ports';
import type { NetworkExample } from './exampleTypes';
function build() {
  const b = new ExampleBuilder('enterprise', 'Firma · DMZ, aplikacje i chronione dane', [
    [10, 'Pracownicy'],
    [20, 'Aplikacje i usługi'],
    [30, 'CCTV'],
    [50, 'Goście'],
    [60, 'Drukowanie'],
    [80, 'DMZ'],
    [98, 'Tranzyt bezpieczeństwa'],
    [110, 'Dane i kopie'],
  ]);
  b.internet.x = 900;
  b.fw.x = 900;
  b.core.x = 900;
  b.core.ports = [
    ...b.core.ports!,
    ...Array.from({ length: 24 }, (_, i) => makePort(`eth${i + 24}`, 'rj45', 99)),
  ];
  const admin = b.endpoint('admin', 'workstation', 99, 10, 710, 250, 'Administrator');
  const bastion = b.endpoint('bastion', 'server', 99, 20, 1090, 250, 'Bastion administracyjny', [
    svc(22, 'SSH administracji'),
  ]);
  Array.from({ length: 6 }, (_, i) =>
    b.endpoint(
      `staff${i + 1}`,
      'workstation',
      10,
      undefined,
      120 + (i % 3) * 190,
      500 + Math.floor(i / 3) * 190,
      `Pracownik ${i + 1}`,
    ),
  );
  const dns = b.dns(20, 850, 500);
  const app = b.endpoint('app', 'server', 20, 10, 1050, 500, 'Serwer aplikacji', [
    svc(8443, 'Backend aplikacji'),
  ]);
  const nas = b.endpoint('nas', 'server', 20, 30, 850, 710, 'Serwer plików', [svc(445, 'SMB')]);
  const nvr = b.endpoint('nvr', 'server', 20, 40, 1050, 710, 'Serwer NVR', [svc(443, 'Panel NVR')]);
  const hv = b.endpoint('host', 'server', 20, 60, 1250, 500, 'Host KVM', [svc(443, 'Panel hosta')]);
  hv.serverRole = 'hypervisor';
  hv.hypervisorVendor = 'KVM';
  for (let i = 0; i < 2; i++) {
    const vm = b.host(
      `worker${i + 1}`,
      'vm',
      20,
      70 + i,
      1250 + i * 200,
      710,
      `VM worker ${i + 1}`,
      [svc(443, 'Worker HTTPS')],
    );
    vm.hostId = hv.id;
  }
  const proxy = b.endpoint('proxy', 'server', 80, 10, 1650, 500, 'Reverse proxy DMZ', [
    svc(443, 'Publiczny HTTPS'),
  ]);
  b.endpoint('dmz2', 'server', 80, 20, 1860, 690, 'Serwer aktualizacji DMZ', [svc(443, 'HTTPS')]);
  const ap = b.endpoint('guest-ap', 'accesspoint', 50, 2, 140, 1120, 'AP gości');
  ap.ssid = 'Guest';
  Array.from({ length: 2 }, (_, i) => {
    const d = b.host(
      `guest${i + 1}`,
      'workstation',
      50,
      undefined,
      50 + i * 210,
      1310,
      `Gość ${i + 1}`,
    );
    b.connect(ap, d, 50);
    return d;
  });
  const guestDns = b.endpoint('guest-dns', 'dns', 50, 53, 470, 1240, 'DNS gości');
  guestDns.dnsRecords = [{ id: 'public', name: 'internet.example', address: b.internet.ip }];
  b.network.vlans.find((v) => v.id === 50)!.dnsServerIds = [guestDns.id];
  const printers = Array.from({ length: 2 }, (_, i) =>
    b.endpoint(
      `printer${i + 1}`,
      'printer',
      60,
      20 + i,
      850 + i * 210,
      1180,
      `Drukarka działu ${i + 1}`,
    ),
  );
  const poe = b.endpoint('poe', 'switch', 30, 2, 1730, 1120, 'Switch CCTV PoE');
  poe.poeBudgetWatts = 90;
  poe.allowedVlans = [30];
  for (let i = 0; i < 4; i++) {
    const cam = b.host(
      `camera${i + 1}`,
      'camera',
      30,
      undefined,
      1550 + (i % 2) * 260,
      1310 + Math.floor(i / 2) * 190,
      `Kamera strefy ${i + 1}`,
    );
    cam.powerSource = 'poe';
    cam.powerWatts = 12;
    const l = b.connect(poe, cam, 30);
    poe.ports!.find((p) => p.id === l.aPortId)!.poe = 'at';
    allow(b.fw, token(nvr), token(cam), 'TCP', '554');
  }
  const vault = b.host('vault-fw', 'firewall', 98, 2, 900, 1590, 'Firewall danych', [
    svc(443, 'Zarządzanie zaporą'),
  ]);
  vault.edgeRole = 'internal';
  vault.defaultAcl = 'deny';
  vault.routingMode = 'static';
  vault.routes = [{ id: 'default', destination: '0.0.0.0/0', nextHopId: b.fw.id, metric: 100 }];
  b.connect(b.core, vault, [98, 110]);
  const mainTrunk = b.network.links.find((l) => l.a === b.fw.id && l.b === b.core.id)!;
  mainTrunk.allowedVlans = mainTrunk.allowedVlans!.filter((v) => v !== 110);
  for (const side of ['a', 'b'] as const)
    b.network.devices
      .find((d) => d.id === mainTrunk[side])!
      .ports!.find((p) => p.id === mainTrunk[`${side}PortId`])!.allowedVlans = [
      ...mainTrunk.allowedVlans,
    ];
  Object.assign(
    b.network.vlans.find((v) => v.id === 110)!,
    { gatewayDeviceId: vault.id, dhcpServerId: vault.id },
  );
  b.fw.routes!.unshift({
    id: 'protected-data',
    destination: '192.168.110.0/24',
    nextHopId: vault.id,
    metric: 10,
  });
  const db = b.endpoint('db', 'server', 110, 10, 660, 1830, 'Baza PostgreSQL', [
    svc(5432, 'PostgreSQL'),
  ]);
  b.endpoint('db-replica', 'server', 110, 11, 900, 1830, 'Replika bazy', [svc(5432, 'PostgreSQL')]);
  const backup = b.endpoint('backup', 'server', 110, 30, 1140, 1830, 'Kopie zapasowe', [
    svc(443, 'Panel kopii'),
  ]);
  dns.dnsRecords = [
    { id: 'portal', name: 'portal.firma.test', deviceId: proxy.id },
    { id: 'files', name: 'pliki.firma.test', deviceId: nas.id },
  ];
  b.fw.portForwards = [
    {
      id: 'public-https',
      protocol: 'TCP',
      externalIp: '203.0.113.10',
      externalPort: 443,
      internalIp: proxy.ip,
      internalPort: 443,
      enabled: true,
    },
  ];
  allow(b.fw, '*', token(proxy), 'TCP', '443', 'wan');
  allow(b.fw, token(admin), '*');
  allow(vault, token(admin), '*');
  allow(b.fw, token(bastion), '*');
  allow(vault, token(bastion), '*');
  for (const v of b.network.vlans.filter((v) => ![50, 99, 98].includes(v.id)))
    for (const p of ['TCP', 'UDP'] as const) {
      allow(b.fw, `vlan:${v.id}`, token(dns), p, '53');
      allow(vault, `vlan:${v.id}`, token(dns), p, '53');
    }
  allow(b.fw, 'vlan:10', token(proxy), 'TCP', '443');
  allow(b.fw, 'vlan:10', token(nas), 'TCP', '445');
  allow(b.fw, 'vlan:10', token(nvr), 'TCP', '443');
  for (const printer of printers) allow(b.fw, 'vlan:10', token(printer), 'TCP', '631');
  allow(b.fw, token(proxy), token(app), 'TCP', '8443');
  for (const f of [b.fw, vault]) {
    allow(f, token(app), token(db), 'TCP', '5432');
    allow(f, token(backup), token(nas), 'TCP', '445');
  }
  for (const v of [10, 20, 50, 80]) {
    privateDeny(b.fw, `vlan:${v}`);
    allow(b.fw, `vlan:${v}`, '*');
  }
  return b.finish();
}
export const enterprise: NetworkExample = {
  id: 'enterprise',
  name: 'Duża firma · strefy i dwie zapory',
  category: 'Projekt',
  level: 'Zaawansowany',
  description:
    '35 urządzeń: DMZ, dwa firewalle, chroniona baza, kopie, pracownicy, goście, drukarki i CCTV PoE.',
  objectives: [
    'Oddziel publiczny reverse proxy od aplikacji i bazy.',
    'Do danych przepuszczaj tylko aplikację przez dwie zapory; przetestuj także drogę powrotną.',
    'NVR i drukarki udostępniaj konkretnym rolom, a zarządzanie administratorowi.',
    'Brak HA w tym przykładzie jest świadomy: model nie symuluje STP, LACP ani klastra zapór.',
  ],
  sections: [
    { label: 'Publikacja DMZ', target: 'enterprise-fw', tab: 'nat' },
    { label: 'Polityka stref', target: 'enterprise-fw', tab: 'acl' },
    { label: 'Druga zapora danych', target: 'enterprise-vault-fw', tab: 'acl' },
    { label: 'Trasa do danych', target: 'enterprise-fw', tab: 'routing' },
    { label: 'Rezerwa PoE', target: 'enterprise-poe', tab: 'ports' },
  ],
  create: build,
  scenarios: [
    {
      id: 'public',
      label: 'Internet → DMZ HTTPS',
      probe: {
        source: 'enterprise-internet',
        destination: '203.0.113.10',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'backend',
      label: 'Proxy DMZ → backend',
      probe: {
        source: 'enterprise-proxy',
        destination: 'enterprise-app',
        protocol: 'TCP',
        port: 8443,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'database',
      label: 'Aplikacja → baza przez drugą zaporę',
      probe: {
        source: 'enterprise-app',
        destination: 'enterprise-db',
        protocol: 'TCP',
        port: 5432,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'staff-db',
      label: 'Pracownik → baza · blokada',
      probe: {
        source: 'enterprise-staff1',
        destination: 'enterprise-db',
        protocol: 'TCP',
        port: 5432,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'dmz-db',
      label: 'DMZ → baza · blokada',
      probe: {
        source: 'enterprise-proxy',
        destination: 'enterprise-db',
        protocol: 'TCP',
        port: 5432,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'print',
      label: 'Pracownik → drukarka',
      probe: {
        source: 'enterprise-staff1',
        destination: 'enterprise-printer1',
        protocol: 'TCP',
        port: 631,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'guest-print',
      label: 'Gość → drukarka · blokada',
      probe: {
        source: 'enterprise-guest1',
        destination: 'enterprise-printer1',
        protocol: 'TCP',
        port: 631,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'backup',
      label: 'Kopie zapasowe → pliki',
      probe: {
        source: 'enterprise-backup',
        destination: 'enterprise-nas',
        protocol: 'TCP',
        port: 445,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'record',
      label: 'NVR → kamera',
      probe: {
        source: 'enterprise-nvr',
        destination: 'enterprise-camera4',
        protocol: 'TCP',
        port: 554,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'admin-db',
      label: 'Administrator → baza',
      probe: {
        source: 'enterprise-admin',
        destination: 'enterprise-db',
        protocol: 'TCP',
        port: 5432,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'bastion-db',
      label: 'Bastion → baza',
      probe: {
        source: 'enterprise-bastion',
        destination: 'enterprise-db',
        protocol: 'TCP',
        port: 5432,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'guest-hairpin',
      label: 'Gość → publiczny adres DMZ · blokada po DNAT',
      probe: {
        source: 'enterprise-guest1',
        destination: '203.0.113.10',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      },
      expected: false,
    },
  ],
};
