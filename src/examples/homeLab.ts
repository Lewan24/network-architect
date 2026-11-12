import { ExampleBuilder, allow, privateDeny, svc, token } from './exampleBuilder';
import type { NetworkExample } from './exampleTypes';
function build() {
  const b = new ExampleBuilder('home-lab', 'Home lab · Proxmox, IoT i eksperymenty', [
    [10, 'Domownicy'],
    [20, 'Serwery domowe'],
    [30, 'IoT'],
    [40, 'Piaskownica'],
  ]);
  const admin = b.endpoint('admin', 'workstation', 99, 10, 800, 250, 'Stacja administratora');
  b.endpoint('pc', 'workstation', 10, undefined, 160, 500, 'Komputer domowy');
  const ap = b.endpoint('ap', 'accesspoint', 10, 2, 360, 640, 'AP domowników');
  ap.ssid = 'Dom';
  const phone = b.host('phone', 'mobile-phone', 10, undefined, 160, 780, 'Telefon');
  b.connect(ap, phone, 10);
  const dns = b.dns(20, 960, 500);
  const hv = b.endpoint('host', 'server', 20, 10, 1180, 640, 'Proxmox VE', [
    svc(8006, 'Panel Proxmox'),
  ]);
  hv.serverRole = 'hypervisor';
  hv.hypervisorVendor = 'Proxmox VE';
  const app = b.host('app', 'vm', 20, 20, 1380, 800, 'VM Home Assistant', [
    svc(8123, 'Home Assistant'),
  ]);
  app.hostId = hv.id;
  const nas = b.endpoint('nas', 'mini-server', 20, 30, 960, 800, 'NAS domowy', [
    svc(445, 'SMB'),
    svc(443, 'Panel NAS'),
  ]);
  const iot = b.endpoint('iot', 'iot', 30, undefined, 220, 1080, 'Panel IoT', [
    svc(443, 'Sterowanie'),
  ]);
  b.endpoint('sandbox', 'laptop', 40, undefined, 900, 1080, 'Maszyna testowa', [svc(22, 'SSH')]);
  dns.dnsRecords = [
    { id: 'home', name: 'ha.home.arpa', deviceId: app.id },
    { id: 'nas', name: 'nas.home.arpa', deviceId: nas.id },
  ];
  allow(b.fw, token(admin), '*');
  for (const vlan of [10, 30, 40])
    for (const p of ['TCP', 'UDP'] as const) allow(b.fw, `vlan:${vlan}`, token(dns), p, '53');
  allow(b.fw, 'vlan:10', token(app), 'TCP', '8123');
  allow(b.fw, 'vlan:10', token(nas), 'TCP', '445');
  allow(b.fw, token(app), token(iot), 'TCP', '443');
  for (const vlan of [10, 20, 40]) {
    privateDeny(b.fw, `vlan:${vlan}`);
    allow(b.fw, `vlan:${vlan}`, '*');
  }
  // IoT gets DNS and replies to Home Assistant only; the sandbox gets Internet without private LAN.
  return b.finish();
}
export const homeLab: NetworkExample = {
  id: 'home-lab',
  name: 'Home lab · dom, IoT i Proxmox',
  category: 'Projekt',
  level: 'Średni',
  description: 'Hypervisor z VM, NAS, prywatny DNS, IoT i odseparowana piaskownica.',
  objectives: [
    'Oddziel testy i IoT od komputerów domowych.',
    'Panel hypervisora udostępniaj administratorowi, nie każdemu domownikowi.',
    'Użyj home.arpa dla nazw domowych i sprawdzaj trasę odpowiedzi.',
  ],
  sections: [
    { label: 'Reguły IoT i piaskownicy', target: 'home-lab-fw', tab: 'acl' },
    { label: 'Host wirtualizacji', target: 'home-lab-host' },
    { label: 'Nazwy home.arpa', target: 'home-lab-dns', tab: 'dns' },
    { label: 'Sieć testowa', target: 'zone:40' },
  ],
  create: build,
  scenarios: [
    {
      id: 'ha',
      label: 'Domownik → Home Assistant',
      probe: {
        source: 'home-lab-pc',
        destination: 'ha.home.arpa',
        protocol: 'TCP',
        port: 8123,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'iot-nas',
      label: 'IoT → NAS · blokada',
      probe: {
        source: 'home-lab-iot',
        destination: 'home-lab-nas',
        protocol: 'TCP',
        port: 445,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'sandbox-private',
      label: 'Piaskownica → NAS · blokada',
      probe: {
        source: 'home-lab-sandbox',
        destination: 'home-lab-nas',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'admin',
      label: 'Administrator → Proxmox',
      probe: {
        source: 'home-lab-admin',
        destination: 'home-lab-host',
        protocol: 'TCP',
        port: 8006,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'user-admin',
      label: 'Domownik → Proxmox · blokada',
      probe: {
        source: 'home-lab-pc',
        destination: 'home-lab-host',
        protocol: 'TCP',
        port: 8006,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'iot-control',
      label: 'Home Assistant → panel IoT',
      probe: {
        source: 'home-lab-app',
        destination: 'home-lab-iot',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'sandbox-public',
      label: 'Piaskownica → Internet',
      probe: {
        source: 'home-lab-sandbox',
        destination: 'home-lab-internet',
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      },
      expected: true,
    },
  ],
};
