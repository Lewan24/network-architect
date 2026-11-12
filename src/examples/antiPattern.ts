import { ExampleBuilder, allow, svc, token } from './exampleBuilder';
import type { NetworkExample } from './exampleTypes';
function build() {
  const b = new ExampleBuilder('anti-pattern', 'ANTYWZORZEC · działa, ale bez izolacji', [
    [10, 'Wszyscy w jednym VLAN-ie'],
  ]);
  b.endpoint('employee', 'workstation', 10, undefined, 170, 520, 'Pracownik');
  const files = b.endpoint('files', 'mini-server', 10, 20, 420, 700, 'Pliki i administracja', [
    svc(445, 'SMB'),
    svc(22, 'SSH'),
    svc(443, 'Panel'),
  ]);
  const ap = b.endpoint('guest-ap', 'accesspoint', 10, 2, 880, 520, 'AP gości w LAN');
  ap.ssid = 'Guest';
  const guest = b.host('guest', 'laptop', 10, undefined, 1100, 710, 'Gość z dostępem do LAN');
  b.connect(ap, guest, 10);
  b.endpoint('camera', 'camera', 10, 30, 690, 880, 'Kamera w sieci biurowej');
  b.endpoint('printer', 'printer', 10, 40, 160, 880, 'Drukarka w LAN');
  const dns = b.dns(10, 440, 500);
  dns.dnsRecords = [{ id: 'files', name: 'pliki.firma.test', deviceId: files.id }];
  b.fw.defaultAcl = 'allow';
  // A perimeter deny cannot stop same-VLAN frames that never traverse the firewall.
  b.fw.rules.unshift({
    id: 'false-sense-of-isolation',
    action: 'deny',
    source: token(guest),
    destination: token(files),
    protocol: 'ANY',
    port: '*',
    ingress: 'lan',
  });
  b.fw.portForwards = [
    {
      id: 'exposed-admin',
      protocol: 'TCP',
      externalIp: b.fw.wanIp!,
      externalPort: 2222,
      internalIp: files.ip,
      internalPort: 22,
      enabled: true,
    },
  ];
  allow(b.fw, '*', token(files), 'TCP', '22', 'wan');
  return b.finish(false);
}
export const antiPattern: NetworkExample = {
  id: 'anti-pattern',
  name: 'Antywzorzec · płaska i otwarta sieć',
  category: 'Antywzorzec',
  level: 'Analiza błędów',
  description:
    'Celowo zły projekt: goście i kamery obok plików, permit any, otwarty panel SSH, niewyłączone porty.',
  intentionalProblems: true,
  objectives: [
    'Zielony wynik testu może oznaczać naruszenie założeń bezpieczeństwa.',
    'ACL na brzegu nie zobaczy ramek przełączanych lokalnie w jednym VLAN-ie.',
    'Porównaj dostęp gościa z projektem małej firmy i laboratorium VLAN.',
  ],
  sections: [
    { label: 'Pozorna blokada gościa', target: 'anti-pattern-fw', tab: 'acl' },
    { label: 'Panel SSH z Internetu', target: 'anti-pattern-fw', tab: 'nat' },
    { label: 'Płaski VLAN i wolne gniazda', target: 'anti-pattern-core', tab: 'ports' },
  ],
  create: build,
  scenarios: [
    {
      id: 'guest-files',
      label: 'RYZYKO: gość → pliki SMB',
      probe: {
        source: 'anti-pattern-guest',
        destination: 'anti-pattern-files',
        protocol: 'TCP',
        port: 445,
        checkReply: true,
      },
      expected: true,
      why: 'Ruch pozostaje w VLAN 10 i omija regułę deny na firewallu.',
    },
    {
      id: 'camera-files',
      label: 'RYZYKO: kamera → panel plików',
      probe: {
        source: 'anti-pattern-camera',
        destination: 'anti-pattern-files',
        protocol: 'TCP',
        port: 443,
        checkReply: true,
      },
      expected: true,
    },
    {
      id: 'public-admin',
      label: 'RYZYKO: Internet → SSH 2222',
      probe: {
        source: 'anti-pattern-internet',
        destination: '203.0.113.10',
        protocol: 'TCP',
        port: 2222,
        checkReply: true,
      },
      expected: true,
    },
  ],
};
