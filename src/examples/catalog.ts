import { createDemoNetwork, demoScenarios } from './demoNetwork';
import { smallBusiness } from './smallBusiness';
import { homeLab } from './homeLab';
import { enterprise } from './enterprise';
import { antiPattern } from './antiPattern';
import { miniLabs } from './miniLabs';
import type { NetworkExample } from './exampleTypes';
import type { Network } from '../model/networkTypes';
export const networkExamples: NetworkExample[] = [
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
export function exampleFor(network: Network) {
  return (
    networkExamples.find((e) => e.id === network.exampleId) ||
    (!network.exampleId && network.devices.some((d) => d.id === 'demo-docker')
      ? networkExamples[0]
      : undefined)
  );
}
