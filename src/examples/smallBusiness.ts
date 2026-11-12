import { ExampleBuilder, allow, privateDeny, svc, token } from './exampleBuilder';
import type { NetworkExample } from './exampleTypes';
function build() {
  const b = new ExampleBuilder('small-business', 'Mała firma · role i najmniejsze uprawnienia', [
    [10, 'Pracownicy'],
    [20, 'Usługi'],
    [30, 'CCTV'],
    [50, 'Goście'],
    [60, 'Drukarka'],
  ]);
  const admin = b.endpoint('admin', 'workstation', 99, 10, 780, 250, 'Administrator');
  b.endpoint('employee', 'workstation', 10, undefined, 120, 500, 'Pracownik LAN');
  const ap = b.endpoint('staff-ap', 'accesspoint', 10, 2, 300, 620, 'AP pracowników');
  ap.ssid = 'Firma';
  const phone = b.host('phone', 'mobile-phone', 10, undefined, 120, 760, 'Telefon pracownika');
  b.connect(ap, phone, 10);
  const dns = b.dns(20, 1040, 500);
  const nas = b.endpoint('files', 'mini-server', 20, 20, 1260, 620, 'Pliki / aplikacja', [
    svc(445, 'SMB'),
    svc(443, 'Portal firmowy'),
  ]);
  const nvr = b.endpoint('nvr', 'nvr', 20, 40, 1040, 760, 'Rejestrator NVR', [
    svc(443, 'Monitoring'),
  ]);
  const printer = b.endpoint('printer', 'printer', 60, 20, 650, 600, 'Drukarka IPP');
  const cameraSwitch = b.endpoint('poe', 'switch', 30, 2, 1120, 1020, 'Switch CCTV PoE');
  cameraSwitch.allowedVlans = [30];
  cameraSwitch.poeBudgetWatts = 45;
  for (const [i, x] of [960, 1280].entries()) {
    const cam = b.host(`camera${i + 1}`, 'camera', 30, undefined, x, 1190, `Kamera ${i + 1}`);
    cam.powerSource = 'poe';
    cam.powerWatts = 10;
    const wire = b.connect(cameraSwitch, cam, 30);
    cameraSwitch.ports!.find((p) => p.id === wire.aPortId)!.poe = 'at';
    allow(b.fw, token(nvr), token(cam), 'TCP', '554');
  }
  const guestAP = b.endpoint('guest-ap', 'accesspoint', 50, 2, 280, 1020, 'AP gości');
  guestAP.ssid = 'Firma-Guest';
  const guest = b.host('guest', 'laptop', 50, undefined, 100, 1190, 'Gość');
  b.connect(guestAP, guest, 50);
  const guestDns = b.endpoint('guest-dns', 'dns', 50, 53, 460, 1190, 'DNS gości');
  guestDns.dnsRecords = [{ id: 'public', name: 'internet.example', address: b.internet.ip }];
  b.network.vlans.find((v) => v.id === 50)!.dnsServerIds = [guestDns.id];
  dns.dnsRecords = [
    { id: 'files', name: 'pliki.firma.test', deviceId: nas.id },
    { id: 'printer', name: 'drukarka.firma.test', deviceId: printer.id },
  ];
  allow(b.fw, token(admin), '*');
  for (const vlan of [10, 30, 60])
    for (const protocol of ['TCP', 'UDP'] as const)
      allow(b.fw, `vlan:${vlan}`, token(dns), protocol, '53');
  for (const [d, port] of [
    [nas, 445],
    [nas, 443],
    [nvr, 443],
    [printer, 631],
  ] as const)
    allow(b.fw, 'vlan:10', token(d), 'TCP', String(port));
  for (const vlan of [10, 20, 50]) {
    privateDeny(b.fw, `vlan:${vlan}`);
    allow(b.fw, `vlan:${vlan}`, '*');
  }
  return b.finish();
}
export const smallBusiness: NetworkExample = {
  id: 'small-business',
  name: 'Mała firma · bezpieczny start',
  category: 'Projekt',
  level: 'Podstawy',
  description: 'Administracja, pracownicy, pliki, drukarka, kamery PoE i odizolowani goście.',
  objectives: [
    'Podziel sieć według ról, nie tylko według pokoi.',
    'Zezwalaj na konkretne usługi, potem blokuj inne sieci prywatne.',
    'Wyłącz nieużywane gniazda i pozostaw zapas PoE.',
  ],
  sections: [
    { label: 'Polityka pracowników i gości', target: 'small-business-fw', tab: 'acl' },
    { label: 'Trunk i wyłączone porty', target: 'small-business-core', tab: 'ports' },
    { label: 'Budżet kamer', target: 'small-business-poe', tab: 'ports' },
    { label: 'DHCP pracowników', target: 'zone:10' },
  ],
  create: build,
  scenarios: [
    {
      id: 'print',
      label: 'Pracownik → drukarka IPP',
      probe: {
        source: 'small-business-employee',
        destination: 'drukarka.firma.test',
        protocol: 'TCP',
        port: 631,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'guest-files',
      label: 'Gość → pliki · blokada',
      probe: {
        source: 'small-business-guest',
        destination: 'small-business-files',
        protocol: 'TCP',
        port: 445,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'record',
      label: 'NVR → kamera · RTSP',
      probe: {
        source: 'small-business-nvr',
        destination: 'small-business-camera1',
        protocol: 'TCP',
        port: 554,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'camera-egress',
      label: 'Kamera → Internet · blokada',
      probe: {
        source: 'small-business-camera1',
        destination: 'small-business-internet',
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      },
      expected: false,
    },
    {
      id: 'guest-internet',
      label: 'Gość → Internet',
      probe: {
        source: 'small-business-guest',
        destination: 'internet.example',
        protocol: 'ICMP',
        port: 0,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'phone-print',
      label: 'Telefon Wi-Fi → drukarka',
      probe: {
        source: 'small-business-phone',
        destination: 'drukarka.firma.test',
        protocol: 'TCP',
        port: 631,
        checkReply: true,
      },
      expected: true,
    },
  ],
};
