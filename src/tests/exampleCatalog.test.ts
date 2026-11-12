import { describe, expect, it } from 'vitest';
import { networkExamples } from '../examples/catalog';
import { parseNetwork } from '../model/network';
import { diagnoseNetwork } from '../model/diagnostics';
import { simulateNetwork } from '../simulation/networkEngine';

describe('learning example catalog', () => {
  it('has unique identifiers and isolated factories', () => {
    expect(new Set(networkExamples.map((e) => e.id)).size).toBe(networkExamples.length);
    for (const example of networkExamples) {
      const a = example.create(),
        b = example.create();
      a.devices[0].online = false;
      expect(b.devices[0].online, example.id).toBe(true);
      expect(b.exampleId).toBe(example.id);
    }
  });
  for (const example of networkExamples) {
    it(`${example.id}: imports its actual port/IP/service configuration`, () => {
      const n = example.create();
      expect(parseNetwork(JSON.stringify(n))).toEqual(n);
    });
    if (!example.intentionalProblems)
      it(`${example.id}: has no diagnostic issues`, () => {
        expect(diagnoseNetwork(example.create())).toEqual([]);
      });
    for (const scenario of example.scenarios)
      it(`${example.id}: ${scenario.label}`, () => {
        const n = example.create();
        expect(n.devices.some((d) => d.id === scenario.probe.source)).toBe(true);
        if (!scenario.probe.destination.includes('.'))
          expect(
            n.devices.some((d) => d.id === scenario.probe.destination),
            scenario.probe.destination,
          ).toBe(true);
        const result = simulateNetwork(n, scenario.probe);
        if (!scenario.expected && example.category === 'Projekt')
          expect(result.reason).toContain('ACL');
        expect(result.ok, `${result.reason}\n${result.steps.join('\n')}`).toBe(scenario.expected);
        if (result.ok && scenario.probe.checkReply)
          expect(result.returnPath?.at(-1)).toBe(scenario.probe.source);
        if (example.id === 'enterprise' && scenario.id === 'database')
          expect(result.path).toEqual(
            expect.arrayContaining(['enterprise-fw', 'enterprise-vault-fw']),
          );
        if (example.id === 'anti-pattern' && scenario.id === 'guest-files')
          expect(result.path).not.toContain('anti-pattern-fw');
      });
  }
});

it('links every teaching section to an existing device or network', () => {
  for (const example of networkExamples) {
    const n = example.create();
    for (const section of example.sections) {
      expect(
        section.target.startsWith('zone:')
          ? n.vlans.some((v) => v.id === Number(section.target.slice(5)))
          : n.devices.some((d) => d.id === section.target),
        `${example.id}: ${section.label}`,
      ).toBe(true);
    }
  }
});
it('preserves bounded example provenance without trusting it as network configuration', () => {
  const n = networkExamples[1].create();
  expect(parseNetwork(JSON.stringify(n)).exampleId).toBe('small-business');
  expect(() => parseNetwork(JSON.stringify({ ...n, exampleId: { bad: true } }))).toThrow();
  expect(() => parseNetwork(JSON.stringify({ ...n, exampleId: 'x'.repeat(101) }))).toThrow();
});
