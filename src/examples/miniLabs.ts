import { reconcileDhcp } from '../model/dhcp';
import { ExampleBuilder, allow, svc, token } from './exampleBuilder';
import type { NetworkExample } from './exampleTypes';
export type LabTopic = 'segmentation' | 'trunk' | 'acl' | 'dhcp' | 'nat' | 'poe' | 'radius';
export const labNames: Record<LabTopic, string> = {
  segmentation: 'VLAN i granica L2',
  trunk: 'Trunk i allowed VLAN',
  acl: 'VLAN a uprawnienia ACL',
  dhcp: 'DHCP i DNS',
  nat: 'NAT a publikacja usług',
  poe: 'PoE: moc PSE i PD',
  radius: 'RADIUS: logowanie i dynamiczny VLAN',
};
export function miniLab(topic: LabTopic, fixed: boolean): NetworkExample {
  const id = `lesson-${topic}-${fixed ? 'fixed' : 'broken'}`;
  const create = () => {
    const b = new ExampleBuilder(id, `${labNames[topic]} · ${fixed ? 'rozwiązanie' : 'problem'}`, [
      [10, 'Klient'],
      [20, 'Usługa'],
    ]);
    const source = b.endpoint(
      'client',
      'laptop',
      10,
      topic === 'dhcp' || topic === 'radius' ? undefined : 10,
      160,
      500,
      'Klient',
    );
    const service = b.endpoint(
      'service',
      topic === 'poe' ? 'camera' : 'mini-server',
      topic === 'segmentation' && !fixed ? 10 : 20,
      20,
      1000,
      500,
      topic === 'poe' ? 'Kamera PoE' : 'Serwer usługi',
      [svc(443, 'HTTPS'), svc(22, 'Panel SSH')],
    );
    b.fw.defaultAcl = topic === 'acl' && !fixed ? 'allow' : 'deny';
    allow(b.fw, token(source), token(service), 'TCP', '443');
    if (topic !== 'segmentation' && topic !== 'acl')
      allow(b.fw, token(source), token(service), 'TCP', '22');
    if (topic === 'trunk' && !fixed) {
      const wire = b.network.links.find((l) => l.a === b.fw.id && l.b === b.core.id)!;
      const port = b.core.ports!.find((p) => p.id === wire.bPortId)!;
      port.allowedVlans = [99, 10];
    }
    if (topic === 'dhcp') {
      const dns = b.dns(20, 1190, 690);
      dns.dnsRecords = [{ id: 'app', name: 'app.lab.test', deviceId: service.id }];
      for (const p of ['TCP', 'UDP'] as const) allow(b.fw, token(source), token(dns), p, '53');
      if (!fixed) b.network.vlans.find((v) => v.id === 10)!.dhcpEnabled = false;
    }
    if (topic === 'nat') {
      b.fw.portForwards = [
        {
          id: 'https',
          protocol: 'TCP',
          externalIp: b.fw.wanIp!,
          externalPort: 443,
          internalIp: service.ip,
          internalPort: 443,
          enabled: true,
        },
        ...(!fixed
          ? [
              {
                id: 'bad-admin',
                protocol: 'TCP' as const,
                externalIp: b.fw.wanIp!,
                externalPort: 2222,
                internalIp: service.ip,
                internalPort: 22,
                enabled: true,
              },
            ]
          : []),
      ];
      allow(b.fw, '*', token(service), 'TCP', '443', 'wan');
      if (!fixed) allow(b.fw, '*', token(service), 'TCP', '22', 'wan');
    }
    if (topic === 'poe') {
      service.powerSource = 'poe';
      service.powerWatts = 12;
      b.core.poeBudgetWatts = fixed ? 30 : 10;
      const wire = b.network.links.find((l) => l.b === service.id)!;
      b.core.ports!.find((p) => p.id === wire.aPortId)!.poe = 'at';
    }
    const result = b.finish();
    if (topic === 'radius') {
      const radius = result.devices.find((d) => d.id === `${id}-aaa-radius`)!;
      const nas = result.devices.find((d) => d.id === `${id}-core`)!;
      const client = result.devices.find((d) => d.id === `${id}-client`)!;
      nas.radiusNas = {
        serverId: radius.id,
        secret: 'lesson-secret',
        dynamicVlan: true,
        accounting: true,
      };
      radius.radius!.clients.push({ nasId: nas.id, secret: 'lesson-secret' });
      radius.radius!.users.push({
        id: 'student',
        username: 'student',
        password: 'vlan-demo',
        enabled: true,
        authorized: true,
        vlan: 20,
        role: 'Laboratorium',
        allowedNasIds: [nas.id],
      });
      const wire = result.links.find((l) => l.a === nas.id && l.b === client.id)!;
      nas.ports!.find((p) => p.id === wire.aPortId)!.dot1x = true;
      client.supplicant = { username: 'student', password: fixed ? 'vlan-demo' : 'bledne-haslo' };
      for (const port of [1812, 1813]) allow(b.fw, token(nas), token(radius), 'UDP', String(port));
      return reconcileDhcp(result);
    }
    return result;
  };
  const expected = topic === 'segmentation' || topic === 'acl' || topic === 'nat' ? !fixed : fixed;
  const probe =
    topic === 'nat'
      ? {
          source: `${id}-internet`,
          destination: '203.0.113.10',
          protocol: 'TCP' as const,
          port: 2222,
          checkReply: true,
        }
      : {
          source: `${id}-client`,
          destination: topic === 'dhcp' ? 'app.lab.test' : `${id}-service`,
          protocol: 'TCP' as const,
          port: topic === 'segmentation' || topic === 'acl' ? 22 : 443,
          checkReply: true,
        };
  return {
    id,
    name: `${labNames[topic]} · ${fixed ? 'poprawnie' : 'błąd'}`,
    description: fixed
      ? 'Poprawiony wariant do porównania i własnych zmian.'
      : 'Celowo błędna konfiguracja. Najpierw przewidź wynik testu.',
    category: 'Ćwiczenie',
    level: 'Krok po kroku',
    objectives: [],
    sections: [
      ...(topic === 'radius'
        ? [
            {
              label: 'Konta i polityki RADIUS',
              target: `${id}-aaa-radius`,
              tab: 'radius' as const,
            },
            { label: 'Profil logowania klienta', target: `${id}-client`, tab: 'radius' as const },
          ]
        : []),
      { label: 'Reguły zapory', target: `${id}-fw`, tab: topic === 'nat' ? 'nat' : 'acl' },
      { label: 'Porty i trunk', target: `${id}-core`, tab: 'ports' },
      { label: 'Adresacja i DHCP', target: 'zone:10' },
      ...(topic !== 'radius'
        ? [{ label: 'Konta i polityki RADIUS', target: `${id}-aaa-radius`, tab: 'radius' as const }]
        : []),
      { label: 'Laptop gałęzi AAA', target: `${id}-aaa-laptop`, tab: 'radius' as const },
      { label: 'Szafa RACK i rozmieszczenie U', target: `${id}-aaa-rack` },
    ],
    intentionalProblems: !fixed,
    create,
    scenarios: [
      {
        id: 'lesson-test',
        label: 'Test problemu / rozwiązania',
        probe,
        expected,
        why: expected
          ? fixed
            ? 'Usługa jest osiągalna po naprawie zależności.'
            : 'Połączenie działa, ale ujawnia niepożądany dostęp.'
          : fixed
            ? 'Połączenie jest celowo blokowane przez poprawną politykę.'
            : 'Brak łączności wynika z błędnej konfiguracji.',
      },
      ...(['segmentation', 'acl', 'nat'].includes(topic)
        ? [
            {
              id: 'https-control',
              label: 'Kontrola: HTTPS pozostaje dostępny',
              probe:
                topic === 'nat'
                  ? {
                      source: `${id}-internet`,
                      destination: '203.0.113.10',
                      protocol: 'TCP' as const,
                      port: 443,
                      checkReply: true,
                    }
                  : {
                      source: `${id}-client`,
                      destination: `${id}-service`,
                      protocol: 'TCP' as const,
                      port: 443,
                      checkReply: true,
                    },
              expected: true,
            },
          ]
        : []),
    ],
  };
}
export const miniLabs = (Object.keys(labNames) as LabTopic[]).flatMap((topic) => [
  miniLab(topic, false),
  miniLab(topic, true),
]);
