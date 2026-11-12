import type { Network, Probe } from '../model/networkTypes';
export type ExampleScenario = {
  id: string;
  label: string;
  probe: Probe;
  expected: boolean;
  why?: string;
};
export type ExampleSection = {
  label: string;
  target: string;
  tab?:
    'radius' | 'general' | 'ports' | 'acl' | 'nat' | 'routing' | 'networks' | 'interfaces' | 'dns';
};
export type NetworkExample = {
  id: string;
  name: string;
  description: string;
  category: 'Projekt' | 'Antywzorzec' | 'Ćwiczenie';
  level: string;
  objectives: string[];
  sections: ExampleSection[];
  create: () => Network;
  scenarios: ExampleScenario[];
  intentionalProblems?: boolean;
};
