import { createDemoNetwork, demoScenarios } from './demoNetwork';
import { smallBusiness } from './smallBusiness';
import { homeLab } from './homeLab';
import { enterprise } from './enterprise';
import { antiPattern } from './antiPattern';
import { miniLabs } from './miniLabs';
import type { NetworkExample } from './exampleTypes';
import type { Network } from '../model/networkTypes';
const examples: NetworkExample[] = [
  {
    id: 'infrastructure-lab',
    name: 'Biuro, serwery i Wi-Fi',
    description: 'Pracownicy i drukarka, Hyper-V/NPM, kamery PoE, izolacja gości i CCTV',
    category: 'Projekt',
    level: 'Średni',
    objectives: [
      'Zrozum relację VLAN, DHCP, DNS i ACL.',
      'Sprawdź drukowanie oraz kierunek połączeń NVR.',
    ],
    sections: [
      { label: 'Izolacja stref', target: 'demo-firewall', tab: 'acl' },
      { label: 'Budżet CCTV', target: 'demo-camera-switch', tab: 'ports' },
      { label: 'Drukarka', target: 'zone:60' },
    ],
    create: createDemoNetwork,
    scenarios: demoScenarios,
  },
  smallBusiness,
  homeLab,
  enterprise,
  antiPattern,
  ...miniLabs,
];
export const networkExamples: NetworkExample[] = examples.map((example) => {
  const prefix = example.id === 'infrastructure-lab' ? 'demo' : example.id;
  return {
    ...example,
    description: `${example.description} · Gałąź AAA, RACK, UPS i nowe urządzenia.`,
    objectives: [
      ...example.objectives,
      'Porównaj VLAN pracownika i administratora nadawany przez RADIUS; sprawdź montaż w szafie RACK.',
    ],
    sections: [
      ...example.sections,
      {
        label: 'RADIUS: użytkownicy, NAS i accounting',
        target: `${prefix}-aaa-radius`,
        tab: 'radius' as const,
      },
      {
        label: 'Laptop: logowanie Enterprise',
        target: `${prefix}-aaa-laptop`,
        tab: 'radius' as const,
      },
      { label: 'Szafa RACK i rozmieszczenie U', target: `${prefix}-aaa-rack` },
    ].filter(
      (section, i, sections) =>
        sections.findIndex((s) => s.target === section.target && s.tab === section.tab) === i,
    ),
    scenarios: [
      ...example.scenarios,
      ...(example.category === 'Projekt'
        ? [
            {
              id: 'aaa-admin-service',
              label: 'RADIUS: administrator → mini serwer HTTPS',
              probe: {
                source: `${prefix}-aaa-laptop`,
                destination: `${prefix}-aaa-mini`,
                protocol: 'TCP' as const,
                port: 443,
                checkReply: true,
              },
              expected: true,
              why: 'Access-Accept nadaje VLAN usługi; DHCP następuje po autoryzacji.',
            },
            {
              id: 'aaa-accounting',
              label: 'NAS → RADIUS · accounting UDP/1813',
              probe: {
                source: `${prefix}-aaa-ap`,
                destination: `${prefix}-aaa-radius`,
                protocol: 'UDP' as const,
                port: 1813,
                checkReply: true,
              },
              expected: true,
            },
            {
              id: 'aaa-iot-deny',
              label: 'RADIUS nie zastępuje ACL: IoT → mini serwer',
              probe: {
                source: `${prefix}-aaa-iot`,
                destination: `${prefix}-aaa-mini`,
                protocol: 'TCP' as const,
                port: 443,
                checkReply: true,
              },
              expected: false,
              why: 'Poprawne logowanie nie nadaje dostępu do innych stref bez zezwolenia w ACL.',
            },
          ]
        : []),
    ],
  };
});
export function exampleFor(network: Network) {
  return (
    networkExamples.find((e) => e.id === network.exampleId) ||
    (!network.exampleId && network.devices.some((d) => d.id === 'demo-docker')
      ? networkExamples[0]
      : undefined)
  );
}
